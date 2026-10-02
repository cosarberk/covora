/**
 * @module @covora/provider-ollama/client
 *
 * Ollama `/api/chat` uç noktasıyla konuşan ince HTTP istemcisi. `node:http`
 * tabanlı {@link postJson} kullanır: fetch'in kapatılamayan gizli header zaman
 * aşımı olmadığından, CPU'da model soğuk yüklenirken bağlantı kesilmez.
 */

import { z } from 'zod'

import type { OllamaProviderConfig } from './config.js'
import { postJson } from './http.js'
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
  const data = await postJson(
    `${config.baseUrl.replace(/\/$/, '')}/api/chat`,
    {
      model: config.model,
      messages,
      stream: false,
      ...(format !== undefined ? { format } : {})
    },
    { timeoutMs: config.timeoutMs }
  )
  return ollamaChatResponseSchema.parse(data).message.content
}
