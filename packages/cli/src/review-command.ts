/**
 * @module @covora/cli/review-command
 *
 * `covora review` komutunun mantığı. Verilen kaynak dosyaları review
 * sunucusuna gönderir; merge gate geçmezse sıfırdan farklı çıkış kodu döner
 * (pipeline'ı bloklamak için).
 */

import { readFile } from 'node:fs/promises'

import type { ReviewOutcome } from '@covora/types'

/** `covora review` seçenekleri. */
export interface ReviewCommandOptions {
  /** Covora sunucusunun adresi. */
  readonly server: string
  /** Proje anahtarı. */
  readonly project: string
  /** Review edilen kodun hash'i. */
  readonly codeHash: string
  /** Review edilecek dosya yolları. */
  readonly files: readonly string[]
}

interface CreateReviewResponse extends ReviewOutcome {
  readonly reviewId: string
}

/** Çıkış kodları: 0 geçti, 1 gate kaldı, 2 çalıştırma hatası. */
export const ReviewExitCode = {
  passed: 0,
  gateFailed: 1,
  error: 2
} as const

/**
 * Review komutunu çalıştırır.
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

  const response = await fetch(`${options.server}/reviews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectKey: options.project,
      codeHash: options.codeHash,
      input: { kind: 'code', files }
    })
  })

  if (!response.ok) {
    errorLog(`Review isteği başarısız: ${response.status} ${response.statusText}`)
    return ReviewExitCode.error
  }

  const outcome = (await response.json()) as CreateReviewResponse
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
