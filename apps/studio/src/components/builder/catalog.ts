/**
 * @module studio/components/builder/catalog
 *
 * Builder artık backend defterinden beslenir: node türleri `/node-types`'tan
 * (@covora/flow registry'si) gelir — tek kaynak. Bu modül o metadata etrafındaki
 * saf yardımcıları sağlar: tip rengi/uyumu (@covora/flow'dan), handle id kodlama
 * ve bir bağlantının tip-uyumluluk kontrolü (Blueprint pin mantığı).
 */

import {
  assignable,
  SUBFLOW_NODE_TYPE,
  typeColor,
  typeName,
  type FlowType,
  type NodeTypeMeta,
  type PortSpec
} from '@covora/flow'

export { assignable, typeColor, typeName }
export type { FlowType, NodeTypeMeta, PortSpec }

/** `Alt-Blueprint` node türü (portları dinamik — gömülen blueprint'in arayüzünden). */
export const SUBFLOW_TYPE = SUBFLOW_NODE_TYPE

/** Bir React Flow grafındaki (hafif) node görünümü — tip çözümü için yeter. */
export interface GraphNodeLite {
  readonly id: string
  readonly data: { readonly nodeType?: string; readonly params?: Readonly<Record<string, unknown>> }
}

/** Node türü → metadata hızlı erişim defteri. */
export type NodeTypeIndex = ReadonlyMap<string, NodeTypeMeta>

/** Bir blueprint'in dış arayüzü (subflow portları bundan türer). */
export interface BlueprintInterface {
  readonly inputs: readonly PortSpec[]
  readonly outputs: readonly PortSpec[]
}

/** blueprint anahtarı → dış arayüz defteri (subflow node'ları için). */
export type InterfaceIndex = ReadonlyMap<string, BlueprintInterface>

const EMPTY_PORTS: BlueprintInterface = { inputs: [], outputs: [] }

/** Metadata listesinden defter kurar. */
export const buildIndex = (types: readonly NodeTypeMeta[]): NodeTypeIndex =>
  new Map(types.map((t) => [t.type, t]))

/**
 * Bir node örneğinin GERÇEK portları. Normal node'lar için defterdeki statik
 * metadata; `Alt-Blueprint` (subflow) node'u için ise gömdüğü blueprint'in dış
 * arayüzü (params.blueprintKey → interface). Böylece subflow node'u, referans
 * verdiği blueprint'in Giriş/Çıkış portlarıyla çizilir ve tip-kontrolü yapılır.
 */
export const effectivePorts = (
  index: NodeTypeIndex,
  interfaces: InterfaceIndex,
  nodeType: string | undefined,
  params: Readonly<Record<string, unknown>> | undefined
): BlueprintInterface => {
  if (nodeType === SUBFLOW_TYPE) {
    const key = typeof params?.blueprintKey === 'string' ? params.blueprintKey : ''
    return (key !== '' ? interfaces.get(key) : undefined) ?? EMPTY_PORTS
  }
  const meta = nodeType !== undefined ? index.get(nodeType) : undefined
  return meta ?? EMPTY_PORTS
}

/** Bir node örneğinin bir portunun tipi (subflow dahil). */
export const effectivePortType = (
  index: NodeTypeIndex,
  interfaces: InterfaceIndex,
  nodeType: string | undefined,
  params: Readonly<Record<string, unknown>> | undefined,
  dir: 'in' | 'out',
  name: string
): FlowType | undefined => {
  const ports = effectivePorts(index, interfaces, nodeType, params)
  return (dir === 'in' ? ports.inputs : ports.outputs).find((p) => p.name === name)?.type
}

/**
 * React Flow handle id'si: `${yön}:${portAdı}`. Graf kenarında yalnızca port adı
 * saklanır (motor bunu kullanır); yön öneki aynı adlı giriş+çıkış portlarının
 * (örn. cast.value) handle çakışmasını önler.
 */
export const handleId = (dir: 'in' | 'out', portName: string): string => `${dir}:${portName}`

/** Handle id'sini yön + port adına ayırır. */
export const parseHandle = (id: string | null | undefined): { dir: 'in' | 'out'; name: string } | null => {
  if (id == null) return null
  const idx = id.indexOf(':')
  if (idx < 0) return null
  const dir = id.slice(0, idx)
  if (dir !== 'in' && dir !== 'out') return null
  return { dir, name: id.slice(idx + 1) }
}

/** Bir node türünün bir portunun tipini bulur. */
export const portType = (
  index: NodeTypeIndex,
  nodeType: string | undefined,
  dir: 'in' | 'out',
  name: string
): FlowType | undefined => {
  if (nodeType === undefined) return undefined
  const meta = index.get(nodeType)
  if (meta === undefined) return undefined
  const ports = dir === 'in' ? meta.inputs : meta.outputs
  return ports.find((p) => p.name === name)?.type
}

/** Bir bağlantının tip-uyumlu olup olmadığını (çıkış → giriş) belirler. */
export const connectionCompatible = (
  index: NodeTypeIndex,
  interfaces: InterfaceIndex,
  nodes: readonly GraphNodeLite[],
  conn: { source?: string | null; sourceHandle?: string | null; target?: string | null; targetHandle?: string | null }
): boolean => {
  if (conn.source == null || conn.target == null) return false
  if (conn.source === conn.target) return false
  const src = parseHandle(conn.sourceHandle)
  const dst = parseHandle(conn.targetHandle)
  if (src === null || dst === null || src.dir !== 'out' || dst.dir !== 'in') return false
  const srcNode = nodes.find((n) => n.id === conn.source)
  const dstNode = nodes.find((n) => n.id === conn.target)
  const outType = effectivePortType(index, interfaces, srcNode?.data.nodeType, srcNode?.data.params, 'out', src.name)
  const inType = effectivePortType(index, interfaces, dstNode?.data.nodeType, dstNode?.data.params, 'in', dst.name)
  if (outType === undefined || inType === undefined) return false
  return assignable(outType, inType)
}
