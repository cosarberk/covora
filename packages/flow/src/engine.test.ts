import { describe, expect, it } from 'vitest'

import { FlowEngine } from './engine.js'
import { parseGraph } from './graph.js'
import { NodeRegistry, type NodeTypeDef } from './node-type.js'
import { CONVERTER_NODES } from './nodes/converters.js'
import { T } from './types.js'

/** Her testte taze defter (converter'lar + istenirse ek test node'ları). */
const makeRegistry = (extra: readonly NodeTypeDef[] = []): NodeRegistry =>
  new NodeRegistry([...CONVERTER_NODES, ...extra])

describe('FlowEngine — yürütme', () => {
  it('doğrusal zinciri gerçek değerlerle koşar (literal → cast → format)', async () => {
    const engine = new FlowEngine(makeRegistry())
    const graph = parseGraph({
      nodes: [
        { id: 'lit', type: 'literal', position: { x: 0, y: 0 }, params: { valueType: 'number', value: '42' } },
        { id: 'cast', type: 'cast', position: { x: 1, y: 0 }, params: { to: 'string' } },
        { id: 'fmt', type: 'format', position: { x: 2, y: 0 }, params: { template: 'val={value}' } }
      ],
      edges: [
        { id: 'e1', source: 'lit', sourceHandle: 'value', target: 'cast', targetHandle: 'value' },
        { id: 'e2', source: 'cast', sourceHandle: 'value', target: 'fmt', targetHandle: 'value' }
      ]
    })
    const res = await engine.run(graph)
    expect(res.status).toBe('succeeded')
    expect(res.outputs.cast?.value).toBe('42')
    expect(res.outputs.fmt?.text).toBe('val=42')
  })

  it('obje alanını ayıklar (get)', async () => {
    const srcNode: NodeTypeDef = {
      type: 'src',
      category: 'Test',
      label: 'Kaynak',
      glyph: 's',
      description: 'test',
      inputs: [],
      outputs: [{ name: 'obj', label: 'obj', type: T.any }],
      execute: () => ({ obj: { score: 90, level: 'A' } })
    }
    const engine = new FlowEngine(makeRegistry([srcNode]))
    const graph = parseGraph({
      nodes: [
        { id: 's', type: 'src', position: { x: 0, y: 0 } },
        { id: 'g', type: 'get', position: { x: 1, y: 0 }, params: { field: 'score' } }
      ],
      edges: [{ id: 'e', source: 's', sourceHandle: 'obj', target: 'g', targetHandle: 'object' }]
    })
    const res = await engine.run(graph)
    expect(res.outputs.g?.value).toBe(90)
  })

  it('koşula göre dallandırır (branch)', async () => {
    const engine = new FlowEngine(makeRegistry())
    const graph = parseGraph({
      nodes: [
        { id: 'v', type: 'literal', position: { x: 0, y: 0 }, params: { valueType: 'string', value: 'hi' } },
        { id: 'c', type: 'literal', position: { x: 0, y: 1 }, params: { valueType: 'boolean', value: 'true' } },
        { id: 'b', type: 'branch', position: { x: 1, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'v', sourceHandle: 'value', target: 'b', targetHandle: 'value' },
        { id: 'e2', source: 'c', sourceHandle: 'value', target: 'b', targetHandle: 'cond' }
      ]
    })
    const res = await engine.run(graph)
    expect(res.outputs.b?.onTrue).toBe('hi')
    expect(res.outputs.b && 'onFalse' in res.outputs.b).toBe(false)
  })

  it('üst node patlarsa bağımlı node atlanır (hata yayılımı)', async () => {
    const boom: NodeTypeDef = {
      type: 'boom',
      category: 'Test',
      label: 'Patla',
      glyph: 'x',
      description: 'test',
      inputs: [{ name: 'value', label: 'v', type: T.any, required: true }],
      outputs: [{ name: 'out', label: 'o', type: T.any }],
      execute: () => {
        throw new Error('patladı')
      }
    }
    const engine = new FlowEngine(makeRegistry([boom]))
    const graph = parseGraph({
      nodes: [
        { id: 'lit', type: 'literal', position: { x: 0, y: 0 }, params: { value: 'x' } },
        { id: 'boom', type: 'boom', position: { x: 1, y: 0 } },
        { id: 'fmt', type: 'format', position: { x: 2, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'lit', sourceHandle: 'value', target: 'boom', targetHandle: 'value' },
        { id: 'e2', source: 'boom', sourceHandle: 'out', target: 'fmt', targetHandle: 'value' }
      ]
    })
    const res = await engine.run(graph)
    expect(res.status).toBe('partial')
    expect(res.nodeStatus.lit).toBe('succeeded')
    expect(res.nodeStatus.boom).toBe('failed')
    expect(res.nodeStatus.fmt).toBe('skipped')
  })
})

describe('FlowEngine — doğrulama', () => {
  it('çevrimi yakalar', () => {
    const engine = new FlowEngine(makeRegistry())
    const graph = parseGraph({
      nodes: [
        { id: 'a', type: 'format', position: { x: 0, y: 0 } },
        { id: 'b', type: 'format', position: { x: 1, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'a', sourceHandle: 'text', target: 'b', targetHandle: 'value' },
        { id: 'e2', source: 'b', sourceHandle: 'text', target: 'a', targetHandle: 'value' }
      ]
    })
    const errors = engine.validate(graph)
    expect(errors.some((e) => e.code === 'cycle')).toBe(true)
  })

  it('tip uyuşmazlığını yakalar (string → boolean)', () => {
    const engine = new FlowEngine(makeRegistry())
    const graph = parseGraph({
      nodes: [
        { id: 'f', type: 'format', position: { x: 0, y: 0 } },
        { id: 'b', type: 'branch', position: { x: 1, y: 0 } }
      ],
      edges: [{ id: 'e', source: 'f', sourceHandle: 'text', target: 'b', targetHandle: 'cond' }]
    })
    const errors = engine.validate(graph)
    expect(errors.some((e) => e.code === 'type_mismatch')).toBe(true)
  })

  it('bağlanmamış zorunlu girişi yakalar', () => {
    const engine = new FlowEngine(makeRegistry())
    const graph = parseGraph({
      nodes: [{ id: 'f', type: 'format', position: { x: 0, y: 0 } }],
      edges: []
    })
    const errors = engine.validate(graph)
    expect(errors.some((e) => e.code === 'missing_required')).toBe(true)
  })

  it('bilinmeyen node türünü yakalar', () => {
    const engine = new FlowEngine(makeRegistry())
    const graph = parseGraph({ nodes: [{ id: 'x', type: 'yok', position: { x: 0, y: 0 } }], edges: [] })
    const errors = engine.validate(graph)
    expect(errors.some((e) => e.code === 'unknown_node')).toBe(true)
  })
})
