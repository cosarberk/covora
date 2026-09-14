/**
 * @module @covora/server/routes/health
 *
 * Sağlık kontrolü uç noktası.
 */

import type { FastifyInstance } from 'fastify'

/**
 * Sağlık kontrolü route'unu kaydeder.
 *
 * @param app - Fastify örneği.
 */
export const registerHealthRoutes = (app: FastifyInstance): void => {
  app.get('/health', async () => ({ status: 'ok' }))
}
