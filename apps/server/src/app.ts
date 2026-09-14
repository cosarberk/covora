/**
 * @module @covora/server/app
 *
 * Fastify uygulamasının kurulumu ve route kaydı. Bağımlılıklar dışarıdan
 * verilir; böylece test ve bootstrap ayrışır.
 */

import Fastify, { type FastifyInstance } from 'fastify'

import { registerHealthRoutes } from './routes/health.js'
import { registerReviewRoutes } from './routes/reviews.js'
import type { CreateReviewDeps } from './services/review.service.js'

/** Uygulama bağımlılıkları. */
export interface AppDeps {
  /** Review servisi bağımlılıkları. */
  readonly reviewDeps: CreateReviewDeps
}

/**
 * Fastify uygulamasını oluşturur ve route'ları kaydeder.
 *
 * @param deps - Uygulama bağımlılıkları.
 * @returns Yapılandırılmış Fastify örneği.
 */
export const buildApp = (deps: AppDeps): FastifyInstance => {
  const app = Fastify({ logger: true })

  registerHealthRoutes(app)
  registerReviewRoutes(app, deps.reviewDeps)

  return app
}
