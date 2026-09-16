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

const stubFetch = (outcome: unknown, ok = true): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status: ok ? 201 : 500,
      statusText: ok ? 'Created' : 'Internal Server Error',
      json: async () => outcome
    }))
  )
}

describe('runReviewCommand', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gate geçtiğinde 0 döner', async () => {
    stubFetch({ reviewId: 'r1', coverage: { score: 90, level: 'good' }, gate: { passed: true, reasons: [] } })

    const code = await runReviewCommand(options, () => {}, () => {})

    expect(code).toBe(ReviewExitCode.passed)
  })

  it('gate kaldığında 1 döner', async () => {
    stubFetch({
      reviewId: 'r1',
      coverage: { score: 40, level: 'poor' },
      gate: { passed: false, reasons: ['Skor düşük'] }
    })

    const code = await runReviewCommand(options, () => {}, () => {})

    expect(code).toBe(ReviewExitCode.gateFailed)
  })

  it('sunucu hatasında 2 döner', async () => {
    stubFetch({}, false)

    const code = await runReviewCommand(options, () => {}, () => {})

    expect(code).toBe(ReviewExitCode.error)
  })

  it('dosya verilmezse 2 döner', async () => {
    const code = await runReviewCommand({ ...options, files: [] }, () => {}, () => {})

    expect(code).toBe(ReviewExitCode.error)
  })
})
