/**
 * @module @covora/server/services/provider-factory
 *
 * Review türüne göre uygun {@link LlmProvider}'ı çözen genel fabrika. Tek
 * doğruluk kaynağı DB'dir: Studio → "AI Sağlayıcılar" sayfasından kaydedilen
 * aktif sağlayıcı, türüne göre doğru adapter (`ollama` ya da `openai-compatible`)
 * ile kurulur. Aktif sağlayıcı yoksa, çağrıldığında net bir hata fırlatan bir
 * sağlayıcı döner; böylece review'ın AI adımı çökmeden `degraded`'a düşer
 * (deterministik kurallar yine çalışır). Hiçbir sağlayıcı koda/env'e gömülü
 * değildir — Ollama dahil hiçbir tür ayrıcalıklı değildir.
 */

import type { LlmProvider } from '@covora/core'
import type { ActiveProviderRuntime } from '@covora/db'
import type { ReviewKind } from '@covora/types'
import { createOllamaProvider } from '@covora/provider-ollama'

import { createOpenAiProvider } from './providers/openai.js'

/** {@link createProviderResolver} bağımlılıkları. */
export interface ProviderResolverDeps {
  /** Verilen tür için DB'deki aktif sağlayıcının çalışma-zamanı görünümü. */
  readonly getActiveProviderRuntime: (kind: ReviewKind) => Promise<ActiveProviderRuntime | null>
}

/** Bir çalışma-zamanı sağlayıcı görünümünden somut bir {@link LlmProvider} kurar. */
const buildProvider = (kind: ReviewKind, runtime: ActiveProviderRuntime): LlmProvider => {
  if (runtime.providerType === 'openai-compatible') {
    return createOpenAiProvider({
      baseUrl: runtime.baseUrl,
      model: runtime.model,
      kind,
      apiKey: runtime.apiKey
    })
  }
  return createOllamaProvider({ baseUrl: runtime.baseUrl, model: runtime.model, kind })
}

/**
 * Aktif sağlayıcı olmadığında kullanılan sağlayıcı: AI adımı çağrıldığında net
 * bir hata fırlatır (run `degraded` olur; deterministik kurallar etkilenmez).
 */
const unconfiguredProvider = (kind: ReviewKind): LlmProvider => ({
  kind,
  fillChecklist() {
    return Promise.reject(
      new Error(
        `${kind} türü için aktif AI sağlayıcısı yok. Studio → "AI Sağlayıcılar" sayfasından ekleyip aktifleştirin.`
      )
    )
  }
})

/**
 * Bir sağlayıcı çözücü üretir.
 *
 * @param deps - Aktif sağlayıcı erişimi.
 * @returns Review türüne göre {@link LlmProvider} döndüren asenkron fonksiyon.
 */
export const createProviderResolver =
  (deps: ProviderResolverDeps) =>
  async (kind: ReviewKind): Promise<LlmProvider> => {
    const runtime = await deps.getActiveProviderRuntime(kind)
    return runtime === null ? unconfiguredProvider(kind) : buildProvider(kind, runtime)
  }
