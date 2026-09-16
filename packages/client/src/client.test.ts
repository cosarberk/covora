/**
 * @module @covora/client/client.test
 *
 * `createCovoraClient` için birim testleri. `fetch` mock'lanır.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCovoraClient } from './client.js'

const config = {
  serverUrl: 'http://localhost:4000',
  projectKey: 'my-plugin',
  ingestToken: 'ingest-token-1'
}

const okResponse = { reviewId: 'r1', coverage: { score: 80 }, gate: { passed: true } }

describe('createCovoraClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('review isteğini doğru gövdeyle sunucuya gönderir', async () => {
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => okResponse
    }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createCovoraClient(config)

    const result = await client.review({
      input: { kind: 'ui', screenshot: 'img' },
      codeHash: 'hash-1'
    })

    expect(result.reviewId).toBe('r1')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://localhost:4000/reviews')
    const body = JSON.parse(options.body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      projectKey: 'my-plugin',
      codeHash: 'hash-1',
      input: { kind: 'ui', screenshot: 'img' }
    })
  })

  it('sunucu hatasında hata fırlatır', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' }))
    )
    const client = createCovoraClient(config)

    await expect(
      client.review({ input: { kind: 'ui', screenshot: 'img' }, codeHash: 'h' })
    ).rejects.toThrow()
  })
})
