/**
 * @module @covora/server/services/blueprint-runner
 *
 * Bir blueprint sürümünü GERÇEKTEN çalıştıran orkestratör. Grafı @covora/flow
 * motoruyla doğrular + topolojik koşturur; motorun node başı/sonu/log olaylarını
 * hem DB'ye (blueprint repository) kalıcılaştırır hem de canlı olay yoluna
 * yayınlar (SSE → UI'da gerçek node yanması). Review worker'ının run-sink deseninin
 * node-granüler karşılığıdır.
 */

import {
  BOUNDARY_OUT_PORT,
  expandGraph,
  FlowEngine,
  isDirectChildOf,
  OUTPUT_NODE_TYPE,
  ownerOf,
  parseGraph,
  SUBFLOW_NODE_TYPE,
  type FlowRunStatus,
  type NodeRegistry,
  type NodeRunStatus
} from '@covora/flow'
import {
  appendBlueprintLog,
  finishBlueprintRun,
  markBlueprintRunStarted,
  updateBlueprintNodeRun
} from '@covora/db'
import type { BlueprintNodeRunDTO, PrismaClient } from '@covora/db'
import type { FlowServices } from '@covora/flow'
import type { LogLevel, RunStatus, StepStatus } from '@covora/types'

import type { BlueprintEventBus } from './blueprint-events.js'

/** {@link runBlueprint} bağımlılıkları. */
export interface BlueprintRunnerDeps {
  readonly prisma: PrismaClient
  readonly bus: BlueprintEventBus
  /** Yerleşik node'larla (converter + domain) dolu kayıt defteri. */
  readonly registry: NodeRegistry
  /** Domain node'larına enjekte edilecek gerçek servisler. */
  readonly services: FlowServices
  /**
   * Bir alt-blueprint'in (subflow) grafını anahtar (+ ops. sürüm) ile çözer; graf
   * çalıştırmadan önce yerinde açılır (expand). Yoksa null.
   */
  readonly loadGraph: (key: string, version?: number) => Promise<unknown | null>
}

const ERR = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** FlowRunStatus → kalıcı RunStatus. */
const toRunStatus = (status: FlowRunStatus): RunStatus => {
  switch (status) {
    case 'succeeded':
      return 'succeeded'
    case 'partial':
      return 'degraded'
    default:
      return 'failed'
  }
}

/** NodeRunStatus → kalıcı StepStatus. */
const toStepStatus = (status: NodeRunStatus): StepStatus => status

/**
 * Bir alt-blueprint üst node'unun (subflow) durumunu iç node durumlarından toplar:
 * herhangi biri başarısızsa başarısız; biri başarılıysa başarılı; aksi halde
 * (hepsi atlandı / hiç koşmadı) atlandı.
 */
const aggregateStatus = (statuses: readonly NodeRunStatus[]): NodeRunStatus =>
  statuses.includes('failed') ? 'failed' : statuses.includes('succeeded') ? 'succeeded' : 'skipped'

const MAX_ARRAY = 50
const MAX_STRING = 2000

/**
 * Node çıktısını kalıcılık/akış için güvenli bir önizlemeye indirger: büyük
 * diziler (örn. dosya içerikleri) özetlenir, uzun metinler kırpılır. Böylece
 * `source` node'unun tüm dosya gövdesi DB'ye/SSE'ye taşınmaz.
 */
