/**
 * @module @covora/server/routes/blueprint-sse
 *
 * Bir blueprint run'ının olaylarını Server-Sent Events ile akıtan yardımcı.
 * Bağlantı açıldığında önce anlık görüntü (mevcut run + node izleri + biriken
 * loglar) gönderilir, ardından canlı node olayları akıtılır. Run terminalse
 * görüntü gönderilip kapatılır. Heartbeat proxy zaman aşımını önler. (Review
 * SSE'siyle aynı desen; hijack sonrası CORS header elle eklenir.)
 */

import { TERMINAL_RUN_STATUSES } from '@covora/types'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { BlueprintEventBus, BlueprintRunEvent } from '../services/blueprint-events.js'
import type { BlueprintRunDetail, BlueprintRunLogLine } from '@covora/db'

/** {@link streamBlueprintRunEvents} bağımlılıkları. */
export interface BlueprintSseDeps {
  readonly bus: BlueprintEventBus
  readonly getBlueprintRun: (runId: string) => Promise<BlueprintRunDetail | null>
  readonly getBlueprintRunLogs: (runId: string) => Promise<readonly BlueprintRunLogLine[]>
}

/**
 * Verilen blueprint run'ının olaylarını SSE olarak akıtır.
 *
 * @param request - Fastify isteği (kapanışı dinlemek için).
 * @param reply - Fastify yanıtı (hijack edilir).
 * @param deps - Veri yolu ve okuma fonksiyonları.
 * @param runId - İzlenecek run.
 */
export const streamBlueprintRunEvents = async (
  request: FastifyRequest,
  reply: FastifyReply,
  deps: BlueprintSseDeps,
  runId: string
): Promise<void> => {
  reply.hijack()
  const res = reply.raw
  const origin = request.headers.origin
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...(origin !== undefined ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {})
  })

  const send = (event: BlueprintRunEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  const run = await deps.getBlueprintRun(runId)
  if (run !== null) {
    const logs = await deps.getBlueprintRunLogs(runId)
    send({ type: 'bp.run.snapshot', run, logs })
    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      send({ type: 'bp.run.finished', runId, status: run.status, at: new Date().toISOString() })
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
