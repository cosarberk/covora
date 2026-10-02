/**
 * @module @covora/provider-ollama/config
 *
 * Ollama sağlayıcı yapılandırması.
 */

import { reviewKindSchema } from '@covora/types'
import { z } from 'zod'

/** Ollama sağlayıcısının yapılandırma şeması. */
export const ollamaProviderConfigSchema = z.object({
  /** Ollama sunucusunun temel adresi (örn. http://uzak-sunucu:11434). */
  baseUrl: z.url(),
  /** Kullanılacak model etiketi (örn. `qwen3-vl:8b`). */
  model: z.string().min(1),
  /** Bu sağlayıcının işlediği review türü. */
  kind: reviewKindSchema,
  /** İstek zaman aşımı (ms). 0 = zaman aşımı yok (AI cevap verene kadar bekle). */
  timeoutMs: z.number().nonnegative().default(120000)
})

/** Ayrıştırılmış (varsayılanları uygulanmış) yapılandırma. */
export type OllamaProviderConfig = z.infer<typeof ollamaProviderConfigSchema>

/** {@link createOllamaProvider} tarafından kabul edilen ham yapılandırma girdisi. */
export type OllamaProviderInput = z.input<typeof ollamaProviderConfigSchema>
