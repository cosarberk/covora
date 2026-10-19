/**
 * @module @covora/cli/review-command.test
 *
 * `runReviewCommand` için birim testleri. `fetch` ve dosya okuma mock'lanır.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => 'const x = 1')
}))

import { ReviewExitCode, runReviewCommand } from './review-command.js'

const options = {
  server: 'http://localhost:4000',
  project: 'my-plugin',
  token: 'ingest-token-1',
  codeHash: 'hash-1',
  files: ['src/a.ts']
}

/**
 * İki fazlı akışı mock'lar: POST /reviews → { runId }, ardından GET
 * /reviews/:runId → verilen terminal run. `enqueueOk=false` ile enqueue hatası
 * taklit edilir.
 */
const stubFlow = (run: unknown, enqueueOk = true): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        return {
          ok: enqueueOk,
          status: enqueueOk ? 202 : 500,
          statusText: enqueueOk ? 'Accepted' : 'Internal Server Error',
          json: async () => ({ runId: 'run-1', status: 'queued' })
        }
      }
      return { ok: true, status: 200, statusText: 'OK', json: async () => run }
    })
  )
}

describe('runReviewCommand', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gate geçtiğinde 0 döner', async () => {
    stubFlow({
      status: 'succeeded',
      outcome: { coverage: { score: 90, level: 'good' }, gate: { passed: true, reasons: [] } }
    })

    const code = await runReviewCommand(options, () => {}, () => {})

    expect(code).toBe(ReviewExitCode.passed)
  })

  it('gate kaldığında 1 döner', async () => {
    stubFlow({
      status: 'succeeded',
      outcome: { coverage: { score: 40, level: 'poor' }, gate: { passed: false, reasons: ['Skor düşük'] } }
    })

    const code = await runReviewCommand(options, () => {}, () => {})

    expect(code).toBe(ReviewExitCode.gateFailed)
  })

  it('enqueue başarısızsa 2 döner', async () => {
    stubFlow({}, false)

    const code = await runReviewCommand(options, () => {}, () => {})

    expect(code).toBe(ReviewExitCode.error)
  })

  it('run sonuç üretmezse (failed) 2 döner', async () => {
    stubFlow({ status: 'failed' })

    const code = await runReviewCommand(options, () => {}, () => {})

    expect(code).toBe(ReviewExitCode.error)
  })

  it('dosya verilmezse 2 döner', async () => {
    const code = await runReviewCommand({ ...options, files: [] }, () => {}, () => {})

    expect(code).toBe(ReviewExitCode.error)
  })
})
