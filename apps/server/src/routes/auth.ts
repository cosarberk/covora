/**
 * @module @covora/server/routes/auth
 *
 * Kimlik doğrulama uç noktaları: giriş (JWT üretir) ve mevcut kullanıcı.
 */

import type { User } from '@covora/types'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { signJwt } from '../auth/jwt.js'

/** Auth route bağımlılıkları. */
export interface AuthDeps {
  /** E-posta + parolayı doğrular; geçerliyse kullanıcıyı döner. */
  readonly authenticate: (email: string, password: string) => Promise<User | null>
  /** JWT imzalama anahtarı. */
  readonly secret: string
}

const loginBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1)
})

/**
 * Auth route'larını kaydeder. `/auth/login` herkese açıktır; `/auth/me`
 * korunan kapsamda çağrılmalıdır (request.user dolu olur).
 *
 * @param app - Fastify örneği (public kapsam).
 * @param deps - Auth bağımlılıkları.
 */
export const registerAuthRoutes = (app: FastifyInstance, deps: AuthDeps): void => {
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    const user = await deps.authenticate(parsed.data.email, parsed.data.password)
    if (user === null) {
      return reply.status(401).send({ error: 'E-posta ya da parola hatalı' })
    }
    const token = signJwt({ sub: user.id, email: user.email, role: user.role }, deps.secret)
    return reply.send({ token, user })
  })
}
