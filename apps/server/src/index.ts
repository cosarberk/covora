/**
 * @module @covora/server
 *
 * Covora review sunucusunun giriş noktası. Bu iskelet adımında yalnızca
 * sağlık kontrolü uç noktasını sunar; kural motoru, review uç noktaları ve
 * LLM sağlayıcı entegrasyonları sonraki adımlarda eklenecektir.
 */

import Fastify, { type FastifyInstance } from 'fastify'

const DEFAULT_PORT = 4000

/**
 * Fastify sunucusunu oluşturur ve temel uç noktaları kaydeder.
 *
 * @returns Yapılandırılmış Fastify örneği.
 */
const buildServer = (): FastifyInstance => {
  const app = Fastify({ logger: true })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}

/**
 * Sunucuyu yapılandırılan port üzerinde dinlemeye başlatır.
 */
const start = async (): Promise<void> => {
  const app = buildServer()
  const port = Number(process.env.PORT ?? DEFAULT_PORT)

  try {
    await app.listen({ port, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void start()
