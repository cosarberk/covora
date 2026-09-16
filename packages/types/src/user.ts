/**
 * @module @covora/types/user
 *
 * Studio kullanıcısı. Kimlik doğrulama (JWT) ve yetki için kullanılır. Parola
 * hash'i asla domain modeline çıkmaz; yalnızca sunucu tarafında tutulur.
 */

import { z } from 'zod'

/** Kullanıcı rolü. Şimdilik tek rol; ileride genişletilebilir. */
export const userRoleSchema = z.enum(['admin'])

/** {@link userRoleSchema} tip çıkarımı. */
export type UserRole = z.infer<typeof userRoleSchema>

/** Studio kullanıcısı (parola hash'i hariç genel gösterim). */
export const userSchema = z.object({
  /** Kalıcılık kimliği. */
  id: z.string().min(1),
  /** E-posta (giriş kimliği). */
  email: z.string().min(1),
  /** Yetki rolü. */
  role: userRoleSchema
})

/** {@link userSchema} tip çıkarımı. */
export type User = z.infer<typeof userSchema>
