/**
 * @module @covora/types/webhook
 *
 * Bildirim webhook'u. Bir projeye ait; seçilen review olaylarında hedef URL'ye
 * JSON POST atılır (Slack/Discord/generic uyumlu gövde).
 */

import { z } from 'zod'

/** Bildirim tetikleyen review olayları. */
export const webhookEventSchema = z.enum(['review_completed', 'gate_failed', 'regression'])

/** {@link webhookEventSchema} tip çıkarımı. */
export type WebhookEvent = z.infer<typeof webhookEventSchema>

/** Bir bildirim webhook'u. */
export const webhookSchema = z.object({
  /** Kalıcılık kimliği. */
  id: z.string().min(1),
  /** Hedef URL. */
  url: z.string().min(1),
  /** Bu webhook'u tetikleyen olaylar. */
  events: z.array(webhookEventSchema),
  /** Etkin mi. */
  active: z.boolean()
})

/** {@link webhookSchema} tip çıkarımı. */
export type Webhook = z.infer<typeof webhookSchema>
