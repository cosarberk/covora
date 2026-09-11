/**
 * @module @covora/provider-ollama/provider.test
 *
 * `createOllamaProvider` için birim testleri. Ağ katmanı `fetch` mock'lanarak
 * izole edilir.
 */

import type { ChecklistItem, ReviewInput } from '@covora/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOllamaProvider } from './provider.js'

const config = { baseUrl: 'http://localhost:11434', model: 'qwen3-vl:8b', kind: 'ui' as const }

const items: ChecklistItem[] = [
  { ruleId: 'a', title: 'A', description: '' },
  { ruleId: 'b', title: 'B', description: '' }
]

const input: ReviewInput = { kind: 'ui', screenshot: 'base64data' }

/**
 * `fetch`'i tek bir Ollama yanıtı dönecek şekilde mock'lar.
 *
 * @param content - Model yanıtının içerik metni.
 * @param ok - HTTP yanıtının başarılı olup olmadığı.
 */
const stubFetch = (content: string, ok = true): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? 'OK' : 'Internal Server Error',
      json: async () => ({ message: { content } })
    }))
  )
}

describe('createOllamaProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('modelin doldurduğu sonuçları RuleResult listesine çevirir', async () => {
    stubFetch(
      JSON.stringify({
        results: [
          { ruleId: 'a', outcome: 'pass' },
          { ruleId: 'b', outcome: 'fail', note: 'hizalama bozuk' }
        ]
      })
    )
    const provider = createOllamaProvider(config)

    const results = await provider.fillChecklist(input, items)

    expect(results).toHaveLength(2)
    expect(results.find((r) => r.ruleId === 'a')?.outcome).toBe('pass')
    expect(results.find((r) => r.ruleId === 'b')?.note).toBe('hizalama bozuk')
  })

  it('modelin döndürmediği maddeyi fail sayar', async () => {
    stubFetch(JSON.stringify({ results: [{ ruleId: 'a', outcome: 'pass' }] }))
    const provider = createOllamaProvider(config)

    const results = await provider.fillChecklist(input, items)

    expect(results.find((r) => r.ruleId === 'b')?.outcome).toBe('fail')
  })

  it('geçersiz JSON gelirse tüm maddeleri fail sayar', async () => {
    stubFetch('bu bir json değil')
    const provider = createOllamaProvider(config)

    const results = await provider.fillChecklist(input, items)

    expect(results.every((r) => r.outcome === 'fail')).toBe(true)
  })

  it('HTTP hatasında hata fırlatır', async () => {
    stubFetch('', false)
    const provider = createOllamaProvider(config)

    await expect(provider.fillChecklist(input, items)).rejects.toThrow()
  })

  it('boş checklist için ağ çağrısı yapmaz', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const provider = createOllamaProvider(config)

    const results = await provider.fillChecklist(input, [])

    expect(results).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
