/**
 * @module @covora/server/services/git-webhook
 *
 * Gelen (inbound) git webhook'larının imza doğrulaması ve olay ayrıştırması. Bir
 * PR/MR açıldığında ya da push olduğunda git sağlayıcısı (GitHub/GitLab/Gitea)
 * bu uç noktayı çağırır; covora olayı çözüp ilgili review'ı (diff ya da branch)
 * kendisi tetikler. Böylece ayrı bir CI runner gerekmez.
 *
 * İmza sırrı olarak projenin mevcut `ingestToken`'ı kullanılır (ayrı bir secret
 * saklanmaz). Doğrulama sağlayıcıya göre değişir:
 * - GitHub: `X-Hub-Signature-256` = `sha256=<hmac>` (HMAC-SHA256, ham gövde).
 * - Gitea:  `X-Gitea-Signature`  = `<hmac>` (HMAC-SHA256 hex, ham gövde).
 * - GitLab: `X-Gitlab-Token`     = sır (düz eşitlik).
 * - generic:`X-Covora-Token`     = sır (düz eşitlik).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { GitProvider } from '@covora/types'

import type { PullReviewOptions } from './management.js'

/** Fastify ham başlıklar (anahtarlar küçük harf). */
export type WebhookHeaders = Record<string, string | string[] | undefined>

/** Ayrıştırma sonucu: ya yok sayılır ya da bir review tetiklenir. */
export type WebhookParse =
  | { readonly type: 'ignored'; readonly reason: string }
  | { readonly type: 'review'; readonly options: PullReviewOptions }

/** Başlıktan tek string değer okur (dizi ise ilkini). */
const header = (headers: WebhookHeaders, name: string): string | undefined => {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

/** İki string'i sabit zamanlı karşılaştırır (uzunluk farkı → false). */
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/** "refs/heads/main" → "main" (ref adını sadeleştirir). */
const shortRef = (ref: string): string => ref.replace(/^refs\/heads\//, '')

/**
 * Gelen webhook'un imzasını/sırrını sağlayıcıya göre doğrular.
 *
 * @param provider - Proje git sağlayıcısı (null → generic).
 * @param secret - İmza sırrı (projenin ingestToken'ı).
 * @param rawBody - İsteğin ham gövdesi (HMAC için şart).
 * @param headers - İstek başlıkları.
 * @returns İmza geçerliyse true.
 */
export const verifyWebhookSignature = (
  provider: GitProvider | null,
  secret: string,
  rawBody: Buffer,
  headers: WebhookHeaders
): boolean => {
  switch (provider) {
    case 'github': {
      const sig = header(headers, 'x-hub-signature-256')
      if (sig === undefined) {
        return false
      }
      const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
      return safeEqual(sig, expected)
    }
    case 'gitea': {
      const sig = header(headers, 'x-gitea-signature')
      if (sig === undefined) {
        return false
      }
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
      return safeEqual(sig, expected)
    }
    case 'gitlab': {
      const token = header(headers, 'x-gitlab-token')
      return token !== undefined && safeEqual(token, secret)
    }
    default: {
      const token = header(headers, 'x-covora-token')
      return token !== undefined && safeEqual(token, secret)
    }
  }
}

/** push olayını (ref + before/after) review seçeneğine çevirir. */
const parsePush = (ref: unknown, deleted: unknown): WebhookParse => {
  if (deleted === true || typeof ref !== 'string' || ref.length === 0) {
    return { type: 'ignored', reason: 'dal silindi ya da ref yok' }
  }
  // Push'ta tüm branch incelenir (güvenilir); diff PR/MR olayına bırakılır.
  return { type: 'review', options: { ref: shortRef(ref) } }
}

/** GitHub/Gitea PR gövdesinden base/head dallarını çıkarır. */
const prOptions = (body: Record<string, unknown>): WebhookParse => {
  const pr = body.pull_request as { base?: { ref?: string }; head?: { ref?: string } } | undefined
  const base = pr?.base?.ref
  const head = pr?.head?.ref
  if (typeof base === 'string' && typeof head === 'string') {
    return { type: 'review', options: { base, head } }
  }
  return { type: 'ignored', reason: 'PR base/head dalları okunamadı' }
}

/**
 * Sağlayıcıya ve olay türüne göre webhook gövdesini review tetiklemeye çevirir.
 * İlgisiz olaylar (ör. yorum, etiket) `ignored` döner.
 *
 * @param provider - Proje git sağlayıcısı (null → generic).
 * @param headers - İstek başlıkları (olay türü başlıkta).
 * @param body - Ayrıştırılmış JSON gövde.
 * @returns Yok sayma ya da review seçenekleri.
 */
export const parseWebhookEvent = (
  provider: GitProvider | null,
  headers: WebhookHeaders,
  body: Record<string, unknown>
): WebhookParse => {
  switch (provider) {
    case 'github':
    case 'gitea': {
      const event = header(headers, provider === 'github' ? 'x-github-event' : 'x-gitea-event')
      if (event === 'push') {
        return parsePush(body.ref, body.deleted)
      }
      if (event === 'pull_request') {
        const action = body.action
        const relevant = new Set(['opened', 'reopened', 'synchronize', 'synchronized'])
        return typeof action === 'string' && relevant.has(action)
          ? prOptions(body)
          : { type: 'ignored', reason: `pull_request aksiyonu yok sayıldı: ${String(action)}` }
      }
      return { type: 'ignored', reason: `olay yok sayıldı: ${String(event)}` }
    }
    case 'gitlab': {
      const event = header(headers, 'x-gitlab-event')
      if (event === 'Push Hook') {
        return parsePush(body.ref, false)
      }
      if (event === 'Merge Request Hook') {
        const attrs = body.object_attributes as
          | { action?: string; target_branch?: string; source_branch?: string }
          | undefined
        const relevant = new Set(['open', 'reopen', 'update'])
        if (
          attrs !== undefined &&
          typeof attrs.action === 'string' &&
          relevant.has(attrs.action) &&
          typeof attrs.target_branch === 'string' &&
          typeof attrs.source_branch === 'string'
        ) {
          return { type: 'review', options: { base: attrs.target_branch, head: attrs.source_branch } }
        }
        return { type: 'ignored', reason: 'MR aksiyonu/dalları yok sayıldı' }
      }
      return { type: 'ignored', reason: `olay yok sayıldı: ${String(event)}` }
    }
    default: {
      // generic: gövdeden base/head ya da ref beklenir.
      const base = body.base
      const head = body.head
      const ref = body.ref
      if (typeof base === 'string' && typeof head === 'string') {
        return { type: 'review', options: { base, head } }
      }
      if (typeof ref === 'string' && ref.length > 0) {
        return { type: 'review', options: { ref: shortRef(ref) } }
      }
      return { type: 'ignored', reason: 'generic gövdede base/head/ref yok' }
    }
  }
}
