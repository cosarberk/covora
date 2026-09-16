/**
 * @module @covora/types/provider
 *
 * LLM sağlayıcı yapılandırması (studio'dan yönetilen). Her review türü (ui/code)
 * için bir aktif sağlayıcı kullanılır.
 */

import { z } from 'zod'

import { reviewKindSchema } from './rule.js'

/** Kayıtlı bir LLM sağlayıcısı. */
export const providerConfigSchema = z.object({
  /** Kalıcılık kimliği. */
  id: z.string().min(1),
  /** Okunabilir ad. */
  name: z.string().min(1),
  /** Hangi review türü için (ui/code). */
  kind: reviewKindSchema,
  /** Ollama sunucu adresi. */
  baseUrl: z.string().min(1),
  /** Model etiketi (örn. qwen3-vl:8b). */
  model: z.string().min(1),
  /** Bu tür için aktif sağlayıcı mı. */
  active: z.boolean()
})

/** {@link providerConfigSchema} tip çıkarımı. */
export type ProviderConfig = z.infer<typeof providerConfigSchema>
