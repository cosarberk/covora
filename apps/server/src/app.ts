/**
 * @module @covora/server/app
 *
 * Fastify uygulamasının kurulumu ve route kaydı. Bağımlılıklar dışarıdan
 * verilir; böylece test ve bootstrap ayrışır.
 */

import Fastify, { type FastifyInstance } from 'fastify'

import { registerHealthRoutes } from './routes/health.js'
import { registerManagementRoutes } from './routes/management.js'
import { registerReviewRoutes } from './routes/reviews.js'
import type { ManagementDeps } from './services/management.js'
import type { CreateReviewDeps } from './services/review.service.js'

/** Uygulama bağımlılıkları. */
export interface AppDeps {
  /** Review servisi bağımlılıkları. */
  readonly reviewDeps: CreateReviewDeps
  /** Yönetim (studio) bağımlılıkları. */
  readonly managementDeps: ManagementDeps
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
  registerManagementRoutes(app, deps.managementDeps)

  return app
}
