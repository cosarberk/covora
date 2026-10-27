/**
 * @module @covora/flow/subflow
 *
 * Alt-blueprint kompozisyonu: bir blueprint'i başka bir blueprint içinde tek node
 * olarak kullanma. İki parça:
 *
 *  1. **Arayüz** — bir blueprint'in dış portları, içindeki `input`/`output` sınır
 *     node'larından türetilir ({@link blueprintInterface}). Böylece bir alt-blueprint
 *     fonksiyon gibi tipli giriş/çıkışlara sahip olur.
 *  2. **Genişletme** — çalıştırmadan önce graf düzleştirilir ({@link expandGraph}):
 *     her `subflow` node'u, referans verdiği blueprint'in grafıyla (benzersiz id
 *     ön ekiyle) yerine konur ve üst grafın kenarları alt-blueprint'in sınır
 *     node'larına yeniden bağlanır. Motor yalnızca düzleştirilmiş grafı görür —
 *     yani dinamik portları doğrulamak/çalıştırmak zorunda kalmaz, aynı DAG
 *     mantığı geçerli kalır. Döngüsel referanslar tespit edilip reddedilir.
 */

import type { PortSpec } from './node-type.js'
import type { FlowGraph, FlowNode, FlowEdge } from './graph.js'
import {
  COVERAGE_T,
  FILESET_T,
  GATE_T,
  NOTIFICATION_T,
  PROJECT_T,
  RULE_RESULTS_T,
  T,
  type FlowType
} from './types.js'

/** Arayüz giriş portu node türü. */
export const INPUT_NODE_TYPE = 'input'
/** Arayüz çıkış portu node türü. */
export const OUTPUT_NODE_TYPE = 'output'
/** Alt-blueprint referans node türü. */
export const SUBFLOW_NODE_TYPE = 'subflow'

/** Giriş sınır node'unun (gömülünce dışarıdan beslenen) giriş portu adı. */
export const BOUNDARY_IN_PORT = 'in'
/** Çıkış sınır node'unun (gömülünce dışarıya veren) çıkış portu adı. */
export const BOUNDARY_OUT_PORT = 'out'

/** Prefix ayırıcı — orijinal node id'leri bunu içeremez (üst-sahip çözümü için). */
const SEP = '/'

const asString = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** Arayüz/param tip seçiminde kullanılan tip anahtarları (UI select + çözümleme). */
export const FLOW_TYPE_KEYS = [
  'any',
  'string',
  'number',
  'boolean',
  'Project',
  'FileSet',
  'RuleResults',
  'Coverage',
  'GateDecision',
  'Notification'
] as const

const STRUCT_BY_NAME: Readonly<Record<string, FlowType>> = {
  Project: PROJECT_T,
  FileSet: FILESET_T,
  RuleResults: RULE_RESULTS_T,
  Coverage: COVERAGE_T,
  GateDecision: GATE_T,
  Notification: NOTIFICATION_T
}

/** Tip anahtarını ({@link FLOW_TYPE_KEYS}) FlowType'a çevirir; bilinmeyen → any. */
export const flowTypeFromKey = (key: string): FlowType => {
  if (key === 'string') return T.string
  if (key === 'number') return T.number
  if (key === 'boolean') return T.boolean
  return STRUCT_BY_NAME[key] ?? T.any
}

/** Bir FlowType'ı serileştirilebilir tip anahtarına indirger (UI select değeri). */
export const flowTypeKey = (type: FlowType): string => {
  if (type.kind === 'object' && type.name !== undefined) return type.name
  if (type.kind === 'string' || type.kind === 'number' || type.kind === 'boolean') return type.kind
  return 'any'
}

/** Bir blueprint'in dış arayüzü (gömülünce subflow node'unun portları). */
export interface BlueprintInterface {
  readonly inputs: readonly PortSpec[]
  readonly outputs: readonly PortSpec[]
}

/**
 * Bir grafın dış arayüzünü içindeki `input`/`output` sınır node'larından türetir.
 * Giriş portları `input` node'larından (ad/etiket/tip/zorunluluk param'larıyla),
 * çıkış portları `output` node'larından gelir.
 */
export const blueprintInterface = (graph: FlowGraph): BlueprintInterface => {
  const inputs: PortSpec[] = []
  const outputs: PortSpec[] = []
  for (const node of graph.nodes) {
    const name = asString(node.params.name)
    if (name.length === 0) continue
    const label = asString(node.params.label) || name
    const type = flowTypeFromKey(asString(node.params.type) || 'any')
    if (node.type === INPUT_NODE_TYPE) {
      inputs.push({ name, label, type, required: node.params.required === true })
    } else if (node.type === OUTPUT_NODE_TYPE) {
      outputs.push({ name, label, type })
    }
  }
  return { inputs, outputs }
}

/** {@link expandGraph} seçenekleri. */
export interface ExpandOptions {
  /** Bir alt-blueprint'in grafını anahtar (+ ops. sürüm) ile çözer; yoksa null. */
  readonly resolve: (key: string, version?: number) => Promise<FlowGraph | null>
  /** Azami iç içe geçme derinliği (güvenlik ağı). */
  readonly maxDepth?: number
}

const DEFAULT_MAX_DEPTH = 16

