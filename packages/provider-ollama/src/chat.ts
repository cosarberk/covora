/**
 * @module @covora/provider-ollama/chat
 *
 * İnteraktif review sohbeti. Checklist doldurmaktan farklı olarak serbest
 * metin döndürür (structured output yok); kullanıcı ekranı gösterip konuşarak
 * inceleme yapar.
 */

import type { ChatMessage } from '@covora/types'

import { callOllamaChat } from './client.js'
import { ollamaProviderConfigSchema, type OllamaProviderInput } from './config.js'
import type { OllamaMessage } from './prompt.js'

/** Ollama tabanlı sohbet arayüzü. */
export interface OllamaChat {
  /**
   * Sohbet geçmişini modele gönderir ve asistan yanıtını döner.
   *
   * @param messages - Sohbet mesajları (system/user/assistant, opsiyonel görüntü).
   * @returns Asistanın metin yanıtı.
   */
  send(messages: readonly ChatMessage[]): Promise<string>
}

/**
 * Ollama tabanlı bir sohbet istemcisi oluşturur.
 *
 * @param config - Sağlayıcı yapılandırması.
 * @returns {@link OllamaChat}.
 */
export const createOllamaChat = (config: OllamaProviderInput): OllamaChat => {
  const resolvedConfig = ollamaProviderConfigSchema.parse(config)

  return {
    async send(messages) {
      const ollamaMessages: OllamaMessage[] = messages.map((message) =>
        message.images !== undefined
          ? { role: message.role, content: message.content, images: message.images }
          : { role: message.role, content: message.content }
      )
      return callOllamaChat(resolvedConfig, ollamaMessages)
    }
  }
}
