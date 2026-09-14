/**
 * @module @covora/server/routes/chat
 *
 * İnteraktif review sohbeti uç noktası. Durum client'ta tutulur; her istekte
 * tüm mesaj geçmişi gönderilir (sunucu stateless).
 */

import { chatMessageSchema, type ChatMessage } from '@covora/types'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const chatBodySchema = z.object({
  messages: z.array(chatMessageSchema).min(1)
})

/** Sohbet route bağımlılıkları. */
export interface ChatDeps {
  /** Mesaj geçmişini modele gönderir ve yanıtı döner. */
  readonly sendChat: (messages: readonly ChatMessage[]) => Promise<string>
}

/**
 * Sohbet route'unu kaydeder.
 *
 * @param app - Fastify örneği.
 * @param deps - Sohbet bağımlılıkları.
 */
export const registerChatRoutes = (app: FastifyInstance, deps: ChatDeps): void => {
  app.post('/chat', async (request, reply) => {
    const parsed = chatBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    const answer = await deps.sendChat(parsed.data.messages)
    return reply.send({ reply: answer })
  })
}
