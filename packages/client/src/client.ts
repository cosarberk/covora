/**
 * @module @covora/client/client
 *
 * Covora review sunucusuyla konuşan client. Host uygulama (örn. mock-shell)
 * bunu kurup bir "Review" aksiyonundan çağırır. Review artık asenkrondur:
 * istek kuyruğa alınır (`runId` döner) ve ilerleme canlı izlenir. `reviewUi`
 * kolaylık olarak enqueue edip run terminal duruma ulaşana kadar bekler ve her
 * ilerleme olayını `onProgress`'e iletir.
 */

import type { ReviewInput, ReviewRun, RunEvent, RunStatus } from '@covora/types'

import { captureScreenshot } from './capture.js'
import { runDomChecks } from './dom-checks.js'

/**
 * Terminal run durumları. `@covora/types`'tan runtime değer import etmemek için
 * bilinçli olarak burada tutulur; aksi halde tüm tip paketi (+zod) tarayıcı
 * bundle'ına girerdi.
 */
const TERMINAL_STATUSES: readonly RunStatus[] = [
  'succeeded',
  'degraded',
  'failed',
  'cancelled'
]

/** Client yapılandırması. */
export interface CovoraClientConfig {
  /** Review sunucusunun temel adresi. */
  readonly serverUrl: string
  /** Review edilen projenin anahtarı. */
  readonly projectKey: string
  /** Projenin ingest token'ı (studio'dan alınır). */
  readonly ingestToken: string
}

/** Bir review isteğinin parametreleri. */
export interface ReviewRequestParams {
  /** Review girdisi. */
  readonly input: ReviewInput
  /** Review edilen kodun/durumun hash'i. */
  readonly codeHash: string
}

/** Kuyruğa-alma yanıtı (POST /reviews). */
export interface EnqueueResponse {
  readonly runId: string
  readonly status: 'queued'
  readonly queuePosition?: number
}

/** `reviewUi`/`review` opsiyonları. */
export interface ReviewOptions {
  /** Her ilerleme olayında çağrılır (adım/log/durum). */
  readonly onProgress?: (event: RunEvent) => void
}

/** Covora client arayüzü. */
export interface CovoraClient {
  /** Hazır bir girdiyle review'ı kuyruğa alır (beklemez). */
  enqueue(params: ReviewRequestParams): Promise<EnqueueResponse>
  /** Bir run'ı terminal duruma ulaşana kadar izler; nihai run'ı döner. */
  follow(runId: string, options?: ReviewOptions): Promise<ReviewRun>
  /** Hazır girdiyle review'ı kuyruğa alır ve bitene kadar izler. */
  review(params: ReviewRequestParams, options?: ReviewOptions): Promise<ReviewRun>
  /** O anki ekranı yakalayıp UI review çalıştırır ve bitene kadar izler. */
  reviewUi(codeHash: string, element?: HTMLElement, options?: ReviewOptions): Promise<ReviewRun>
}

const isTerminal = (status: ReviewRun['status']): boolean => TERMINAL_STATUSES.includes(status)

/**
 * Bir Covora client örneği oluşturur.
 *
 * @param config - Sunucu adresi, proje anahtarı ve ingest token.
 * @returns Yapılandırılmış {@link CovoraClient}.
 */
export const createCovoraClient = (config: CovoraClientConfig): CovoraClient => {
  const headers = { 'content-type': 'application/json', 'x-covora-token': config.ingestToken }
  const projectQuery = `projectKey=${encodeURIComponent(config.projectKey)}`

  const enqueue = async (params: ReviewRequestParams): Promise<EnqueueResponse> => {
    const response = await fetch(`${config.serverUrl}/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectKey: config.projectKey,
        codeHash: params.codeHash,
        input: params.input
      })
    })
    if (!response.ok) {
      throw new Error(`Review isteği başarısız: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as EnqueueResponse
  }

  const fetchRun = async (runId: string): Promise<ReviewRun | null> => {
    const response = await fetch(
      `${config.serverUrl}/reviews/${encodeURIComponent(runId)}?${projectQuery}`,
      { headers: { 'x-covora-token': config.ingestToken } }
    )
    if (!response.ok) {
      return null
    }
    return (await response.json()) as ReviewRun
  }

  /** SSE'yi fetch-stream ile dener; terminal run'ı döner, akış kopmuşsa null. */
  const streamRun = async (
    runId: string,
    onProgress?: (event: RunEvent) => void
  ): Promise<ReviewRun | null> => {
    let response: Response
    try {
      response = await fetch(
        `${config.serverUrl}/reviews/${encodeURIComponent(runId)}/events?${projectQuery}`,
        { headers: { 'x-covora-token': config.ingestToken } }
      )
    } catch {
      return null
    }
    if (!response.ok || response.body === null) {
      return null
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastRun: ReviewRun | null = null

    for (;;) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() ?? ''
      for (const chunk of chunks) {
        const dataLine = chunk.split('\n').find((line) => line.startsWith('data:'))
        if (dataLine === undefined) {
          continue
        }
        let event: RunEvent
        try {
          event = JSON.parse(dataLine.slice(5).trim()) as RunEvent
        } catch {
          continue
        }
        onProgress?.(event)
        if (event.type === 'run.created' || event.type === 'run.finished') {
          lastRun = event.run
        }
        if (event.type === 'run.finished') {
          void reader.cancel()
          return event.run
        }
      }
    }
    // Akış terminal olmadan kapandı; son bilinen run (varsa) terminal mi?
    return lastRun !== null && isTerminal(lastRun.status) ? lastRun : null
  }

  /** SSE başarısızsa yoklayarak terminal run'ı bekler. */
  const pollRun = async (
    runId: string,
    onProgress?: (event: RunEvent) => void
  ): Promise<ReviewRun> => {
    let lastStatus: ReviewRun['status'] | null = null
    for (;;) {
      const run = await fetchRun(runId)
      if (run !== null) {
        if (run.status !== lastStatus) {
          lastStatus = run.status
          onProgress?.({ type: 'run.updated', runId, status: run.status, at: new Date().toISOString() })
        }
        if (isTerminal(run.status)) {
          return run
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }

  const follow = async (runId: string, options?: ReviewOptions): Promise<ReviewRun> => {
    const streamed = await streamRun(runId, options?.onProgress)
    return streamed ?? pollRun(runId, options?.onProgress)
  }

  const review = async (
    params: ReviewRequestParams,
    options?: ReviewOptions
  ): Promise<ReviewRun> => {
    const { runId } = await enqueue(params)
    return follow(runId, options)
  }

  const reviewUi = async (
    codeHash: string,
    element: HTMLElement = document.body,
    options?: ReviewOptions
  ): Promise<ReviewRun> => {
    const screenshot = await captureScreenshot(element)
    const clientResults = runDomChecks(element)
    return review({ input: { kind: 'ui', screenshot, clientResults }, codeHash }, options)
  }

  return { enqueue, follow, review, reviewUi }
}