/** Bir grafın içindeki alt-blueprint referans (`subflow`) node id'leri → anahtarları. */
const boundaryMaps = (
  sub: FlowGraph,
  subPrefix: string
): { in: Map<string, string>; out: Map<string, string> } => {
  const inMap = new Map<string, string>()
  const outMap = new Map<string, string>()
  for (const node of sub.nodes) {
    const name = asString(node.params.name)
    if (name.length === 0) continue
    if (node.type === INPUT_NODE_TYPE) inMap.set(name, subPrefix + node.id)
    else if (node.type === OUTPUT_NODE_TYPE) outMap.set(name, subPrefix + node.id)
  }
  return { in: inMap, out: outMap }
}

/**
 * Bir grafı düzleştirir: her `subflow` node'unu referans verdiği blueprint'in
 * grafıyla (benzersiz `subflowNodeId/` ön ekiyle) yerine koyar. Üst grafın bir
 * subflow'a giren kenarı, alt-blueprint'in ilgili `input` sınır node'unun `in`
 * portuna; bir subflow'dan çıkan kenarı ilgili `output` sınır node'unun `out`
 * portuna yeniden bağlanır. Sınır node'ları saf pass-through olduğundan değer,
 * üst graftan alt grafın içine (ve geri) kesintisiz akar.
 *
 * Döngüsel referans (a → b → a) ve derinlik aşımı net hatayla reddedilir. Sonuç,
 * yalnızca gerçek (çalıştırılabilir) node'lardan oluşur — hiç `subflow` node'u
 * kalmaz; böylece {@link FlowEngine} standart DAG mantığıyla koşturur.
 *
 * @param graph - Düzleştirilecek (üst) graf.
 * @param options - Alt-blueprint çözücü + derinlik sınırı.
 * @returns Düzleştirilmiş graf.
 */
export const expandGraph = async (graph: FlowGraph, options: ExpandOptions): Promise<FlowGraph> => {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH

  const recurse = async (
    g: FlowGraph,
    prefix: string,
    stack: readonly string[],
    depth: number
  ): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> => {
    if (depth > maxDepth) throw new Error(`Alt-blueprint iç içe geçme sınırı aşıldı (${maxDepth})`)
    const nodes: FlowNode[] = []
    const edges: FlowEdge[] = []
    const nodeById = new Map(g.nodes.map((n) => [n.id, n]))
    // subflow node id (ön ekli) → sınır eşlemesi (port adı → iç sınır node id'si).
    const boundary = new Map<string, { in: Map<string, string>; out: Map<string, string> }>()

    for (const node of g.nodes) {
      if (node.id.includes(SEP)) throw new Error(`Geçersiz node kimliği ("${SEP}" içeremez): ${node.id}`)
      const pid = prefix + node.id
      if (node.type !== SUBFLOW_NODE_TYPE) {
        nodes.push({ ...node, id: pid })
        continue
      }
      const key = asString(node.params.blueprintKey)
      if (key.length === 0) throw new Error(`Alt-blueprint seçilmemiş (node: ${node.id})`)
      if (stack.includes(key)) {
        throw new Error(`Döngüsel alt-blueprint referansı: ${[...stack, key].join(' → ')}`)
      }
      const versionRaw = node.params.blueprintVersion
      const version = typeof versionRaw === 'number' && Number.isFinite(versionRaw) ? versionRaw : undefined
      const sub = await options.resolve(key, version)
      if (sub === null) throw new Error(`Alt-blueprint bulunamadı: ${key}`)
      const subPrefix = pid + SEP
      const expanded = await recurse(sub, subPrefix, [...stack, key], depth + 1)
      nodes.push(...expanded.nodes)
      edges.push(...expanded.edges)
      boundary.set(pid, boundaryMaps(sub, subPrefix))
    }

    for (const edge of g.edges) {
      const srcNode = nodeById.get(edge.source)
      const dstNode = nodeById.get(edge.target)
      if (srcNode === undefined || dstNode === undefined) continue // sarkan kenar atlanır
      let source = prefix + edge.source
      let sourceHandle = edge.sourceHandle
      let target = prefix + edge.target
      let targetHandle = edge.targetHandle
      if (srcNode.type === SUBFLOW_NODE_TYPE) {
        const inner = boundary.get(prefix + edge.source)?.out.get(edge.sourceHandle)
        if (inner === undefined) continue // alt-blueprint'te böyle bir çıkış portu yok
        source = inner
        sourceHandle = BOUNDARY_OUT_PORT
      }
      if (dstNode.type === SUBFLOW_NODE_TYPE) {
        const inner = boundary.get(prefix + edge.target)?.in.get(edge.targetHandle)
        if (inner === undefined) continue // alt-blueprint'te böyle bir giriş portu yok
        target = inner
        targetHandle = BOUNDARY_IN_PORT
      }
      edges.push({ id: prefix + edge.id, source, sourceHandle, target, targetHandle })
    }

    return { nodes, edges }
  }

  const { nodes, edges } = await recurse(graph, '', [], 0)
  return { nodes, edges }
}

/** Genişletilmiş bir node id'sinin üst-sahip (orijinal üst graf) node id'si. */
export const ownerOf = (expandedId: string): string => {
  const i = expandedId.indexOf(SEP)
  return i < 0 ? expandedId : expandedId.slice(0, i)
}

/** Genişletilmiş id, doğrudan `ownerId` alt-blueprint'inin (bir seviye) parçası mı. */
export const isDirectChildOf = (expandedId: string, ownerId: string): boolean => {
  const head = ownerId + SEP
  if (!expandedId.startsWith(head)) return false
  return !expandedId.slice(head.length).includes(SEP)
}
