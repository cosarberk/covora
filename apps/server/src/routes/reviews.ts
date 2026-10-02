/**
 * @module @covora/server/routes/reviews
 *
 * Review ingest uç noktaları (SDK/pipeline; proje token'ıyla korunur). Review
 * artık kuyruğa alınır: `POST /reviews` anında `runId` döner; istemci run'ı
 * `GET /reviews/:runId` ile yoklayabilir ya da `GET /reviews/:runId/events`
 * ile canlı izleyebilir.
 */

import { reviewInputSchema, type ReviewRun, type RunLogLine } from '@covora/types'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { RunEventBus } from '../services/events.js'
import {
  enqueueReview,
  ProjectNotFoundError,
  type EnqueueReviewDeps
} from '../services/review.service.js'
import { streamRunEvents } from './sse.js'

/** POST /reviews istek gövdesi şeması. */
const createReviewBodySchema = z.object({
  projectKey: z.string().min(1),
  codeHash: z.string().min(1),
  input: reviewInputSchema
})

/** Review route bağımlılıkları. */
export interface ReviewRoutesDeps extends EnqueueReviewDeps {
  /** Bir run'ın loglarını getirir (SSE anlık görüntüsü için). */
  readonly getRunLogs: (runId: string) => Promise<readonly RunLogLine[]>
}

/** Query'den projectKey okur (guard doğrular; burada eşleştirme için). */
const projectKeyOf = (request: { query: unknown }): string | null => {
  const query = request.query as { projectKey?: unknown }
  return typeof query.projectKey === 'string' ? query.projectKey : null
}

/** Run'ın, istekteki projectKey'e ait olduğunu doğrular. */
const ownsRun = (run: ReviewRun, projectKey: string | null): boolean =>
  projectKey !== null && run.projectKey === projectKey

/**
 * Review ingest route'larını kaydeder.
 *
 * @param app - Fastify örneği.
 * @param deps - Review servisi bağımlılıkları.
 */
export const registerReviewRoutes = (app: FastifyInstance, deps: ReviewRoutesDeps): void => {
  app.post('/reviews', async (request, reply) => {
    const parsed = createReviewBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    try {
      const result = await enqueueReview(deps, parsed.data)
      return reply.status(202).send(result)
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.status(404).send({ error: error.message })
      }
      throw error
    }
  })

  app.get('/reviews/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string }
    const run = await deps.getRun(runId)
    if (run === null || !ownsRun(run, projectKeyOf(request))) {
      return reply.status(404).send({ error: 'Run bulunamadı' })
    }
    return reply.send(run)
  })

  app.get('/reviews/:runId/events', async (request, reply) => {
    const { runId } = request.params as { runId: string }
    const run = await deps.getRun(runId)
    if (run === null || !ownsRun(run, projectKeyOf(request))) {
      return reply.status(404).send({ error: 'Run bulunamadı' })
    }
    await streamRunEvents(request, reply, deps, runId)
  })
}