const preview = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (kırpıldı)` : value
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) return `[${value.length} öğe — gizlendi]`
    return depth >= 4 ? `[${value.length} öğe]` : value.map((v) => preview(v, depth + 1))
  }
  if (value !== null && typeof value === 'object') {
    if (depth >= 4) return '{…}'
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = preview(v, depth + 1)
    return out
  }
  return value
}

/**
 * Bir blueprint run'ını baştan sona yürütür. Hata olsa bile run'ı terminal
 * duruma getirir (asla asılı bırakmaz). Çağıran genelde beklemeden (fire-and-forget)
 * tetikler; UI akışı SSE ile izler.
 *
 * @param deps - Prisma, olay yolu, kayıt defteri ve servisler.
 * @param args - Run kimliği ve çalıştırılacak graf (sürüm snapshot'ı).
 */
export const runBlueprint = async (
  deps: BlueprintRunnerDeps,
  args: { readonly runId: string; readonly graph: unknown }
): Promise<void> => {
  const { prisma, bus, registry, services } = deps
  const { runId } = args
  const now = (): string => new Date().toISOString()

  let graph
  try {
    graph = parseGraph(args.graph)
  } catch (error) {
    await finishBlueprintRun(prisma, runId, { status: 'failed', error: `Graf okunamadı: ${ERR(error)}` })
    bus.publish({ type: 'bp.run.finished', runId, status: 'failed', at: now(), error: ERR(error) })
    return
  }

  // Alt-blueprint'leri (subflow) çalıştırmadan önce yerine aç: düzleştirilmiş graf
  // yalnızca gerçek node'lardan oluşur, motor standart DAG mantığıyla koşar. İç
  // node'ların durumu üst subflow node'una toplanarak canlı yansıtılır.
  let expanded
  try {
    expanded = await expandGraph(graph, {
      resolve: async (key, version) => {
        const sub = await deps.loadGraph(key, version)
        return sub == null ? null : parseGraph(sub)
      }
    })
  } catch (error) {
    await appendBlueprintLog(prisma, runId, {
      level: 'error',
      message: `Alt-blueprint genişletilemedi: ${ERR(error)}`
    }).then((line) => bus.publish({ type: 'bp.log.appended', runId, line }))
    await finishBlueprintRun(prisma, runId, { status: 'failed', error: ERR(error) })
    bus.publish({ type: 'bp.run.finished', runId, status: 'failed', at: now(), error: ERR(error) })
    return
  }

  // Üst (orijinal) graf node'ları: tohumlanmış node-run satırları bunlara karşılık
  // gelir. Genişletilmiş node id'leri `ownerOf` ile üst node'a eşlenir.
  const originalById = new Map(graph.nodes.map((n) => [n.id, n]))
  const typeOf = (nodeId: string): string => originalById.get(nodeId)?.type ?? 'unknown'
  const startedOwners = new Set<string>()

  const publishNode = (node: BlueprintNodeRunDTO): void => {
    bus.publish({ type: 'bp.node.updated', runId, node })
  }

  const engine = new FlowEngine(registry, services, {
    nodeStarted: async (expandedId) => {
      const owner = ownerOf(expandedId)
      // Düz üst node doğrudan; alt-blueprint iç node'u ise üst subflow'u bir kez yak.
      if (owner !== expandedId && startedOwners.has(owner)) return
      if (owner !== expandedId) startedOwners.add(owner)
      await updateBlueprintNodeRun(prisma, runId, owner, { status: 'running' })
      publishNode({
        nodeId: owner,
        nodeType: typeOf(owner),
        status: 'running',
        output: null,
        error: null,
        startedAt: now(),
        finishedAt: null
      })
    },
    nodeFinished: async (expandedId, status, output, error) => {
      // Alt-blueprint iç node'ları üst subflow node'una toplu olarak sonlandırılır
      // (koşu bitince); yalnızca üst-seviye düz node'lar burada sonlanır.
      if (ownerOf(expandedId) !== expandedId) return
      const outPreview = output !== undefined ? preview(output) : undefined
      await updateBlueprintNodeRun(prisma, runId, expandedId, {
        status: toStepStatus(status),
        ...(outPreview !== undefined ? { output: outPreview } : {}),
        ...(error !== undefined ? { error } : {})
      })
      publishNode({
        nodeId: expandedId,
        nodeType: typeOf(expandedId),
        status: toStepStatus(status),
        output: outPreview ?? null,
        error: error ?? null,
        startedAt: null,
        finishedAt: now()
      })
    },
    log: async (expandedId, level, message) => {
      const line = await appendBlueprintLog(prisma, runId, {
        level: level as LogLevel,
        message,
        nodeId: ownerOf(expandedId)
      })
      bus.publish({ type: 'bp.log.appended', runId, line })
    }
  })

  // Koşu bitince alt-blueprint (subflow) üst node'larını iç node sonuçlarından topla.
  const finalizeSubflowOwners = async (result: {
    readonly nodeStatus: Readonly<Record<string, NodeRunStatus>>
    readonly outputs: Readonly<Record<string, Record<string, unknown>>>
  }): Promise<void> => {
    for (const [ownerId, node] of originalById) {
      if (node.type !== SUBFLOW_NODE_TYPE) continue
      const innerStatuses = Object.entries(result.nodeStatus)
        .filter(([k]) => ownerOf(k) === ownerId && k !== ownerId)
        .map(([, s]) => s)
      const status = toStepStatus(aggregateStatus(innerStatuses))
      const outputs: Record<string, unknown> = {}
      for (const n of expanded.nodes) {
        if (n.type !== OUTPUT_NODE_TYPE || !isDirectChildOf(n.id, ownerId)) continue
        const name = typeof n.params.name === 'string' && n.params.name.length > 0 ? n.params.name : n.id
        const out = result.outputs[n.id]
        outputs[name] = out !== undefined ? preview(out[BOUNDARY_OUT_PORT]) : null
      }
      const summary = {
        blueprint: typeof node.params.blueprintKey === 'string' ? node.params.blueprintKey : '',
        outputs
      }
      await updateBlueprintNodeRun(prisma, runId, ownerId, { status, output: summary })
      publishNode({
        nodeId: ownerId,
        nodeType: SUBFLOW_NODE_TYPE,
        status,
        output: summary,
        error: null,
        startedAt: null,
        finishedAt: now()
      })
    }
  }

  await markBlueprintRunStarted(prisma, runId)
  bus.publish({ type: 'bp.run.updated', runId, status: 'running', at: now() })
  await appendBlueprintLog(prisma, runId, { level: 'info', message: 'Blueprint çalıştırması başladı' }).then((line) =>
    bus.publish({ type: 'bp.log.appended', runId, line })
  )

  try {
    const result = await engine.run(expanded)
    if (result.status === 'invalid') {
      const error = `Graf geçersiz: ${result.errors.join('; ')}`
      await appendBlueprintLog(prisma, runId, { level: 'error', message: error }).then((line) =>
        bus.publish({ type: 'bp.log.appended', runId, line })
      )
      await finishBlueprintRun(prisma, runId, { status: 'failed', error })
      bus.publish({ type: 'bp.run.finished', runId, status: 'failed', at: now(), error })
      return
    }
    await finalizeSubflowOwners(result)
    const status = toRunStatus(result.status)
    const error = result.errors.length > 0 ? result.errors.join('; ') : undefined
    await finishBlueprintRun(prisma, runId, { status, ...(error !== undefined ? { error } : {}) })
    bus.publish({ type: 'bp.run.finished', runId, status, at: now(), ...(error !== undefined ? { error } : {}) })
  } catch (error) {
    // Güvenlik ağı: motor beklenmedik şekilde patlarsa run asılı kalmasın.
    await finishBlueprintRun(prisma, runId, { status: 'failed', error: ERR(error) })
    bus.publish({ type: 'bp.run.finished', runId, status: 'failed', at: now(), error: ERR(error) })
  }
}
