import { describe, expect, it, vi } from 'vitest'

import { FlowEngine } from './engine.js'
import { parseGraph } from './graph.js'
import type { FlowServices } from './node-type.js'
import { createDefaultRegistry } from './index.js'

/** Tam review hattını (6 domain node) stub servislerle uçtan uca koşar. */
describe('Domain node hattı — gerçek dataflow', () => {
  it('project → source → evaluate → coverage → gate → notify zincirini akıtır', async () => {
    const pullFiles = vi.fn(async () => ({
      mode: 'project',
      base: '',
      head: 'abc123',
      ref: 'main',
      count: 2,
      files: [{ path: 'a.ts' }, { path: 'b.ts' }]
    }))
    const evaluate = vi.fn(async (_key: string, opts: { kind: string; files: unknown }) => {
      // source'un dosyaları gerçekten evaluate'e aktı mı?
      expect(Array.isArray(opts.files)).toBe(true)
      expect((opts.files as unknown[]).length).toBe(2)
      return { results: [{ ruleId: 'r1', outcome: 'pass', note: '' }], total: 1 }
    })
    const services: FlowServices = {
      resolveProject: async (key) => ({ key, name: 'Demo' }),
      pullFiles,
      evaluate,
      scoreCoverage: async () => ({ score: 90, level: 'A', earnedWeight: 9, totalWeight: 10 }),
      evaluateGate: async () => ({ passed: true, reasons: [] }),
      notify: async () => ({ delivered: 1, failed: 0 })
    }

    const engine = new FlowEngine(createDefaultRegistry(), services)
    const graph = parseGraph({
      nodes: [
        { id: 'p', type: 'project', position: { x: 0, y: 0 }, params: { projectKey: 'demo' } },
        { id: 's', type: 'source', position: { x: 1, y: 0 }, params: { mode: 'project' } },
        { id: 'e', type: 'evaluate', position: { x: 2, y: 0 } },
        { id: 'c', type: 'coverage', position: { x: 3, y: 0 } },
        { id: 'g', type: 'gate', position: { x: 4, y: 0 } },
        { id: 'n', type: 'notify', position: { x: 5, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'p', sourceHandle: 'project', target: 's', targetHandle: 'project' },
        { id: 'e2', source: 'p', sourceHandle: 'project', target: 'e', targetHandle: 'project' },
        { id: 'e3', source: 's', sourceHandle: 'files', target: 'e', targetHandle: 'files' },
        { id: 'e4', source: 'p', sourceHandle: 'project', target: 'c', targetHandle: 'project' },
        { id: 'e5', source: 'e', sourceHandle: 'ruleResults', target: 'c', targetHandle: 'ruleResults' },
        { id: 'e6', source: 'p', sourceHandle: 'project', target: 'g', targetHandle: 'project' },
        { id: 'e7', source: 'c', sourceHandle: 'coverage', target: 'g', targetHandle: 'coverage' },
        { id: 'e8', source: 'p', sourceHandle: 'project', target: 'n', targetHandle: 'project' },
        { id: 'e9', source: 'g', sourceHandle: 'gate', target: 'n', targetHandle: 'gate' }
      ]
    })

    const res = await engine.run(graph)
    expect(res.status).toBe('succeeded')
    expect(Object.values(res.nodeStatus).every((s) => s === 'succeeded')).toBe(true)
    expect((res.outputs.n?.notification as { delivered: number }).delivered).toBe(1)
    expect(pullFiles).toHaveBeenCalledWith('demo', expect.objectContaining({ mode: 'project' }))
    expect(evaluate).toHaveBeenCalledWith('demo', expect.objectContaining({ kind: 'code' }))
  })

  it('servis bağlı değilse ilgili node hata verir, zincir kırılır', async () => {
    // Yalnızca resolveProject var; source servissiz → source fail, aşağısı skip.
    const engine = new FlowEngine(createDefaultRegistry(), {
      resolveProject: async (key) => ({ key, name: 'Demo' })
    })
    const graph = parseGraph({
      nodes: [
        { id: 'p', type: 'project', position: { x: 0, y: 0 }, params: { projectKey: 'demo' } },
        { id: 's', type: 'source', position: { x: 1, y: 0 } }
      ],
      edges: [{ id: 'e1', source: 'p', sourceHandle: 'project', target: 's', targetHandle: 'project' }]
    })
    const res = await engine.run(graph)
    expect(res.status).toBe('partial')
    expect(res.nodeStatus.p).toBe('succeeded')
    expect(res.nodeStatus.s).toBe('failed')
    expect(res.errors.join(' ')).toMatch(/Servis bağlı değil/)
  })
})
