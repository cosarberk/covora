/**
 * @module @covora/server/auth/jwt
 *
 * Küçük, bağımlılıksız JWT (HS256) imzalama/doğrulama. `node:crypto` HMAC-SHA256
 * kullanır. Harici JWT kütüphanesi eklenmez (CJS/ESM interop riskini önler).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Token içine gömülen taşıyıcı bilgi. */
export interface JwtPayload {
  /** Kullanıcı kimliği (subject). */
  readonly sub: string
  /** E-posta. */
  readonly email: string
  /** Rol. */
  readonly role: string
}

interface SignedPayload extends JwtPayload {
  readonly iat: number
  readonly exp: number
}

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url')

const sign = (data: string, secret: string): string =>
  createHmac('sha256', secret).update(data).digest('base64url')

/**
 * Bir payload'ı imzalar.
 *
 * @param payload - Kullanıcı bilgisi.
 * @param secret - İmzalama anahtarı.
 * @param ttlSeconds - Geçerlilik süresi (saniye, varsayılan 7 gün).
 * @returns İmzalı JWT.
 */
export const signJwt = (
  payload: JwtPayload,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7
): string => {
  const now = Math.floor(Date.now() / 1000)
  const body: SignedPayload = { ...payload, iat: now, exp: now + ttlSeconds }
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify(body))
  const signature = sign(`${header}.${claims}`, secret)
  return `${header}.${claims}.${signature}`
}

/**
 * Bir JWT'yi doğrular ve payload'ı döner.
 *
 * @param token - JWT.
 * @param secret - İmzalama anahtarı.
 * @returns Geçerliyse payload, değilse `null`.
 */
export const verifyJwt = (token: string, secret: string): JwtPayload | null => {
  const [header, claims, signature] = token.split('.')
  if (header === undefined || claims === undefined || signature === undefined) {
    return null
  }
  const expected = sign(`${header}.${claims}`, secret)
  const given = Buffer.from(signature)
  const want = Buffer.from(expected)
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null
  }
  try {
    const parsed = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')) as SignedPayload
    if (typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null
    }
    return { sub: parsed.sub, email: parsed.email, role: parsed.role }
  } catch {
    return null
  }
}
