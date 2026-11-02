import { describe, expect, it } from 'vitest'

import { FlowEngine } from './engine.js'
import { parseGraph, type FlowGraph } from './graph.js'
import { NodeRegistry } from './node-type.js'
import { CONVERTER_NODES } from './nodes/converters.js'
import { INTERFACE_NODES } from './nodes/interface.js'
import { blueprintInterface, expandGraph, SUBFLOW_NODE_TYPE } from './subflow.js'

/** Converter + arayüz node'larıyla taze defter (domain servisleri gerekmez). */
const registry = (): NodeRegistry => new NodeRegistry([...CONVERTER_NODES, ...INTERFACE_NODES])

/** Basit bir alt-blueprint: Giriş(val) → format("X={value}") → Çıkış(text). */
const subGraph = (): FlowGraph =>
  parseGraph({
    nodes: [
      { id: 'in', type: 'input', position: { x: 0, y: 0 }, params: { name: 'val', type: 'any' } },
      { id: 'fmt', type: 'format', position: { x: 1, y: 0 }, params: { template: 'X={value}' } },
      { id: 'out', type: 'output', position: { x: 2, y: 0 }, params: { name: 'text', type: 'string' } }
    ],
    edges: [
      { id: 'se1', source: 'in', sourceHandle: 'value', target: 'fmt', targetHandle: 'value' },
      { id: 'se2', source: 'fmt', sourceHandle: 'text', target: 'out', targetHandle: 'value' }
    ]
  })

describe('blueprintInterface', () => {
  it('Giriş/Çıkış node\'larından tipli portları türetir', () => {
    const iface = blueprintInterface(subGraph())
    expect(iface.inputs).toHaveLength(1)
    expect(iface.inputs[0]?.name).toBe('val')
    expect(iface.outputs).toHaveLength(1)
    expect(iface.outputs[0]?.name).toBe('text')
    expect(iface.outputs[0]?.type).toEqual({ kind: 'string' })
  })
})

describe('expandGraph', () => {
  it('subflow\'u referans grafıyla açar ve kenarları sınır node\'larına bağlar', async () => {
    const parent = parseGraph({
      nodes: [
        { id: 'lit', type: 'literal', position: { x: 0, y: 0 }, params: { value: 'hi' } },
        { id: 'sf', type: SUBFLOW_NODE_TYPE, position: { x: 1, y: 0 }, params: { blueprintKey: 'inc' } }
      ],
      edges: [{ id: 'e1', source: 'lit', sourceHandle: 'value', target: 'sf', targetHandle: 'val' }]
    })
    const expanded = await expandGraph(parent, { resolve: async (key) => (key === 'inc' ? subGraph() : null) })

    // Hiç subflow node'u kalmamalı; iç node'lar ön ekli olmalı.
    expect(expanded.nodes.some((n) => n.type === SUBFLOW_NODE_TYPE)).toBe(false)
    expect(expanded.nodes.map((n) => n.id).sort()).toEqual(['lit', 'sf/fmt', 'sf/in', 'sf/out'])

    // Üst kenar iç Giriş node'unun 'in' portuna yeniden bağlanmış olmalı.
    const rewired = expanded.edges.find((e) => e.source === 'lit')
    expect(rewired?.target).toBe('sf/in')
    expect(rewired?.targetHandle).toBe('in')

    // Düzleştirilmiş graf gerçek motorda uçtan uca koşar.
    const res = await new FlowEngine(registry()).run(expanded)
    expect(res.status).toBe('succeeded')
    expect(res.outputs['sf/fmt']?.text).toBe('X=hi')
    expect(res.outputs['sf/out']?.out).toBe('X=hi')
  })

  it('iç içe (nested) alt-blueprint\'leri derinlemesine açar', async () => {
    // mid: Giriş(v) → Alt-Blueprint(inc) → Çıkış(r)
    const mid = (): FlowGraph =>
      parseGraph({
        nodes: [
          { id: 'in', type: 'input', position: { x: 0, y: 0 }, params: { name: 'v' } },
          { id: 'sf', type: SUBFLOW_NODE_TYPE, position: { x: 1, y: 0 }, params: { blueprintKey: 'inc' } },
          { id: 'out', type: 'output', position: { x: 2, y: 0 }, params: { name: 'r' } }
        ],
        edges: [
          { id: 'me1', source: 'in', sourceHandle: 'value', target: 'sf', targetHandle: 'val' },
          { id: 'me2', source: 'sf', sourceHandle: 'text', target: 'out', targetHandle: 'value' }
        ]
      })
    const parent = parseGraph({
      nodes: [
        { id: 'lit', type: 'literal', position: { x: 0, y: 0 }, params: { value: 'yo' } },
        { id: 'top', type: SUBFLOW_NODE_TYPE, position: { x: 1, y: 0 }, params: { blueprintKey: 'mid' } }
      ],
      edges: [{ id: 'e1', source: 'lit', sourceHandle: 'value', target: 'top', targetHandle: 'v' }]
    })
    const resolve = async (key: string): Promise<FlowGraph | null> =>
      key === 'mid' ? mid() : key === 'inc' ? subGraph() : null
    const res = await new FlowEngine(registry()).run(await expandGraph(parent, { resolve }))
    expect(res.status).toBe('succeeded')
    expect(res.outputs['top/sf/fmt']?.text).toBe('X=yo')
  })

  it('döngüsel referansı reddeder', async () => {
    const selfRef = (): FlowGraph =>
      parseGraph({
        nodes: [{ id: 'sf', type: SUBFLOW_NODE_TYPE, position: { x: 0, y: 0 }, params: { blueprintKey: 'a' } }],
        edges: []
      })
    await expect(expandGraph(selfRef(), { resolve: async () => selfRef() })).rejects.toThrow(/Döngüsel/)
  })

  it('bulunamayan alt-blueprint\'i net hatayla reddeder', async () => {
    const g = parseGraph({
      nodes: [{ id: 'sf', type: SUBFLOW_NODE_TYPE, position: { x: 0, y: 0 }, params: { blueprintKey: 'yok' } }],
      edges: []
    })
    await expect(expandGraph(g, { resolve: async () => null })).rejects.toThrow(/bulunamadı/)
  })
})
