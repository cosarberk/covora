/**
 * @module @covora/server/config/env
 *
 * Ortam değişkenlerinin şema ile doğrulanması. Yapılandırma koda gömülü
 * değildir; tamamı buradan okunur.
 */

import { z } from 'zod'

/** Sunucu ortam değişkenleri şeması. */
const envSchema = z.object({
  /** HTTP portu. */
  PORT: z.coerce.number().positive().default(4000),
  /** Postgres bağlantı adresi. */
  DATABASE_URL: z.string().min(1),
  /** UI (vision) review için Ollama adresi. */
  OLLAMA_UI_BASE_URL: z.url(),
  /** UI review modeli (örn. qwen3-vl:8b). */
  OLLAMA_UI_MODEL: z.string().min(1),
  /** Code review için Ollama adresi. */
  OLLAMA_CODE_BASE_URL: z.url(),
  /** Code review modeli. */
  OLLAMA_CODE_MODEL: z.string().min(1),
  /** JWT imzalama anahtarı (en az 16 karakter). */
  COVORA_AUTH_SECRET: z.string().min(16),
  /** İlk kurulumda oluşturulacak admin e-postası (opsiyonel). */
  COVORA_ADMIN_EMAIL: z.string().min(1).optional(),
  /** İlk kurulumda oluşturulacak admin parolası (opsiyonel). */
  COVORA_ADMIN_PASSWORD: z.string().min(1).optional()
})

/** Doğrulanmış ortam yapılandırması. */
export type Env = z.infer<typeof envSchema>

/**
 * Ortam değişkenlerini doğrular ve yapılandırmayı döner.
 *
 * @param source - Okunacak kaynak (varsayılan `process.env`).
 * @returns Doğrulanmış {@link Env}.
 * @throws Zorunlu değişkenler eksik/geçersizse.
 */
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => envSchema.parse(source)
