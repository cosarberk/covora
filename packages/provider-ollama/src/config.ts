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
  /** İstek zaman aşımı (ms). CPU çıkarımı yavaş olabileceği için yüksek. */
  timeoutMs: z.number().positive().default(120000)
})

/** Ayrıştırılmış (varsayılanları uygulanmış) yapılandırma. */
export type OllamaProviderConfig = z.infer<typeof ollamaProviderConfigSchema>

/** {@link createOllamaProvider} tarafından kabul edilen ham yapılandırma girdisi. */
export type OllamaProviderInput = z.input<typeof ollamaProviderConfigSchema>
