/**
 * @module @covora/server/routes/runs
 *
 * "Süreçler" (pipeline) yönetim uç noktaları (studio; kullanıcı JWT'siyle
 * korunur). Run listesi, run detayı, log akışı, canlı olay akışı (SSE) ve
 * kuyruktaki run'ı iptal.
 */

import type {
  ReviewKind,
  ReviewOutcome,
  ReviewRun,
  RuleResult,
  RunLogLine,
  RunSummary
} from '@covora/types'
import type { FastifyInstance } from 'fastify'

import type { RunEventBus } from '../services/events.js'
import { streamRunEvents } from './sse.js'

/** Run yönetim route bağımlılıkları. */
export interface RunRoutesDeps {
  readonly bus: RunEventBus
  /** Projeyi anahtarına göre bulur (opsiyonel filtre). */
  readonly findProjectByKey: (key: string) => Promise<{ readonly id: string } | null>
  /** Run'ları (opsiyonel proje filtresiyle) listeler. */
  readonly listRuns: (options: {
    readonly projectId?: string
    readonly limit?: number
  }) => Promise<readonly RunSummary[]>
  /** Bir run'ın tam görünümünü getirir. */
  readonly getRun: (runId: string) => Promise<ReviewRun | null>
  /** Bir run'ın loglarını getirir. */
  readonly getRunLogs: (runId: string, afterSeq?: number) => Promise<readonly RunLogLine[]>
  /** Kuyruktaki bir run'ı iptal eder. */
  readonly cancelRun: (runId: string) => Promise<boolean>
  /** Bir run'ın saklı review girdisini (ekran görüntüsü / dosyalar) getirir. */
  readonly getRunInput: (
    runId: string
  ) => Promise<{ readonly kind: ReviewKind; readonly input: unknown } | null>
  /** Bir run'ın ürettiği review'ın raporunu (kural sonuçları + tam döküm) getirir. */
  readonly getRunReport: (runId: string) => Promise<{
    readonly reviewId: string
    readonly results: readonly RuleResult[]
    readonly outcome: ReviewOutcome | null
  } | null>
}

/**
 * Run yönetim route'larını kaydeder.
 *
 * @param app - Fastify örneği.
 * @param deps - Run bağımlılıkları.
 */
export const registerRunRoutes = (app: FastifyInstance, deps: RunRoutesDeps): void => {
  app.get('/runs', async (request, reply) => {
    const query = request.query as { projectKey?: string; limit?: string }
    let projectId: string | undefined
    if (typeof query.projectKey === 'string' && query.projectKey.length > 0) {
      const project = await deps.findProjectByKey(query.projectKey)
      if (project === null) {
        return reply.status(404).send({ error: `Proje bulunamadı: ${query.projectKey}` })
      }
      projectId = project.id
    }
    const limit = query.limit !== undefined ? Number(query.limit) : undefined
    const runs = await deps.listRuns({
      ...(projectId !== undefined ? { projectId } : {}),
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {})
    })
    return reply.send({ runs })
  })

  app.get('/runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const run = await deps.getRun(id)
    if (run === null) {
      return reply.status(404).send({ error: 'Run bulunamadı' })
    }
    return reply.send(run)
  })

  app.get('/runs/:id/logs', async (request, reply) => {
    const { id } = request.params as { id: string }
    const query = request.query as { afterSeq?: string }
    const afterSeq = query.afterSeq !== undefined ? Number(query.afterSeq) : undefined
    const logs = await deps.getRunLogs(
      id,
      afterSeq !== undefined && Number.isFinite(afterSeq) ? afterSeq : undefined
    )
    return reply.send({ logs })
  })

  app.get('/runs/:id/input', async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await deps.getRunInput(id)
    if (data === null) {
      return reply.status(404).send({ error: 'Run bulunamadı' })
    }
    return reply.send(data)
  })

  app.get('/runs/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string }
    const report = await deps.getRunReport(id)
    if (report === null) {
      return reply.status(404).send({ error: 'Bu run henüz bir sonuç üretmedi' })
    }
    return reply.send(report)
  })

  app.get('/runs/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string }
    await streamRunEvents(request, reply, deps, id)
  })

  app.post('/runs/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string }
    const cancelled = await deps.cancelRun(id)
    if (!cancelled) {
      return reply.status(409).send({ error: 'Run kuyrukta değil; iptal edilemez' })
    }
    return reply.status(204).send()
  })
}
