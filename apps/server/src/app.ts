/**
 * @module @covora/server/app
 *
 * Fastify uygulamasının kurulumu ve route kaydı. Bağımlılıklar dışarıdan
 * verilir; böylece test ve bootstrap ayrışır.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'

import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerChatRoutes, type ChatDeps } from './routes/chat.js'
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
  /** İnteraktif sohbet bağımlılıkları. */
  readonly chatDeps: ChatDeps
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
  registerChatRoutes(app, deps.chatDeps)

  // Studio (React) statik dosyalarını aynı sunucudan serve et (tek image).
  // Dizin yoksa (geliştirmede studio ayrı Vite sunucusu) atlanır.
  const studioDir = process.env.STUDIO_DIR ?? path.resolve('apps/studio/dist')
  if (existsSync(studioDir)) {
    void app.register(fastifyStatic, { root: studioDir })
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html')
      }
      return reply.status(404).send({ error: 'Bulunamadı' })
    })
  }

  return app
}
