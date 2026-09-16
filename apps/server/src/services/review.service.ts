/**
 * @module @covora/server/services/review
 *
 * Review orkestrasyonu servis katmanı. Bağımlılıklar (veri erişimi, sağlayıcı)
 * dışarıdan enjekte edilir; bu sayede servis saf ve test edilebilirdir.
 */

import { runReview, type CheckerRegistry, type LlmProvider } from '@covora/core'
import type { EffectiveConfig, SaveReviewInput } from '@covora/db'
import type { ReviewInput, ReviewKind, ReviewOutcome, Rule } from '@covora/types'

import type { ReviewNotification } from './notifications.js'

/** Proje bulunamadığında fırlatılır. */
export class ProjectNotFoundError extends Error {
  public constructor(public readonly projectKey: string) {
    super(`Proje bulunamadı: ${projectKey}`)
    this.name = 'ProjectNotFoundError'
  }
}

/** {@link createReview} bağımlılıkları. */
export interface CreateReviewDeps {
  /** Projeyi anahtarına göre bulur. */
  readonly findProjectByKey: (key: string) => Promise<{ readonly id: string } | null>
  /** Projenin etkin kurallarını getirir. */
  readonly listEnabledRules: (projectId: string, kind: ReviewKind) => Promise<readonly Rule[]>
  /** Projenin etkin yapılandırmasını getirir. */
  readonly getEffectiveConfig: (projectId: string) => Promise<EffectiveConfig>
  /** Review türüne göre sağlayıcı üretir (DB'deki aktif sağlayıcı, yoksa env). */
  readonly createProvider: (kind: ReviewKind) => Promise<LlmProvider>
  /** Aynı tür için son review skorunu getirir (regresyon karşılaştırması). */
  readonly getLatestScore: (projectId: string, kind: ReviewKind) => Promise<number | null>
  /** Review sonucunu kaydeder ve kimliğini döner. */
  readonly saveReview: (input: SaveReviewInput) => Promise<string>
  /** Review tamamlandığında bildirim tetikler (ateşle-unut; opsiyonel). */
  readonly notify?: (payload: ReviewNotification) => void
  /** Deterministik kurallar için checker kaydı (opsiyonel). */
  readonly checkers?: CheckerRegistry
}

/** Review oluşturma isteği. */
export interface CreateReviewRequest {
  /** Proje anahtarı. */
  readonly projectKey: string
  /** Review girdisi (ekran görüntüsü ya da kaynak dosyalar). */
  readonly input: ReviewInput
  /** Review edilen kodun/durumun hash'i. */
  readonly codeHash: string
}

/** Review sonucu ve kalıcılaştırılan kaydın kimliği. */
export interface CreateReviewResult extends ReviewOutcome {
  /** Kaydedilen review kimliği. */
  readonly reviewId: string
  /** Önceki aynı tür review'a göre skor farkı (ilk review'da null). */
  readonly delta: number | null
}

/**
 * Bir review'ı uçtan uca çalıştırır: kuralları ve yapılandırmayı yükler,
 * değerlendirir, coverage/gate hesaplar ve sonucu kaydeder.
 *
 * @param deps - Enjekte edilen bağımlılıklar.
 * @param request - Review isteği.
 * @returns Coverage, gate ve kaydedilen review kimliği.
 * @throws {@link ProjectNotFoundError} Proje bulunamazsa.
 */
export const createReview = async (
  deps: CreateReviewDeps,
  request: CreateReviewRequest
): Promise<CreateReviewResult> => {
  const project = await deps.findProjectByKey(request.projectKey)
  if (project === null) {
    throw new ProjectNotFoundError(request.projectKey)
  }

  const [rules, config] = await Promise.all([
    deps.listEnabledRules(project.id, request.input.kind),
    deps.getEffectiveConfig(project.id)
  ])

  const provider = await deps.createProvider(request.input.kind)

  const [baseOutcome, previousScore] = await Promise.all([
    runReview({
      rules,
      input: request.input,
      provider,
      config: config.coverageConfig,
      policy: config.gatePolicy,
      ...(deps.checkers !== undefined ? { checkers: deps.checkers } : {})
    }),
    deps.getLatestScore(project.id, request.input.kind)
  ])

  // Regresyon: önceki aynı tür review'a göre skor düşüşü. Politika izin
  // veriyorsa gate'i bloklar (merge engellenir).
  const delta = previousScore === null ? null : baseOutcome.coverage.score - previousScore
  const policy = config.gatePolicy
  const isRegression = delta !== null && delta <= -policy.regressionThreshold

  const outcome: ReviewOutcome =
    isRegression && policy.blockOnRegression
      ? {
          ...baseOutcome,
          gate: {
            passed: false,
            reasons: [
              ...baseOutcome.gate.reasons,
              `Coverage regresyonu: skor ${(delta as number).toFixed(1)} puan düştü (eşik ${policy.regressionThreshold})`
            ]
          }
        }
      : baseOutcome

  const reviewId = await deps.saveReview({
    projectId: project.id,
    kind: request.input.kind,
    codeHash: request.codeHash,
    outcome,
    delta
  })

  // Bildirimleri ateşle-unut: review yanıtını bloklamaz.
  deps.notify?.({
    projectId: project.id,
    projectKey: request.projectKey,
    kind: request.input.kind,
    reviewId,
    score: outcome.coverage.score,
    level: outcome.coverage.level,
    delta,
    gatePassed: outcome.gate.passed,
    regressed: isRegression,
    reasons: outcome.gate.reasons
  })

  return { ...outcome, reviewId, delta }
}
