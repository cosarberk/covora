/**
 * @module @covora/server/auth/password
 *
 * Parola hash'leme ve doğrulama. `node:crypto` scrypt kullanır; harici
 * bağımlılık yoktur. Hash formatı: `scrypt$<saltHex>$<hashHex>`.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const KEY_LENGTH = 64

/**
 * Parolayı rastgele salt ile hash'ler.
 *
 * @param password - Ham parola.
 * @returns `scrypt$salt$hash` biçiminde saklanabilir hash.
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

/**
 * Ham parolayı saklanan hash ile sabit zamanlı karşılaştırır.
 *
 * @param password - Ham parola.
 * @param stored - `hashPassword` çıktısı.
 * @returns Eşleşiyorsa `true`.
 */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, salt, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || salt === undefined || hashHex === undefined) {
    return false
  }
  const expected = Buffer.from(hashHex, 'hex')
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}
