/**
 * @module @covora/server/routes/reviews
 *
 * Review uç noktaları.
 */

import { reviewInputSchema } from '@covora/types'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import {
  createReview,
  ProjectNotFoundError,
  type CreateReviewDeps
} from '../services/review.service.js'

/** POST /reviews istek gövdesi şeması. */
const createReviewBodySchema = z.object({
  projectKey: z.string().min(1),
  codeHash: z.string().min(1),
  input: reviewInputSchema
})

/**
 * Review route'larını kaydeder.
 *
 * @param app - Fastify örneği.
 * @param deps - Review servisi bağımlılıkları.
 */
export const registerReviewRoutes = (app: FastifyInstance, deps: CreateReviewDeps): void => {
  app.post('/reviews', async (request, reply) => {
    const parsed = createReviewBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }

    try {
      const result = await createReview(deps, parsed.data)
      return reply.status(201).send(result)
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.status(404).send({ error: error.message })
      }
      throw error
    }
  })
}
