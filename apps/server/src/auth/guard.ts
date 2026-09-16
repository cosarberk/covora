/**
 * @module @covora/server/auth/guard
 *
 * Fastify preHandler guard'ları: yönetim uç noktaları için kullanıcı JWT'si,
 * review ingest için proje bazlı gizli token.
 */

import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'

import { verifyJwt, type JwtPayload } from './jwt.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Doğrulanmış kullanıcı (yalnızca korunan yönetim route'larında). */
    user?: JwtPayload
  }
}

/**
 * Kullanıcı JWT guard'ı üretir. `Authorization: Bearer <token>` doğrular ve
 * `request.user`'ı doldurur.
 *
 * @param secret - JWT imzalama anahtarı.
 * @returns preHandler hook.
 */
export const makeUserGuard = (secret: string): preHandlerHookHandler => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null
    const payload = token === null ? null : verifyJwt(token, secret)
    if (payload === null) {
      return reply.status(401).send({ error: 'Yetkisiz' })
    }
    request.user = payload
  }
}

/** İngest guard bağımlılıkları. */
export interface IngestGuardDeps {
  /** Proje anahtarından ingest token'ı çözer (proje yoksa null). */
  readonly resolveIngestToken: (projectKey: string) => Promise<string | null>
}

/**
 * Review ingest guard'ı üretir. İstek gövdesindeki `projectKey`'e ait gizli
 * token'ı `x-covora-token` başlığıyla karşılaştırır.
 *
 * @param deps - Token çözücü.
 * @returns preHandler hook.
 */
export const makeIngestGuard = (deps: IngestGuardDeps): preHandlerHookHandler => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { projectKey?: unknown } | undefined
    const projectKey = typeof body?.projectKey === 'string' ? body.projectKey : null
    if (projectKey === null) {
      return reply.status(400).send({ error: 'projectKey gerekli' })
    }
    const headerToken = request.headers['x-covora-token']
    const given = typeof headerToken === 'string' ? headerToken : null
    if (given === null) {
      return reply.status(401).send({ error: 'x-covora-token gerekli' })
    }
    const expected = await deps.resolveIngestToken(projectKey)
    if (expected === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${projectKey}` })
    }
    if (given !== expected) {
      return reply.status(401).send({ error: 'Geçersiz ingest token' })
    }
  }
}
