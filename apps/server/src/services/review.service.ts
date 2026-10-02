/**
 * @module @covora/server/services/review
 *
 * Review kuyruğa-alma servisi. Review artık senkron yürütülmez; bir `ReviewRun`
 * olarak kuyruğa alınır ve worker tarafından asenkron işlenir. Bu servis run'ı
 * yaratır, kuyruk sırasını hesaplar ve `run.created` olayını yayınlar.
 */

import type { ReviewInput, ReviewRun } from '@covora/types'

import type { RunEventBus } from './events.js'

/** Proje bulunamadığında fırlatılır. */
export class ProjectNotFoundError extends Error {
  public constructor(public readonly projectKey: string) {
    super(`Proje bulunamadı: ${projectKey}`)
    this.name = 'ProjectNotFoundError'
  }
}

/** {@link enqueueReview} bağımlılıkları. */
export interface EnqueueReviewDeps {
  /** Projeyi anahtarına göre bulur. */
  readonly findProjectByKey: (key: string) => Promise<{ readonly id: string } | null>
  /** Yeni bir run'ı kuyruğa alır (adımları tohumlar). */
  readonly createRun: (input: {
    readonly projectId: string
    readonly kind: ReviewInput['kind']
    readonly codeHash: string
    readonly input: ReviewInput
  }) => Promise<{ readonly id: string }>
  /** Bir run'ın kuyruktaki sırasını getirir. */
  readonly getQueuePosition: (runId: string) => Promise<number | undefined>
  /** Bir run'ın tam görünümünü getirir. */
  readonly getRun: (runId: string) => Promise<ReviewRun | null>
  /** Canlı olay veri yolu. */
  readonly bus: RunEventBus
}

/** Review kuyruğa-alma isteği. */
export interface EnqueueReviewRequest {
  readonly projectKey: string
  readonly input: ReviewInput
  readonly codeHash: string
}

/** Kuyruğa-alma yanıtı. */
export interface EnqueueReviewResult {
  readonly runId: string
  readonly status: 'queued'
  readonly queuePosition?: number
}

/**
 * Bir review'ı kuyruğa alır.
 *
 * @param deps - Enjekte edilen bağımlılıklar.
 * @param request - Review isteği.
 * @returns Run kimliği ve kuyruk sırası.
 * @throws {@link ProjectNotFoundError} Proje bulunamazsa.
 */
export const enqueueReview = async (
  deps: EnqueueReviewDeps,
  request: EnqueueReviewRequest
): Promise<EnqueueReviewResult> => {
  const project = await deps.findProjectByKey(request.projectKey)
  if (project === null) {
    throw new ProjectNotFoundError(request.projectKey)
  }

  const { id } = await deps.createRun({
    projectId: project.id,
    kind: request.input.kind,
    codeHash: request.codeHash,
    input: request.input
  })

  const [queuePosition, run] = await Promise.all([deps.getQueuePosition(id), deps.getRun(id)])
  if (run !== null) {
    deps.bus.publish({ type: 'run.created', run })
  }

  return { runId: id, status: 'queued', ...(queuePosition !== undefined ? { queuePosition } : {}) }
}
