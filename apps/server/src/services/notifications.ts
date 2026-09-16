/**
 * @module @covora/server/services/notifications
 *
 * Review bildirimlerini webhook'lara dağıtır. Gönderim ateşle-unut mantığıyla
 * ve hatalar yutularak yapılır; review yanıtını asla bloklamaz/başarısız etmez.
 * Gövde Slack (`text`) ve Discord (`content`) ile uyumludur, ayrıca yapılandırılmış
 * alanlar taşır.
 */

import type { ReviewKind, WebhookEvent } from '@covora/types'

/** Bir review sonrası bildirim yükü. */
export interface ReviewNotification {
  readonly projectId: string
  readonly projectKey: string
  readonly kind: ReviewKind
  readonly reviewId: string
  readonly score: number
  readonly level: string
  readonly delta: number | null
  readonly gatePassed: boolean
  readonly regressed: boolean
  readonly reasons: readonly string[]
}

/** Dağıtım için gereken (ham) webhook kaydı. */
export interface WebhookTarget {
  readonly url: string
  readonly events: readonly string[]
}

/** Bildirim dağıtım bağımlılıkları. */
export interface NotificationDeps {
  /** Projenin etkin webhook'larını getirir. */
  readonly listActiveWebhooks: (projectId: string) => Promise<readonly WebhookTarget[]>
}

const TIMEOUT_MS = 5000

/**
 * Bir review için gerçekleşen olayları belirler.
 *
 * @param payload - Bildirim yükü.
 * @returns Olay kümesi.
 */
const eventsFor = (payload: ReviewNotification): ReadonlySet<WebhookEvent> => {
  const events = new Set<WebhookEvent>(['review_completed'])
  if (!payload.gatePassed) {
    events.add('gate_failed')
  }
  if (payload.regressed) {
    events.add('regression')
  }
  return events
}

/**
 * Bildirim yükünden insan-okunur bir özet üretir.
 *
 * @param payload - Bildirim yükü.
 * @returns Tek satırlık özet.
 */
const summarize = (payload: ReviewNotification): string => {
  const gate = payload.gatePassed ? '✅ Gate geçti' : '❌ Gate kaldı'
  const deltaText =
    payload.delta === null
      ? ''
      : ` (${payload.delta >= 0 ? '+' : ''}${payload.delta.toFixed(1)} puan)`
  return `[Covora] ${payload.projectKey} · ${payload.kind} review: ${gate} · coverage ${payload.score.toFixed(1)}${deltaText}`
}

/**
 * Tek bir webhook'a POST atar; hata/zaman aşımı yutulur.
 *
 * @param url - Hedef URL.
 * @param body - Gövde.
 */
const post = async (url: string, body: unknown): Promise<void> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch {
    // Bildirim gönderimi review akışını etkilemez; hata yutulur.
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Bir review bildirimini eşleşen etkin webhook'lara dağıtır.
 *
 * @param deps - Dağıtım bağımlılıkları.
 * @param payload - Bildirim yükü.
 */
export const dispatchReviewNotifications = async (
  deps: NotificationDeps,
  payload: ReviewNotification
): Promise<void> => {
  const events = eventsFor(payload)
  const hooks = await deps.listActiveWebhooks(payload.projectId)
  const matching = hooks.filter((hook) => hook.events.some((event) => events.has(event as WebhookEvent)))
  if (matching.length === 0) {
    return
  }

  const summary = summarize(payload)
  const body = {
    text: summary,
    content: summary,
    event: payload.gatePassed ? 'review_completed' : 'gate_failed',
    project: payload.projectKey,
    kind: payload.kind,
    reviewId: payload.reviewId,
    score: payload.score,
    level: payload.level,
    delta: payload.delta,
    gatePassed: payload.gatePassed,
    regressed: payload.regressed,
    reasons: payload.reasons,
    timestamp: new Date().toISOString()
  }

  await Promise.allSettled(matching.map((hook) => post(hook.url, body)))
}
