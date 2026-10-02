/**
 * @module @covora/server/services/worker
 *
 * Review kuyruğu worker'ı. DB-destekli kuyruktan işleri atomik olarak kapar,
 * eşzamanlılık limitine uyar ve her run'ı core yürütücüsüyle (DB+yayın sink'i
 * üzerinden) koşturur. Kuyruk boşken aralıklarla yoklar. Tek sunuda birden çok
 * worker eşzamanlı güvenle çalışır (claim yarış-korumalı).
 */

import { executeReviewRun, type CheckerRegistry, type LlmProvider } from '@covora/core'
import {
  claimNextQueued,
  getRun,
  linkReview,
  saveReview,
  type EffectiveConfig
} from '@covora/db'
import { reviewInputSchema, type ReviewKind, type Rule } from '@covora/types'
import type { PrismaClient } from '@covora/db'

import type { RunEventBus } from './events.js'
import type { ReviewNotification } from './notifications.js'
import { createDbRunSink } from './run-sink.js'

/** {@link startWorker} bağımlılıkları. */
export interface WorkerDeps {
  readonly prisma: PrismaClient
  readonly bus: RunEventBus
  /** Review türüne göre sağlayıcı çözer. */
  readonly resolveProvider: (kind: ReviewKind) => Promise<LlmProvider>
  /** Projenin etkin kurallarını getirir. */
  readonly listEnabledRules: (projectId: string, kind: ReviewKind) => Promise<readonly Rule[]>
  /** Projenin etkin yapılandırmasını getirir. */
  readonly getEffectiveConfig: (projectId: string) => Promise<EffectiveConfig>
  /** Aynı tür için son review skorunu getirir (regresyon karşılaştırması). */
  readonly getLatestScore: (projectId: string, kind: ReviewKind) => Promise<number | null>
  /** Review tamamlandığında bildirim tetikler (ateşle-unut; opsiyonel). */
  readonly notify?: (payload: ReviewNotification) => void
  /** Deterministik kurallar için checker kaydı (opsiyonel). */
  readonly checkers?: CheckerRegistry
  /** Aynı anda işlenecek en fazla run (varsayılan 1 — CPU çıkarımını korur). */
  readonly concurrency?: number
  /** Kuyruk boşken yoklama aralığı (ms, varsayılan 1000). */
  readonly pollIntervalMs?: number
}

/** Çalışan worker tutamacı. */
export interface Worker {
  /** Worker'ı durdurur (yeni iş almaz; süren işler tamamlanır). */
  stop(): void
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Worker döngüsünü başlatır.
 *
 * @param deps - Worker bağımlılıkları.
 * @returns Durdurma tutamacı.
 */
export const startWorker = (deps: WorkerDeps): Worker => {
  const concurrency = deps.concurrency ?? 1
  const pollIntervalMs = deps.pollIntervalMs ?? 1000
  let active = 0
  let running = true

  const process = async (
    run: { id: string; projectId: string; projectKey: string; kind: ReviewKind; codeHash: string; input: unknown }
  ): Promise<void> => {
    const sink = createDbRunSink({ prisma: deps.prisma, bus: deps.bus }, run.id)

    const parsed = reviewInputSchema.safeParse(run.input)
    if (!parsed.success) {
      await sink.runStarted()
      await sink.log('error', 'Geçersiz review girdisi; run başarısız', 'ingest')
      await sink.runFinished('failed', { delta: null, error: 'Geçersiz review girdisi' })
      const failed = await getRun(deps.prisma, run.id)
      if (failed !== null) {
        deps.bus.publish({ type: 'run.finished', run: failed })
      }
      return
    }

    const input = parsed.data

    try {
      const [rules, config] = await Promise.all([
        deps.listEnabledRules(run.projectId, run.kind),
        deps.getEffectiveConfig(run.projectId)
      ])
      const provider = await deps.resolveProvider(run.kind)
      const previousScore = await deps.getLatestScore(run.projectId, run.kind)

      const persistReview = async (
        outcome: Parameters<typeof saveReview>[1]['outcome'],
        delta: number | null
      ): Promise<string> => {
        const reviewId = await saveReview(deps.prisma, {
          projectId: run.projectId,
          kind: run.kind,
          codeHash: run.codeHash,
          outcome,
          delta
        })
        await linkReview(deps.prisma, run.id, reviewId)
        return reviewId
      }

      const notify = deps.notify
      await executeReviewRun({
        rules,
        input,
        provider,
        config: config.coverageConfig,
        policy: config.gatePolicy,
        previousScore,
        sink,
        persistReview,
        ...(deps.checkers !== undefined ? { checkers: deps.checkers } : {}),
        ...(notify !== undefined
          ? {
              notify: (args) =>
                notify({
                  projectId: run.projectId,
                  projectKey: run.projectKey,
                  kind: run.kind,
                  reviewId: args.reviewId,
                  score: args.outcome.coverage.score,
                  level: args.outcome.coverage.level,
                  delta: args.delta,
                  gatePassed: args.outcome.gate.passed,
                  regressed: args.regressed,
                  reasons: args.outcome.gate.reasons
                })
            }
          : {})
      })
    } catch (error) {
      // Yürütücü hataları kendi içinde ele alır; bu bir güvenlik ağı.
      await sink.log('error', `Beklenmeyen hata: ${errorMessage(error)}`, 'ingest')
      await sink.runFinished('failed', { delta: null, error: errorMessage(error) })
    }

    const full = await getRun(deps.prisma, run.id)
    if (full !== null) {
      deps.bus.publish({ type: 'run.finished', run: full })
    }
  }

  const tick = async (): Promise<void> => {
    while (running && active < concurrency) {
      const claimed = await claimNextQueued(deps.prisma)
      if (claimed === null) {
        break
      }
      active += 1
      void process(claimed).finally(() => {
        active -= 1
      })
    }
  }

  const interval = setInterval(() => {
    void tick()
  }, pollIntervalMs)
  void tick()

  return {
    stop() {
      running = false
      clearInterval(interval)
    }
  }
}
