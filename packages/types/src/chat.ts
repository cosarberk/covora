/**
 * @module @covora/types/chat
 *
 * İnteraktif review sohbeti (ekranı konuşarak inceleme) için mesaj
 * sözleşmeleri.
 */

import { z } from 'zod'

/** Sohbet mesajının rolü. */
export const chatRoleSchema = z.enum(['system', 'user', 'assistant'])

/** {@link chatRoleSchema} tip çıkarımı. */
export type ChatRole = z.infer<typeof chatRoleSchema>

/**
 * Tek bir sohbet mesajı. `images`, base64 kodlu ekran görüntülerini taşır
 * (vision destekli sohbet için).
 */
export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z.string(),
  images: z.array(z.string()).optional()
})

/** {@link chatMessageSchema} tip çıkarımı. */
export type ChatMessage = z.infer<typeof chatMessageSchema>
