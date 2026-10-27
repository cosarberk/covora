/**
 * @module @covora/flow/engine
 *
 * Gerçek Blueprint yürütme motoru. Bir grafı doğrular (tip uyumu, zorunlu
 * girişler, port varlığı, çevrim), topolojik sıralar ve her node'u kenarlardan
 * gelen GERÇEK değerlerle koşar. Üst node başarısız olursa bağımlı node'lar
 * atlanır (değer akmadığı için). Her node başı/sonu `FlowEmitter` ile yayınlanır
 * — server bunu RunSink'e bağlayıp SSE üzerinden UI'a canlı akıtır.
 */

import type { NodeExecuteContext, NodeOutputs, NodeRegistry, FlowServices, FlowLogLevel } from './node-type.js'
import type { FlowGraph } from './graph.js'
import { assignable, typeName } from './types.js'

/** Doğrulama/yürütme hatası. */
export interface FlowError {
  readonly code: string
  readonly message: string
  readonly nodeId?: string
  readonly edgeId?: string
}

export type NodeRunStatus = 'succeeded' | 'skipped' | 'failed'
export type FlowRunStatus = 'succeeded' | 'partial' | 'failed' | 'invalid'

/** Yürütme sırasında node başı/sonu ve log olaylarını alan dinleyici. */
export interface FlowEmitter {
  nodeStarted?: (nodeId: string) => void | Promise<void>
  nodeFinished?: (
    nodeId: string,
    status: NodeRunStatus,
    output?: NodeOutputs,
    error?: string
  ) => void | Promise<void>
  log?: (nodeId: string, level: FlowLogLevel, message: string) => void | Promise<void>
}

/** Yürütme sonucu. */
export interface FlowRunResult {
  readonly status: FlowRunStatus
  /** nodeId → üretilen çıkış değerleri (atlanan/başarısız node'lar eksik). */
  readonly outputs: Readonly<Record<string, NodeOutputs>>
  readonly nodeStatus: Readonly<Record<string, NodeRunStatus>>
  readonly errors: readonly string[]
}

interface TopoResult {
  readonly order: readonly string[]
  readonly hasCycle: boolean
}

/** Kahn topolojik sıralama; çevrim varsa `hasCycle`. */
const topoSort = (graph: FlowGraph): TopoResult => {
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of graph.nodes) {
    indeg.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of graph.edges) {
    const list = adj.get(e.source)
    if (list === undefined || !indeg.has(e.target)) continue
    list.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }
  const queue = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  const order: string[] = []
  while (queue.length > 0) {
    const cur = queue.shift()
    if (cur === undefined) break
    order.push(cur)
    for (const nxt of adj.get(cur) ?? []) {
      const d = (indeg.get(nxt) ?? 0) - 1
      indeg.set(nxt, d)
      if (d === 0) queue.push(nxt)
    }
  }
  return { order, hasCycle: order.length < graph.nodes.length }
}

