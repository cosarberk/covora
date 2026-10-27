/**
 * @module @covora/flow/types
 *
 * Flow tip sistemi. Portlar ve değerler bu tiplerle etiketlenir; bağlanabilirlik
 * yapısal uyuma göre belirlenir (Blueprint pin mantığı). Primitive tipler,
 * listeler, adlı obje (struct) tipleri ve `any` (joker) desteklenir. Domain
 * struct'larının alanları bilindiği için "Break/Get" ara node'ları mümkündür.
 */

/** İlkel tip. */
export interface PrimitiveType {
  readonly kind: 'string' | 'number' | 'boolean'
}
/** Joker tip (her tiple bağlanır). */
export interface AnyType {
  readonly kind: 'any'
}
/** Homojen liste tipi. */
export interface ListType {
  readonly kind: 'list'
  readonly of: FlowType
}
/** Alanları bilinen obje/struct tipi (opsiyonel ad → domain struct). */
export interface ObjectType {
  readonly kind: 'object'
  readonly fields: Readonly<Record<string, FlowType>>
  /** Domain struct adı (renk + okunabilirlik); jenerik objede yok. */
  readonly name?: string
}

/** Flow veri tipi. */
export type FlowType = PrimitiveType | AnyType | ListType | ObjectType

/** Tip kurucuları (okunur tanım). */
export const T = {
  string: { kind: 'string' } as FlowType,
  number: { kind: 'number' } as FlowType,
  boolean: { kind: 'boolean' } as FlowType,
  any: { kind: 'any' } as FlowType,
  list: (of: FlowType): FlowType => ({ kind: 'list', of }),
  object: (fields: Readonly<Record<string, FlowType>>, name?: string): FlowType =>
    name === undefined ? { kind: 'object', fields } : { kind: 'object', fields, name }
} as const

/**
 * `source` tipindeki bir değer `target` tipli bir girişe atanabilir mi?
 * `any` iki yönde de joker; liste eleman tipiyle; obje ise yapısal (target'ın her
 * alanı source'ta uyumlu tiple bulunmalı — fazladan alan sorun değil).
 */
export const assignable = (source: FlowType, target: FlowType): boolean => {
  if (target.kind === 'any' || source.kind === 'any') return true
  if (source.kind !== target.kind) return false
  if (source.kind === 'list') return assignable(source.of, (target as ListType).of)
  if (source.kind === 'object') {
    const t = target as ObjectType
    return Object.entries(t.fields).every(([key, tf]) => {
      const sf = source.fields[key]
      return sf !== undefined && assignable(sf, tf)
    })
  }
  return true // aynı ilkel tip
}

/** Tipin okunur kısa adı (UI/log). */
export const typeName = (t: FlowType): string => {
  switch (t.kind) {
    case 'list':
      return `list<${typeName(t.of)}>`
    case 'object':
      return t.name ?? 'object'
    default:
      return t.kind
  }
}

const PRIMITIVE_COLOR: Record<string, string> = {
  string: '#3b82f6',
  number: '#10b981',
  boolean: '#f59e0b',
  any: '#64748b',
  list: '#14b8a6'
}

const STRUCT_COLOR: Record<string, string> = {
  Project: '#8b5cf6',
  FileSet: '#3b82f6',
  RuleResults: '#f59e0b',
  Coverage: '#10b981',
  GateDecision: '#ef4444',
  Notification: '#a855f7'
}

/** Tip → handle/edge rengi. */
export const typeColor = (t: FlowType): string => {
  if (t.kind === 'object' && t.name !== undefined) return STRUCT_COLOR[t.name] ?? '#64748b'
  return PRIMITIVE_COLOR[t.kind] ?? '#64748b'
}

// ── Domain struct tipleri (alanları Break/Get için bilinir) ──────────────────

export const PROJECT_T = T.object({ key: T.string, name: T.string }, 'Project')
export const FILESET_T = T.object(
  { mode: T.string, base: T.string, head: T.string, ref: T.string, count: T.number },
  'FileSet'
)
export const RULE_RESULTS_T = T.object(
  {
    results: T.list(T.object({ ruleId: T.string, outcome: T.string, note: T.string })),
    total: T.number
  },
  'RuleResults'
)
export const COVERAGE_T = T.object(
  { score: T.number, level: T.string, earnedWeight: T.number, totalWeight: T.number },
  'Coverage'
)
export const GATE_T = T.object({ passed: T.boolean, reasons: T.list(T.string) }, 'GateDecision')
export const NOTIFICATION_T = T.object({ delivered: T.number, failed: T.number }, 'Notification')
