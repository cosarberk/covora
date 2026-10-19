/**
 * @module @covora/cli/review-command
 *
 * `covora review` komutunun mantığı. Verilen kaynak dosyaları review
 * sunucusuna gönderir, run kuyruğa alınır; CLI run'ı terminal duruma gelene
 * kadar yoklar (poll), sonra gate kararını çıkış koduna yansıtır (merge
 * pipeline'ını bloklamak için).
 */

import { readFile } from 'node:fs/promises'

import { TERMINAL_RUN_STATUSES, type ReviewRun, type ReviewScope } from '@covora/types'

/** `covora review` seçenekleri. */
export interface ReviewCommandOptions {
  /** Covora sunucusunun adresi. */
  readonly server: string
  /** Proje anahtarı. */
  readonly project: string
  /** Projenin ingest token'ı (studio'dan alınır). */
  readonly token: string
  /** Review edilen kodun hash'i. */
  readonly codeHash: string
  /** Review edilecek dosya yolları. */
  readonly files: readonly string[]
  /**
   * Review kapsamı: `project` tüm proje kurallarını (ArchUnit dahil) çalıştırır,
   * `changes` yalnızca değişen-dosya kurallarını. Verilmezse sunucu `changes`
   * sayar.
   */
  readonly mode?: ReviewScope
  /** Run'ın tamamlanması için en fazla beklenecek süre (ms). */
  readonly pollTimeoutMs?: number
  /** İki yoklama arası bekleme (ms). */
  readonly pollIntervalMs?: number
}

/** Enqueue yanıtı (202). */
interface EnqueueResponse {
  readonly runId: string
}

/** Çıkış kodları: 0 geçti, 1 gate kaldı, 2 çalıştırma hatası. */
export const ReviewExitCode = {
  passed: 0,
  gateFailed: 1,
  error: 2
} as const

/** Varsayılan poll zaman aşımı ve aralığı. */
const DEFAULT_POLL_TIMEOUT_MS = 180_000
const DEFAULT_POLL_INTERVAL_MS = 2_000

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Bir run terminal (bitmiş) durumda mı. */
const isTerminal = (status: ReviewRun['status']): boolean =>
  (TERMINAL_RUN_STATUSES as readonly string[]).includes(status)

/**
 * Review komutunu çalıştırır: dosyaları gönderir, run'ı yoklar, gate kararını
 * çıkış koduna çevirir.
 *
 * @param options - Komut seçenekleri.
 * @param log - Standart çıktı yazıcısı.
 * @param errorLog - Hata çıktısı yazıcısı.
 * @returns Süreç çıkış kodu.
 */
export const runReviewCommand = async (
  options: ReviewCommandOptions,
  log: (message: string) => void = console.log,
  errorLog: (message: string) => void = console.error
): Promise<number> => {
  if (options.files.length === 0) {
    errorLog('En az bir dosya belirtilmelidir')
    return ReviewExitCode.error
  }

  const files = await Promise.all(
    options.files.map(async (path) => ({ path, content: await readFile(path, 'utf8') }))
  )

  // 1) Review'ı kuyruğa al.
  const enqueue = await fetch(`${options.server}/reviews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-covora-token': options.token },
    body: JSON.stringify({
      projectKey: options.project,
      codeHash: options.codeHash,
      input: { kind: 'code', files, ...(options.mode !== undefined ? { mode: options.mode } : {}) }
    })
  })

  if (!enqueue.ok) {
    errorLog(`Review isteği başarısız: ${enqueue.status} ${enqueue.statusText}`)
    return ReviewExitCode.error
  }

  const { runId } = (await enqueue.json()) as EnqueueResponse
  if (typeof runId !== 'string' || runId.length === 0) {
    errorLog('Sunucu runId döndürmedi')
    return ReviewExitCode.error
  }
  log(`Review kuyruğa alındı (run ${runId}), sonuç bekleniyor...`)

  // 2) Run terminal olana kadar yokla.
  const timeout = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS
  const interval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const deadline = Date.now() + timeout
  const runUrl = `${options.server}/reviews/${runId}?projectKey=${encodeURIComponent(options.project)}`

  let run: ReviewRun | null = null
  for (;;) {
    const res = await fetch(runUrl, { headers: { 'x-covora-token': options.token } })
    if (res.ok) {
      run = (await res.json()) as ReviewRun
      if (isTerminal(run.status)) {
        break
      }
    }
    if (Date.now() >= deadline) {
      errorLog(`Run zaman aşımına uğradı (son durum: ${run?.status ?? 'bilinmiyor'})`)
      return ReviewExitCode.error
    }
    await sleep(interval)
  }

  // 3) Sonucu raporla ve gate'i çıkış koduna çevir.
  if (run.status === 'failed' || run.status === 'cancelled' || run.outcome === undefined) {
    errorLog(`Run sonuç üretmedi (durum: ${run.status})`)
    return ReviewExitCode.error
  }

  const outcome = run.outcome
  log(`Coverage: ${outcome.coverage.score.toFixed(1)} (${outcome.coverage.level})`)
  log(`Gate: ${outcome.gate.passed ? 'GEÇTİ' : 'KALDI'}`)

  if (!outcome.gate.passed) {
    for (const reason of outcome.gate.reasons) {
      errorLog(`- ${reason}`)
    }
    return ReviewExitCode.gateFailed
  }

  return ReviewExitCode.passed
}
