/**
 * @module studio/api/client.test
 *
 * `createStudioApi` için birim testleri. `fetch` mock'lanır.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createStudioApi } from './client.js'

const api = createStudioApi({ baseUrl: 'http://localhost:4000' })

describe('createStudioApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("listRules doğru URL'i çağırır ve kuralları döner", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ rules: [{ id: 'r1' }] })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const rules = await api.listRules('my-plugin')

    expect(rules).toHaveLength(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:4000/projects/my-plugin/rules')
  })

  it('updateRule PATCH gönderir', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 204,
      statusText: 'No Content'
    }))
    vi.stubGlobal('fetch', fetchMock)

    await api.updateRule('rule-1', { enabled: false })

    const [callUrl, init] = fetchMock.mock.calls[0]!
    expect(callUrl).toBe('http://localhost:4000/rules/rule-1')
    expect(init.method).toBe('PATCH')
  })

  it('başarısız yanıtta hata fırlatır', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' }))
    )

    await expect(api.listReviews('p')).rejects.toThrow()
  })
})
