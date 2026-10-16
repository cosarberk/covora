/**
 * @module @covora/types/checker
 *
 * Yerleşik deterministik checker kataloğu sözleşmesi. Deterministik ve ArchUnit
 * kuralları bir checker'a `key` ile bağlanır; kullanıcının bu anahtarı tahmin
 * etmesi yerine, kural oluştururken bu katalogdan seçim yapması sağlanır.
 */

import { z } from 'zod'

import { reviewKindSchema, reviewScopeSchema } from './rule.js'

/** Katalogdaki tek bir yerleşik checker'ın tanıtıcı bilgisi. */
export const checkerInfoSchema = z.object({
  /** Kural `key`'i olarak kullanılacak kararlı anahtar (checker'a bağlar). */
  key: z.string().min(1),
  /** Okunabilir başlık (kural başlığı için öneri). */
  title: z.string().min(1),
  /** Checker'ın ne kontrol ettiğinin açıklaması. */
  description: z.string(),
  /** Hangi review türü için (ui/code). */
  kind: reviewKindSchema,
  /** Kapsam: changes (normal deterministik) | project (ArchUnit). */
  scope: reviewScopeSchema
})

/** {@link checkerInfoSchema} tip çıkarımı. */
export type CheckerInfo = z.infer<typeof checkerInfoSchema>
