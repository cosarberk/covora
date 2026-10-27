/**
 * @module @covora/flow/node-type
 *
 * Bir node türünün sözleşmesi: tipli giriş/çıkış portları, düzenlenebilir
 * parametreler ve `execute`. Motor bu defteri çalıştırır; frontend aynı defterden
 * paleti ve node gövdesini çizer (tek kaynak → dekoratif değil). Domain node'ları
 * `services` üzerinden gerçek covora servislerini çağırır; converter node'ları
 * saftır (servis kullanmaz).
 */

import type { FlowType } from './types.js'

/** Tipli bir port (giriş ya da çıkış). */
export interface PortSpec {
  readonly name: string
  readonly label: string
  readonly type: FlowType
  /** Giriş portu için: bağlantı zorunlu mu. */
  readonly required?: boolean
}

/** Node gövdesinde elle düzenlenen bir parametre (kabloyla gelmeyen değer). */
export interface ParamSpec {
  readonly name: string
  readonly label: string
  readonly control: 'text' | 'number' | 'boolean' | 'select' | 'code'
  readonly options?: readonly string[]
  readonly placeholder?: string
  readonly default?: unknown
}

/**
 * Motorun bir domain node'una enjekte ettiği gerçek covora servisleri. Server
 * tarafında implemente edilir; converter node'ları bunu kullanmaz. Metotlar
 * opsiyonel — eksikse ilgili node çalışırken anlamlı hata verir.
 */
export interface FlowServices {
  readonly resolveProject?: (key: string) => Promise<{ readonly key: string; readonly name: string } | null>
  readonly pullFiles?: (
    projectKey: string,
    opts: { readonly mode: 'changes' | 'project'; readonly base?: string; readonly head?: string; readonly ref?: string }
  ) => Promise<{
    readonly mode: string
    readonly base: string
    readonly head: string
    readonly ref: string
    readonly count: number
    /** Toplanan dosyalar (aşağı akışa taşınır; port tipinde görünmez, çalışma değeri). */
    readonly files: unknown
  }>
  readonly evaluate?: (
    projectKey: string,
    opts: { readonly kind: string; readonly files: unknown }
  ) => Promise<{ readonly results: ReadonlyArray<{ ruleId: string; outcome: string; note: string }>; readonly total: number }>
  readonly scoreCoverage?: (
    projectKey: string,
    opts: { readonly kind: string; readonly ruleResults: unknown }
  ) => Promise<{ readonly score: number; readonly level: string; readonly earnedWeight: number; readonly totalWeight: number }>
  readonly evaluateGate?: (
    projectKey: string,
    coverage: unknown
  ) => Promise<{ readonly passed: boolean; readonly reasons: readonly string[] }>
  readonly notify?: (
    projectKey: string,
    gate: unknown
  ) => Promise<{ readonly delivered: number; readonly failed: number }>
}

/** Log seviyesi (RunSink ile hizalı). */
export type FlowLogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Bir node'un `execute` çağrısına verilen bağlam. */
export interface NodeExecuteContext {
  /** Node'un elle girilmiş parametreleri. */
  readonly params: Readonly<Record<string, unknown>>
  /** Giriş portu adına göre, kablolardan gelen gerçek değerler. */
  readonly inputs: Readonly<Record<string, unknown>>
  /** Yürütme logu (node'a iliştirilir, SSE ile yayınlanır). */
  readonly log: (level: FlowLogLevel, message: string) => void | Promise<void>
  /** Enjekte edilen domain servisleri (converter'lar için boş olabilir). */
  readonly services: FlowServices
  /** İptal sinyali (opsiyonel). */
  readonly signal?: AbortSignal
}

/** `execute` sonucu: çıkış portu adına göre üretilen değerler. */
export type NodeOutputs = Record<string, unknown>

/** Node yürütme fonksiyonu. */
export type NodeExecute = (ctx: NodeExecuteContext) => NodeOutputs | Promise<NodeOutputs>

/** Bir node türünün tam tanımı. */
export interface NodeTypeDef {
  readonly type: string
  readonly category: string
  readonly label: string
  readonly glyph: string
  readonly description: string
  readonly inputs: readonly PortSpec[]
  readonly outputs: readonly PortSpec[]
  readonly params?: readonly ParamSpec[]
  readonly execute: NodeExecute
}

/** Node türü kayıt defteri. */
export class NodeRegistry {
  private readonly map = new Map<string, NodeTypeDef>()

  constructor(defs: readonly NodeTypeDef[] = []) {
    for (const def of defs) this.register(def)
  }

  register(def: NodeTypeDef): void {
    if (this.map.has(def.type)) throw new Error(`Node türü zaten kayıtlı: ${def.type}`)
    this.map.set(def.type, def)
  }

  get(type: string): NodeTypeDef | undefined {
    return this.map.get(type)
  }

  has(type: string): boolean {
    return this.map.has(type)
  }

  all(): readonly NodeTypeDef[] {
    return [...this.map.values()]
  }

  /** Port tanımını node türü + port adından bulur. */
  port(type: string, dir: 'input' | 'output', name: string): PortSpec | undefined {
    const def = this.map.get(type)
    if (def === undefined) return undefined
    return (dir === 'input' ? def.inputs : def.outputs).find((p) => p.name === name)
  }
}