export class FlowEngine {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly services: FlowServices = {},
    private readonly emitter: FlowEmitter = {}
  ) {}

  /** Grafı statik olarak doğrular; boş dizi = geçerli. */
  validate(graph: FlowGraph): FlowError[] {
    const errors: FlowError[] = []
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))

    for (const n of graph.nodes) {
      if (!this.registry.has(n.type)) {
        errors.push({ code: 'unknown_node', message: `Bilinmeyen node türü: ${n.type}`, nodeId: n.id })
      }
    }

    for (const e of graph.edges) {
      const src = nodeById.get(e.source)
      const dst = nodeById.get(e.target)
      if (src === undefined || dst === undefined) {
        errors.push({ code: 'dangling_edge', message: 'Kenar var olmayan node\'a bağlı', edgeId: e.id })
        continue
      }
      const outPort = this.registry.port(src.type, 'output', e.sourceHandle)
      const inPort = this.registry.port(dst.type, 'input', e.targetHandle)
      if (outPort === undefined) {
        errors.push({ code: 'unknown_port', message: `Çıkış portu yok: ${src.type}.${e.sourceHandle}`, edgeId: e.id })
        continue
      }
      if (inPort === undefined) {
        errors.push({ code: 'unknown_port', message: `Giriş portu yok: ${dst.type}.${e.targetHandle}`, edgeId: e.id })
        continue
      }
      if (!assignable(outPort.type, inPort.type)) {
        errors.push({
          code: 'type_mismatch',
          message: `Tip uyuşmazlığı: ${typeName(outPort.type)} → ${typeName(inPort.type)}`,
          edgeId: e.id
        })
      }
    }

    for (const n of graph.nodes) {
      const def = this.registry.get(n.type)
      if (def === undefined) continue
      for (const port of def.inputs) {
        if (port.required !== true) continue
        const connected = graph.edges.some((e) => e.target === n.id && e.targetHandle === port.name)
        if (!connected) {
          errors.push({
            code: 'missing_required',
            message: `Zorunlu giriş bağlı değil: ${def.label}.${port.label}`,
            nodeId: n.id
          })
        }
      }
    }

    const { hasCycle } = topoSort(graph)
    if (hasCycle) errors.push({ code: 'cycle', message: 'Grafta döngü var (DAG değil)' })

    return errors
  }

  private paramDefaults(type: string): Record<string, unknown> {
    const def = this.registry.get(type)
    const out: Record<string, unknown> = {}
    for (const p of def?.params ?? []) if (p.default !== undefined) out[p.name] = p.default
    return out
  }

  /** Grafı çalıştırır. Geçersizse `status: 'invalid'` ve hata listesi döner. */
  async run(graph: FlowGraph, opts: { readonly signal?: AbortSignal } = {}): Promise<FlowRunResult> {
    const validationErrors = this.validate(graph)
    if (validationErrors.length > 0) {
      return { status: 'invalid', outputs: {}, nodeStatus: {}, errors: validationErrors.map((e) => e.message) }
    }

    const { order } = topoSort(graph)
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
    const outputs: Record<string, NodeOutputs> = {}
    const nodeStatus: Record<string, NodeRunStatus> = {}
    const runErrors: string[] = []

    for (const id of order) {
      const node = nodeById.get(id)
      if (node === undefined) continue
      const def = this.registry.get(node.type)
      if (def === undefined) {
        nodeStatus[id] = 'failed'
        continue
      }

      // Kenarlardan girişleri topla; zorunlu bir giriş akmıyorsa node atlanır.
      const inputs: Record<string, unknown> = {}
      let missing = false
      for (const port of def.inputs) {
        const edge = graph.edges.find((e) => e.target === id && e.targetHandle === port.name)
        if (edge === undefined) {
          if (port.required === true) missing = true
          continue
        }
        const up = outputs[edge.source]
        if (up === undefined || !(edge.sourceHandle in up)) {
          if (port.required === true) missing = true
          continue
        }
        inputs[port.name] = up[edge.sourceHandle]
      }
      if (missing) {
        nodeStatus[id] = 'skipped'
        await this.emitter.nodeFinished?.(id, 'skipped')
        continue
      }

      const params = { ...this.paramDefaults(node.type), ...node.params }
      const log = (level: FlowLogLevel, message: string): void | Promise<void> => this.emitter.log?.(id, level, message)
      const ctx: NodeExecuteContext = {
        params,
        inputs,
        log,
        services: this.services,
        ...(opts.signal !== undefined ? { signal: opts.signal } : {})
      }

      await this.emitter.nodeStarted?.(id)
      try {
        const out = await def.execute(ctx)
        outputs[id] = out
        nodeStatus[id] = 'succeeded'
        await this.emitter.nodeFinished?.(id, 'succeeded', out)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        nodeStatus[id] = 'failed'
        runErrors.push(`${def.label}: ${msg}`)
        await this.emitter.nodeFinished?.(id, 'failed', undefined, msg)
      }
    }

    const statuses = Object.values(nodeStatus)
    const anyFailed = statuses.includes('failed')
    const anyOk = statuses.includes('succeeded')
    const status: FlowRunStatus = anyFailed ? (anyOk ? 'partial' : 'failed') : 'succeeded'
    return { status, outputs, nodeStatus, errors: runErrors }
  }
}
