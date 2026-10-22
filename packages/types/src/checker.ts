/**
 * @module @covora/types/checker
 *
 * Yerleşik deterministik checker kataloğu sözleşmesi. Deterministik ve ArchUnit
 * kuralları bir checker'a `key` ile bağlanır; kullanıcının bu anahtarı tahmin
 * etmesi yerine, kural oluştururken bu katalogdan seçim yapması sağlanır.
 */

import { z } from 'zod'

import { reviewKindSchema, reviewScopeSchema } from './rule.js'

/**
 * Bir checker'ın baktığı programlama dili(leri). `'*'` dilden bağımsız demektir
 * (ör. hardcoded secret, TODO) ve tüm dosyalarda çalışır; diğerleri yalnızca
 * ilgili uzantılı dosyalara bakar (Python projesi gönderilirse TS/JS checker'ı
 * eşleşen dosya bulamaz, sessizce atlar).
 */
export const checkerLanguageSchema = z.enum([
  '*',
  'ts',
  'js',
  'py',
  'go',
  'java',
  'csharp'
])

/** {@link checkerLanguageSchema} tip çıkarımı. */
export type CheckerLanguage = z.infer<typeof checkerLanguageSchema>

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
  scope: reviewScopeSchema,
  /** Hangi dil(ler)e bakar; `['*']` dilden bağımsız. */
  languages: z.array(checkerLanguageSchema).min(1).default(['*'])
})

/** {@link checkerInfoSchema} tip çıkarımı. */
export type CheckerInfo = z.infer<typeof checkerInfoSchema>
