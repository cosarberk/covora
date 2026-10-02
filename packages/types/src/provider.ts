/**
 * @module @covora/types/provider
 *
 * Review sağlayıcısı (model backend) sözleşmesi. Ollama yalnızca **varsayılan**
 * bir sağlayıcı türüdür; mimari türe bağlı değildir. OpenAI-uyumlu uç noktalar
 * (vLLM, llama.cpp server, TGI, LM Studio vb.) aynı kontratla eklenir. Her
 * review türü (ui/code) için bir aktif sağlayıcı kullanılır.
 */

import { z } from 'zod'

import { reviewKindSchema } from './rule.js'

/**
 * Sağlayıcı türü. Yeni bir tür eklemek yalnızca bir adapter yazmayı gerektirir;
 * çekirdek ve şema değişmez.
 * - `ollama`: Ollama `/api/chat` protokolü (varsayılan).
 * - `openai-compatible`: OpenAI `/v1/chat/completions` protokolü (vLLM,
 *   llama.cpp server, TGI, LM Studio ve benzeri geniş bir ekosistem).
 */
export const providerTypeSchema = z.enum(['ollama', 'openai-compatible'])

/** {@link providerTypeSchema} tip çıkarımı. */
export type ProviderType = z.infer<typeof providerTypeSchema>

/**
 * Bir sağlayıcının yetenekleri. Hangi girdi türlerini işleyebildiğini belirtir;
 * UI review için `vision` zorunludur.
 */
export const providerCapabilitiesSchema = z.object({
  /** Görsel (ekran görüntüsü) girdisini işleyebilir mi (UI review için gerekli). */
  vision: z.boolean(),
  /** Metin (kaynak kod) girdisini işleyebilir mi (code review için gerekli). */
  text: z.boolean()
})

/** {@link providerCapabilitiesSchema} tip çıkarımı. */
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>

/**
 * Kayıtlı bir review sağlayıcısı (studio'dan yönetilir). Gizli bilgiler (API
 * anahtarı) bu okuma modelinde taşınmaz; yalnızca varlığı `hasApiKey` ile
 * belirtilir.
 */
export const providerConfigSchema = z.object({
  /** Kalıcılık kimliği. */
  id: z.string().min(1),
  /** Okunabilir ad. */
  name: z.string().min(1),
  /** Sağlayıcı türü (varsayılan `ollama`). */
  providerType: providerTypeSchema.default('ollama'),
  /** Hangi review türü için (ui/code). */
  kind: reviewKindSchema,
  /** Sunucu adresi (örn. http://ollama:11434 ya da http://vllm:8000/v1). */
  baseUrl: z.string().min(1),
  /** Model etiketi (örn. qwen3-vl:8b). */
  model: z.string().min(1),
  /** Sağlayıcının yetenekleri. */
  capabilities: providerCapabilitiesSchema,
  /** Kimlik doğrulama anahtarı tanımlı mı (değerin kendisi asla dönülmez). */
  hasApiKey: z.boolean().default(false),
  /** Bu tür için aktif sağlayıcı mı. */
  active: z.boolean()
})

/** {@link providerConfigSchema} tip çıkarımı. */
export type ProviderConfig = z.infer<typeof providerConfigSchema>

/**
 * Bir sağlayıcının anlık sağlık/gözlemlenebilirlik görünümü. "AI Sağlayıcılar"
 * panelindeki detay dashboard'u bunu tüketir: erişilebilir mi, model yüklü mü,
 * şu an meşgul mü, son hata ne.
 */
export const providerHealthSchema = z.object({
  /** İlgili sağlayıcının kimliği. */
  providerId: z.string().min(1),
  /** Uç noktaya ulaşılabildi mi. */
  reachable: z.boolean(),
  /** Model bellekte yüklü mü (sağlayıcı bildirebiliyorsa). */
  modelLoaded: z.boolean().optional(),
  /** Sağlayıcı şu an bir istek işliyor mu (biliniyorsa). */
  busy: z.boolean().optional(),
  /** Uç noktada mevcut/yüklü model etiketleri (biliniyorsa). */
  models: z.array(z.string()).optional(),
  /** Sağlık kontrolünün gecikmesi (ms). */
  latencyMs: z.number().nonnegative().optional(),
  /** Son kontrol zamanı (ISO). */
  checkedAt: z.string().min(1),
  /** Son hata özeti (erişilemiyorsa). */
  error: z.string().optional()
})

/** {@link providerHealthSchema} tip çıkarımı. */
export type ProviderHealth = z.infer<typeof providerHealthSchema>
