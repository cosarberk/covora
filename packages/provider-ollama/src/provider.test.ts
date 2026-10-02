/**
 * @module @covora/provider-ollama/provider.test
 *
 * `createOllamaProvider` için birim testleri. Ağ katmanı (`postJson`) mock'lanarak
 * izole edilir.
 */

import type { ChecklistItem, ReviewInput } from '@covora/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./http.js', () => ({ postJson: vi.fn() }))

import { postJson } from './http.js'
import { createOllamaProvider } from './provider.js'

const mockedPostJson = vi.mocked(postJson)

const config = { baseUrl: 'http://localhost:11434', model: 'qwen3-vl:8b', kind: 'ui' as const }

const items: ChecklistItem[] = [
  { ruleId: 'a', title: 'A', description: '' },
  { ruleId: 'b', title: 'B', description: '' }
]

const input: ReviewInput = { kind: 'ui', screenshot: 'base64data' }

/** `postJson`'ı tek bir Ollama yanıtı (message.content) dönecek şekilde ayarlar. */
const stubOllama = (content: string): void => {
  mockedPostJson.mockResolvedValue({ message: { content } })
}

describe('createOllamaProvider', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('modelin doldurduğu sonuçları RuleResult listesine çevirir', async () => {
    stubOllama(
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
    stubOllama(JSON.stringify({ results: [{ ruleId: 'a', outcome: 'pass' }] }))
    const provider = createOllamaProvider(config)

    const results = await provider.fillChecklist(input, items)

    expect(results.find((r) => r.ruleId === 'b')?.outcome).toBe('fail')
  })

  it('geçersiz JSON gelirse tüm maddeleri fail sayar', async () => {
    stubOllama('bu bir json değil')
    const provider = createOllamaProvider(config)

    const results = await provider.fillChecklist(input, items)

    expect(results.every((r) => r.outcome === 'fail')).toBe(true)
  })

  it('HTTP hatasında hata fırlatır', async () => {
    mockedPostJson.mockRejectedValue(new Error('HTTP 500'))
    const provider = createOllamaProvider(config)

    await expect(provider.fillChecklist(input, items)).rejects.toThrow()
  })

  it('boş checklist için ağ çağrısı yapmaz', async () => {
    const provider = createOllamaProvider(config)

    const results = await provider.fillChecklist(input, [])

    expect(results).toEqual([])
    expect(mockedPostJson).not.toHaveBeenCalled()
  })
})
