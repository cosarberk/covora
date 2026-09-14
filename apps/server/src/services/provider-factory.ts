/**
 * @module @covora/server/services/provider-factory
 *
 * Review türüne göre uygun LLM sağlayıcısını üreten fabrika. UI ve code için
 * ayrı Ollama endpoint/model yapılandırması kullanılır.
 */

import type { LlmProvider } from '@covora/core'
import type { ReviewKind } from '@covora/types'
import { createOllamaProvider } from '@covora/provider-ollama'

import type { Env } from '../config/env.js'

/**
 * Ortam yapılandırmasından bir sağlayıcı fabrikası üretir.
 *
 * @param env - Sunucu ortam yapılandırması.
 * @returns Review türüne göre {@link LlmProvider} döndüren fonksiyon.
 */
export const createProviderFactory =
  (env: Env) =>
  (kind: ReviewKind): LlmProvider =>
    kind === 'ui'
      ? createOllamaProvider({
          baseUrl: env.OLLAMA_UI_BASE_URL,
          model: env.OLLAMA_UI_MODEL,
          kind: 'ui'
        })
      : createOllamaProvider({
          baseUrl: env.OLLAMA_CODE_BASE_URL,
          model: env.OLLAMA_CODE_MODEL,
          kind: 'code'
        })
