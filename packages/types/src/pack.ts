/**
 * @module @covora/types/pack
 *
 * Review Pack: bir kural/prompt koleksiyonu (tür: ui/code). Projeler bir veya
 * birden çok pack'e abone olur; review, projenin pack'lerindeki kuralları
 * değerlendirir. ESLint shareable config mantığı.
 */

import { z } from 'zod'

import { reviewKindSchema } from './rule.js'

/** Review pack. */
export const packSchema = z.object({
  /** Kalıcılık kimliği. */
  id: z.string().min(1),
  /** Kararlı anahtar (paylaşım/eşleşme için). */
  key: z.string().min(1),
  /** Okunabilir ad. */
  name: z.string().min(1),
  /** Açıklama. */
  description: z.string(),
  /** Pack türü: ui ya da code. */
  kind: reviewKindSchema,
  /** Covora ile gelen yerleşik pack mi (silinemez). */
  builtin: z.boolean()
})

/** {@link packSchema} tip çıkarımı. */
export type Pack = z.infer<typeof packSchema>
