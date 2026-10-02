/**
 * @module @covora/provider-ollama/client
 *
 * Ollama `/api/chat` uç noktasıyla konuşan ince HTTP istemcisi.
 */

import { z } from 'zod'

import type { OllamaProviderConfig } from './config.js'
import type { OllamaMessage } from './prompt.js'

/** Ollama sohbet yanıtının ilgilendiğimiz kısmı. */
const ollamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string()
  })
})

/**
 * Ollama sohbet uç noktasına tek seferlik (stream'siz) bir istek yapar ve
 * modelin ürettiği içeriği döner.
 *
 * @param config - Sağlayıcı yapılandırması.
 * @param messages - Gönderilecek sohbet mesajları.
 * @param format - Structured output için JSON şeması.
 * @returns Model yanıtının içerik metni.
 * @throws İstek başarısız olursa (HTTP hatası, zaman aşımı, geçersiz yanıt).
 */
export const callOllamaChat = async (
  config: OllamaProviderConfig,
  messages: readonly OllamaMessage[],
  format?: unknown
): Promise<string> => {
  // timeoutMs <= 0 ise zaman aşımı kurulmaz: AI (ör. CPU'da soğuk model yüklemesi)
  // cevap verene kadar beklenir. Review asenkron olduğu için bu HTTP'yi bloklamaz.
  const controller = new AbortController()
  const timer =
    config.timeoutMs > 0
      ? setTimeout(() => {
          controller.abort()
        }, config.timeoutMs)
      : undefined

  try {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        ...(format !== undefined ? { format } : {})
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`Ollama isteği başarısız: ${response.status} ${response.statusText}`)
    }

    const parsed = ollamaChatResponseSchema.parse(await response.json())
    return parsed.message.content
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}
