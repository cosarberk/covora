/**
 * @module @covora/server/services/review
 *
 * Review orkestrasyonu servis katmanı. Bağımlılıklar (veri erişimi, sağlayıcı)
 * dışarıdan enjekte edilir; bu sayede servis saf ve test edilebilirdir.
 */

import { runReview, type LlmProvider } from '@covora/core'
import type { EffectiveConfig, SaveReviewInput } from '@covora/db'
import type { ReviewInput, ReviewKind, ReviewOutcome, Rule } from '@covora/types'

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
  /** Review türüne göre sağlayıcı üretir. */
  readonly createProvider: (kind: ReviewKind) => LlmProvider
  /** Review sonucunu kaydeder ve kimliğini döner. */
  readonly saveReview: (input: SaveReviewInput) => Promise<string>
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

  const provider = deps.createProvider(request.input.kind)

  const outcome = await runReview({
    rules,
    input: request.input,
    provider,
    config: config.coverageConfig,
    policy: config.gatePolicy
  })

  const reviewId = await deps.saveReview({
    projectId: project.id,
    kind: request.input.kind,
    codeHash: request.codeHash,
    outcome
  })

  return { ...outcome, reviewId }
}
