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
  /**
   * AI sağlayıcıları (Ollama / OpenAI-uyumlu) artık ortamdan değil, Studio →
   * "AI Sağlayıcılar" sayfasından DB'ye kaydedilir ve oradan yönetilir. Bu
   * yüzden sunucunun açılması için hiçbir sağlayıcı değişkeni gerekmez.
   */
  /** JWT imzalama anahtarı (en az 16 karakter). */
  COVORA_AUTH_SECRET: z.string().min(16),
  /** İlk kurulumda oluşturulacak admin e-postası (opsiyonel). */
  COVORA_ADMIN_EMAIL: z.string().min(1).optional(),
  /** İlk kurulumda oluşturulacak admin parolası (opsiyonel). */
  COVORA_ADMIN_PASSWORD: z.string().min(1).optional(),
  /**
   * CORS'a izin verilen origin'ler (virgülle ayrılmış). Mock-shell/pipeline gibi
   * farklı origin'lerden gelen review/chat istekleri için. Boş ya da `*` = tümü.
   */
  COVORA_CORS_ORIGINS: z.string().optional(),
  /**
   * Review worker'ının aynı anda işleyeceği en fazla run sayısı. CPU çıkarımını
   * korumak için varsayılan 1'dir (seri). Güçlü/çok-GPU sağlayıcılarda artırılabilir.
   */
  COVORA_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  /**
   * LLM isteği zaman aşımı (ms). **0 = zaman aşımı yok** (AI cevap verene kadar
   * bekle) — varsayılan budur. Review asenkron (worker) olduğu için uzun bekleme
   * HTTP'yi bloklamaz. CPU'da model soğuk yüklenirken bağlantıyı kesmemek, Ollama
   * yüklemesinin iptal edilip kısır döngüye girmesini önler. Bir üst sınır
   * istenirse ms cinsinden pozitif bir değer verilir.
   */
  COVORA_LLM_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(0)
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
