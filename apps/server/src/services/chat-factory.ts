/**
 * @module @covora/server/services/chat-factory
 *
 * İnteraktif sohbet için sağlayıcı-agnostik gönderici. Aktif **ui** sağlayıcısını
 * DB'den çözer ve türüne göre (ollama / openai-uyumlu) sohbet backend'ini kurar.
 * Aktif sağlayıcı yoksa net bir hata fırlatır; bu, chat route'unda 503 olarak
 * kullanıcıya iletilir. Ollama hiçbir yerde ayrıcalıklı/gömülü değildir.
 */

import type { ActiveProviderRuntime } from '@covora/db'
import type { ChatMessage, ReviewKind } from '@covora/types'
import { createOllamaChat } from '@covora/provider-ollama'

import { createOpenAiChat } from './providers/openai.js'

/** Aktif sağlayıcı yapılandırılmadığında fırlatılır. */
export class NoChatProviderError extends Error {
  public constructor() {
    super('Sohbet için aktif UI sağlayıcısı yok. Studio → "AI Sağlayıcılar" sayfasından ekleyin.')
    this.name = 'NoChatProviderError'
  }
}

/** {@link createChatSender} bağımlılıkları. */
export interface ChatFactoryDeps {
  readonly getActiveProviderRuntime: (kind: ReviewKind) => Promise<ActiveProviderRuntime | null>
}

/**
 * Aktif ui sağlayıcısına göre mesaj geçmişini gönderen bir fonksiyon üretir.
 *
 * @param deps - Aktif sağlayıcı erişimi.
 * @returns `(messages) => Promise<string>` sohbet göndericisi.
 */
export const createChatSender =
  (deps: ChatFactoryDeps) =>
  async (messages: readonly ChatMessage[]): Promise<string> => {
    const runtime = await deps.getActiveProviderRuntime('ui')
    if (runtime === null) {
      throw new NoChatProviderError()
    }
    if (runtime.providerType === 'openai-compatible') {
      return createOpenAiChat({
        baseUrl: runtime.baseUrl,
        model: runtime.model,
        apiKey: runtime.apiKey
      }).send(messages)
    }
    return createOllamaChat({ baseUrl: runtime.baseUrl, model: runtime.model, kind: 'ui' }).send(
      messages
    )
  }
