/**
 * @module @covora/flow
 *
 * Covora Flow — gerçek Blueprint motoru. Node/port tip sistemi, graf şeması ve
 * yürütme motoru. Tek kaynak: backend bu defteri çalıştırır, frontend aynı
 * defterden çizer (dekoratif değil).
 */

export * from './types.js'
export * from './node-type.js'
export * from './graph.js'
export * from './engine.js'
export * from './subflow.js'
export * from './nodes/index.js'

import type { NodeTypeDef, ParamSpec, PortSpec } from './node-type.js'
import { NodeRegistry } from './node-type.js'
import { CONVERTER_NODES } from './nodes/converters.js'
import { DOMAIN_NODES } from './nodes/domain.js'
import { INTERFACE_NODES } from './nodes/interface.js'

/** Converter (saf) node'larla dolu bir kayıt defteri üretir. */
export const createConverterRegistry = (): NodeRegistry => new NodeRegistry([...CONVERTER_NODES])

/**
 * Tüm yerleşik node'larla (converter + domain + arayüz/kompozisyon) dolu bir
 * kayıt defteri üretir. Backend motoru bunu servislerle, frontend paleti servissiz
 * (yalnızca metadata) kullanır.
 */
export const createDefaultRegistry = (): NodeRegistry =>
  new NodeRegistry([...CONVERTER_NODES, ...DOMAIN_NODES, ...INTERFACE_NODES])

/** Yerleşik node türlerinin tamamı (palet/ serileştirme için). */
export const ALL_NODE_TYPES = [...CONVERTER_NODES, ...DOMAIN_NODES, ...INTERFACE_NODES] as const

/**
 * Bir node türünün serileştirilebilir metadata'sı (execute'suz). Frontend paleti
 * ve node gövdesi bunu çizer; backend node-tipleri uç noktası bunu döner — tek
 * kaynak (defter) hem server'ı hem UI'ı besler.
 */
export interface NodeTypeMeta {
  readonly type: string
  readonly category: string
  readonly label: string
  readonly glyph: string
  readonly description: string
  readonly inputs: readonly PortSpec[]
  readonly outputs: readonly PortSpec[]
  readonly params: readonly ParamSpec[]
}

/** Bir node tanımını serileştirilebilir metadata'ya indirger (execute atlanır). */
export const toNodeTypeMeta = (def: NodeTypeDef): NodeTypeMeta => ({
  type: def.type,
  category: def.category,
  label: def.label,
  glyph: def.glyph,
  description: def.description,
  inputs: def.inputs,
  outputs: def.outputs,
  params: def.params ?? []
})

/** Tüm yerleşik node türlerinin palet metadata'sı. */
export const nodeCatalog = (): NodeTypeMeta[] => ALL_NODE_TYPES.map(toNodeTypeMeta)
