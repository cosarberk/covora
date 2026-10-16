/**
 * @module @covora/server/routes/git-webhook
 *
 * Gelen git webhook uç noktası: PR/MR/push olaylarında git sağlayıcısının çağırdığı
 * genel (auth guard'sız) yol. Kimlik, projenin `ingestToken`'ı ile imza/sır
 * doğrulamasıyla sağlanır. Geçerli bir olay, covora'nın depoyu kendisi çekip
 * review tetiklemesine yol açar (diff ya da tüm branch).
 *
 * İmza HMAC'i ham gövde üzerinden hesaplandığından, bu kapsam gövdeyi Buffer
 * olarak ayrıştırır (JSON'u imza doğrulandıktan sonra elle çözeriz).
 */

import type { GitProvider } from '@covora/types'
import type { FastifyInstance } from 'fastify'

import type { PullReviewOptions, PullReviewOutcome } from '../services/management.js'
import { parseWebhookEvent, verifyWebhookSignature } from '../services/git-webhook.js'

/** {@link registerGitWebhookRoutes} bağımlılıkları. */
export interface GitWebhookDeps {
  /** Proje için webhook bağlamını (sağlayıcı + imza sırrı) çözer; yoksa null. */
  readonly getProjectWebhookContext: (
    key: string
  ) => Promise<{ readonly provider: GitProvider | null; readonly secret: string } | null>
  /** Depoyu çekip review'ı kuyruğa alır. */
  readonly pullReview: (key: string, options?: PullReviewOptions) => Promise<PullReviewOutcome>
}

/**
 * Gelen git webhook route'unu kaydeder. Çağıran `app`, izole bir kapsam olmalıdır
 * (buffer gövde ayrıştırıcısı yalnızca burada geçerli olsun diye).
 *
 * @param app - İzole Fastify kapsamı.
 * @param deps - Bağımlılıklar.
 */
export const registerGitWebhookRoutes = (app: FastifyInstance, deps: GitWebhookDeps): void => {
  // Ham gövde (HMAC imzası için). Yalnızca bu kapsamda geçerli.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body)
  })

  app.post('/git/webhook/:key', async (request, reply) => {
    const { key } = request.params as { key: string }
    const ctx = await deps.getProjectWebhookContext(key)
    if (ctx === null) {
      return reply.status(404).send({ error: 'Proje bulunamadı' })
    }

    const raw = request.body
    if (!Buffer.isBuffer(raw)) {
      return reply.status(400).send({ error: 'Gövde okunamadı (application/json bekleniyor)' })
    }
    if (!verifyWebhookSignature(ctx.provider, ctx.secret, raw, request.headers)) {
      return reply.status(401).send({ error: 'Webhook imzası doğrulanamadı' })
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>
    } catch {
      return reply.status(400).send({ error: 'Geçersiz JSON gövde' })
    }

    const parsed = parseWebhookEvent(ctx.provider, request.headers, body)
    if (parsed.type === 'ignored') {
      return reply.status(202).send({ status: 'ignored', reason: parsed.reason })
    }

    try {
      const result = await deps.pullReview(key, parsed.options)
      if (!result.ok) {
        return result.reason === 'no-git'
          ? reply.status(400).send({ error: 'Projede git bağlantısı tanımlı değil' })
          : reply.status(404).send({ error: 'Proje bulunamadı' })
      }
      return reply.status(202).send({ status: 'queued', runId: result.runId })
    } catch (error) {
      return reply
        .status(502)
        .send({ error: error instanceof Error ? error.message : 'Review tetiklenemedi' })
    }
  })
}
