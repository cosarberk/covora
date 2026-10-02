/**
 * @module @covora/server/routes/sse
 *
 * Bir run'ın olaylarını Server-Sent Events ile akıtan ortak yardımcı. Bağlantı
 * açıldığında önce anlık görüntü (mevcut run + biriken loglar) gönderilir,
 * ardından canlı olaylar akıtılır. Run zaten terminal durumdaysa görüntü
 * gönderilip bağlantı kapatılır. Heartbeat ara bağlantıların (proxy) zaman
 * aşımını önler.
 */

import { TERMINAL_RUN_STATUSES, type RunEvent } from '@covora/types'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { RunEventBus } from '../services/events.js'

/** {@link streamRunEvents} bağımlılıkları. */
export interface SseDeps {
  readonly bus: RunEventBus
  readonly getRun: (runId: string) => Promise<import('@covora/types').ReviewRun | null>
  readonly getRunLogs: (runId: string) => Promise<readonly import('@covora/types').RunLogLine[]>
}

/**
 * Verilen run'ın olaylarını SSE olarak akıtır.
 *
 * @param request - Fastify isteği (kapanışı dinlemek için).
 * @param reply - Fastify yanıtı (hijack edilir).
 * @param deps - Veri yolu ve okuma fonksiyonları.
 * @param runId - İzlenecek run.
 */
export const streamRunEvents = async (
  request: FastifyRequest,
  reply: FastifyReply,
  deps: SseDeps,
  runId: string
): Promise<void> => {
  reply.hijack()
  const res = reply.raw
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const send = (event: RunEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  // Anlık görüntü: mevcut run + biriken loglar.
  const run = await deps.getRun(runId)
  if (run !== null) {
    send({ type: 'run.created', run })
    const logs = await deps.getRunLogs(runId)
    for (const line of logs) {
      send({ type: 'log.appended', runId, line })
    }
    // Zaten bittiyse nihai olayı gönder ve kapat.
    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      send({ type: 'run.finished', run })
      res.end()
      return
    }
  }

  const unsubscribe = deps.bus.subscribe(runId, send)
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n')
  }, 15_000)

  const cleanup = (): void => {
    clearInterval(heartbeat)
    unsubscribe()
    res.end()
  }

  request.raw.on('close', cleanup)
}
