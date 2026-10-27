/**
 * @module @covora/db/repositories/blueprint
 *
 * Studio Builder akışı (Blueprint) veri erişimi. Blueprint'ler çalışma-alanı
 * geneli, adlı ve VERSİYONLU'dur: her kayıt değişmez bir `BlueprintVersion`
 * snapshot'ı üretir (geri alma/diff). Bir sürüm çalıştırıldığında `BlueprintRun`
 * yaratılır; grafın her node'u için bir `BlueprintNodeRun` izi tohumlanır ve
 * yürütme motoru (server) ilerledikçe durum/çıktı/log güncellenir. Canlı akış
 * review run'larıyla aynı SSE deseniyle yayınlanır.
 *
 * Graf burada opak JSON olarak saklanır; şema doğrulaması (@covora/flow) server
 * katmanında yapılır — böylece db katmanı flow motoruna bağımlı kalmaz.
 */

import type { LogLevel, RunStatus, StepStatus } from '@covora/types'
import type { Prisma, PrismaClient } from '@prisma/client'

/** Graf JSON'undan okunabilen asgari node bilgisi (node-run tohumlama için). */
interface GraphNodeLite {
  readonly id: string
  readonly type: string
}

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString())

const readGraphNodes = (graph: unknown): GraphNodeLite[] => {
  if (graph === null || typeof graph !== 'object') return []
  const nodes = (graph as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) return []
  return nodes
    .filter((n): n is { id: string; type: string } =>
      n !== null && typeof n === 'object' && typeof (n as { id?: unknown }).id === 'string' && typeof (n as { type?: unknown }).type === 'string'
    )
    .map((n) => ({ id: n.id, type: n.type }))
}

/** Liste satırı. */
export interface BlueprintSummary {
  readonly key: string
  readonly name: string
  readonly description: string
  readonly latestVersion: number
  readonly createdAt: string
  readonly updatedAt: string
}

/** Tek bir blueprint (bir sürümün grafı ile). */
export interface BlueprintDetail extends BlueprintSummary {
  readonly version: number
  readonly graph: unknown
}

/** Sürüm geçmişi satırı. */
export interface BlueprintVersionSummary {
  readonly version: number
  readonly note: string | null
  readonly createdBy: string | null
  readonly createdAt: string
}

/** Run liste/özet satırı. */
export interface BlueprintRunSummary {
  readonly id: string
  readonly blueprintKey: string
  readonly version: number
  readonly status: RunStatus
  readonly trigger: string | null
  readonly error: string | null
  readonly createdAt: string
  readonly startedAt: string | null
  readonly finishedAt: string | null
}

/** Bir node'un yürütme izi. */
export interface BlueprintNodeRunDTO {
  readonly nodeId: string
  readonly nodeType: string
  readonly status: StepStatus
  readonly output: unknown
  readonly error: string | null
  readonly startedAt: string | null
  readonly finishedAt: string | null
}

/** Run detayı (node izleriyle). */
export interface BlueprintRunDetail extends BlueprintRunSummary {
  readonly nodeRuns: readonly BlueprintNodeRunDTO[]
}

/** Run log satırı. */
export interface BlueprintRunLogLine {
  readonly seq: number
  readonly at: string
  readonly level: LogLevel
  readonly nodeId: string | null
  readonly message: string
}

// ── CRUD + versiyon ──────────────────────────────────────────────────────────

/** Tüm blueprint'leri (yeniden eskiye) listeler. */
export const listBlueprints = async (prisma: PrismaClient): Promise<BlueprintSummary[]> => {
  const rows = await prisma.blueprint.findMany({ orderBy: { updatedAt: 'desc' } })
  return rows.map((b) => ({
    key: b.key,
    name: b.name,
    description: b.description,
    latestVersion: b.latestVersion,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString()
  }))
}

/** Bir blueprint'i (varsayılan en güncel sürümün grafıyla) getirir. */
export const getBlueprint = async (
  prisma: PrismaClient,
  key: string,
  version?: number
): Promise<BlueprintDetail | null> => {
  const b = await prisma.blueprint.findUnique({ where: { key } })
  if (b === null) return null
  const wanted = version ?? b.latestVersion
  const ver = await prisma.blueprintVersion.findUnique({
    where: { blueprintId_version: { blueprintId: b.id, version: wanted } }
  })
  return {
    key: b.key,
    name: b.name,
    description: b.description,
    latestVersion: b.latestVersion,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    version: ver?.version ?? 0,
    graph: ver?.graph ?? { nodes: [], edges: [] }
  }
}

/** Yeni bir blueprint yaratır ve ilk sürümü (v1) kaydeder. */
export const createBlueprint = async (
  prisma: PrismaClient,
  input: { readonly key: string; readonly name: string; readonly description?: string; readonly graph: unknown; readonly createdBy?: string }
): Promise<{ readonly key: string; readonly version: number }> => {
  const b = await prisma.blueprint.create({
    data: {
      key: input.key,
      name: input.name,
      description: input.description ?? '',
      latestVersion: 1,
      versions: {
        create: {
          version: 1,
          graph: input.graph as Prisma.InputJsonValue,
          ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {})
        }
      }
    },
    select: { key: true }
  })
  return { key: b.key, version: 1 }
}

/** Mevcut bir blueprint'e yeni sürüm ekler ve `latestVersion`'ı artırır. */
export const saveBlueprintVersion = async (
  prisma: PrismaClient,
  key: string,
  input: { readonly graph: unknown; readonly note?: string; readonly createdBy?: string }
): Promise<{ readonly version: number }> => {
  return prisma.$transaction(async (tx) => {
    const b = await tx.blueprint.findUnique({ where: { key }, select: { id: true, latestVersion: true } })
    if (b === null) throw new Error(`Blueprint bulunamadı: ${key}`)
    const next = b.latestVersion + 1
    await tx.blueprintVersion.create({
      data: {
        blueprintId: b.id,
        version: next,
        graph: input.graph as Prisma.InputJsonValue,
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {})
      }
    })
    await tx.blueprint.update({ where: { id: b.id }, data: { latestVersion: next } })
    return { version: next }
  })
}

/** Ad/açıklama günceller. */
export const renameBlueprint = async (
  prisma: PrismaClient,
  key: string,
  patch: { readonly name?: string; readonly description?: string }
): Promise<void> => {
  await prisma.blueprint.update({
    where: { key },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {})
    }
  })
}

/** Bir blueprint'in en güncel grafını yeni bir blueprint'e (v1) kopyalar. */
export const duplicateBlueprint = async (
  prisma: PrismaClient,
  key: string,
  target: { readonly key: string; readonly name: string }
): Promise<{ readonly key: string }> => {
  const src = await getBlueprint(prisma, key)
  if (src === null) throw new Error(`Blueprint bulunamadı: ${key}`)
  await createBlueprint(prisma, { key: target.key, name: target.name, graph: src.graph })
  return { key: target.key }
}

/** Blueprint'i (tüm sürüm/run'larıyla, cascade) siler. */
export const deleteBlueprint = async (prisma: PrismaClient, key: string): Promise<void> => {
  await prisma.blueprint.delete({ where: { key } })
}

/** Sürüm geçmişini (yeniden eskiye) getirir. */
export const listBlueprintVersions = async (
  prisma: PrismaClient,
  key: string
): Promise<BlueprintVersionSummary[]> => {
  const b = await prisma.blueprint.findUnique({ where: { key }, select: { id: true } })
  if (b === null) return []
  const rows = await prisma.blueprintVersion.findMany({
    where: { blueprintId: b.id },
    orderBy: { version: 'desc' }
  })
  return rows.map((v) => ({
    version: v.version,
    note: v.note,
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString()
  }))
}

// ── Run yaşam döngüsü ─────────────────────────────────────────────────────────

/**
 * Bir sürümü `queued` olarak çalıştırmaya alır ve grafın her node'u için bir
 * `BlueprintNodeRun` izi (`pending`) tohumlar.
 *
 * @returns Oluşturulan run kimliği.
 */
export const createBlueprintRun = async (
  prisma: PrismaClient,
  input: { readonly key: string; readonly version?: number; readonly trigger?: string; readonly inputs?: unknown }
): Promise<{ readonly id: string }> => {
  const b = await prisma.blueprint.findUnique({ where: { key: input.key }, select: { id: true, latestVersion: true } })
  if (b === null) throw new Error(`Blueprint bulunamadı: ${input.key}`)
  const wanted = input.version ?? b.latestVersion
  const ver = await prisma.blueprintVersion.findUnique({
    where: { blueprintId_version: { blueprintId: b.id, version: wanted } },
    select: { id: true, graph: true }
  })
  if (ver === null) throw new Error(`Sürüm bulunamadı: ${input.key} v${wanted}`)
  const nodes = readGraphNodes(ver.graph)
  const run = await prisma.blueprintRun.create({
    data: {
      blueprintId: b.id,
      versionId: ver.id,
      status: 'queued',
      ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
      ...(input.inputs !== undefined ? { inputs: input.inputs as Prisma.InputJsonValue } : {}),
      nodeRuns: {
        create: nodes.map((n) => ({ nodeId: n.id, nodeType: n.type, status: 'pending' as StepStatus }))
      }
    },
    select: { id: true }
  })
  return { id: run.id }
}

/** Run'ı `running` yapar ve başlangıç zamanını damgalar. */
export const markBlueprintRunStarted = async (prisma: PrismaClient, runId: string): Promise<void> => {
  await prisma.blueprintRun.updateMany({
    where: { id: runId, startedAt: null },
    data: { status: 'running', startedAt: new Date() }
  })
}

/** Bir node'un durumunu/çıktısını/zamanını günceller. */
export const updateBlueprintNodeRun = async (
  prisma: PrismaClient,
  runId: string,
  nodeId: string,
  patch: { readonly status: StepStatus; readonly output?: unknown; readonly error?: string | null }
): Promise<void> => {
  const now = new Date()
  const data: Prisma.BlueprintNodeRunUpdateManyMutationInput = { status: patch.status }
  if (patch.status === 'running') data.startedAt = now
  if (patch.status === 'succeeded' || patch.status === 'failed' || patch.status === 'skipped' || patch.status === 'cancelled') {
    data.finishedAt = now
  }
  if (patch.output !== undefined) data.output = patch.output as Prisma.InputJsonValue
  if (patch.error !== undefined) data.error = patch.error
  await prisma.blueprintNodeRun.updateMany({ where: { runId, nodeId }, data })
}

/** Run'a (opsiyonel bir node'a) log satırı ekler. `seq` mevcut en yüksek + 1. */
export const appendBlueprintLog = async (
  prisma: PrismaClient,
  runId: string,
  line: { readonly level: LogLevel; readonly message: string; readonly nodeId?: string }
): Promise<BlueprintRunLogLine> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await prisma.blueprintRunLog.findFirst({
      where: { runId },
      orderBy: { seq: 'desc' },
      select: { seq: true }
    })
    const seq = last === null ? 0 : last.seq + 1
    try {
      const created = await prisma.blueprintRunLog.create({
        data: { runId, seq, level: line.level, message: line.message, nodeId: line.nodeId ?? null }
      })
      return { seq: created.seq, at: created.at.toISOString(), level: created.level, nodeId: created.nodeId, message: created.message }
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'P2002' && attempt < 4) continue
      throw error
    }
  }
  throw new Error('Log satırı yazılamadı')
}

/** Run'ı terminal duruma getirir. */
export const finishBlueprintRun = async (
  prisma: PrismaClient,
  runId: string,
  patch: { readonly status: RunStatus; readonly error?: string }
): Promise<void> => {
  await prisma.blueprintRun.update({
    where: { id: runId },
    data: { status: patch.status, finishedAt: new Date(), ...(patch.error !== undefined ? { error: patch.error } : {}) }
  })
}

const toRunSummary = (run: {
  id: string
  version: { version: number }
  blueprint: { key: string }
  status: RunStatus
  trigger: string | null
  error: string | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}): BlueprintRunSummary => ({
  id: run.id,
  blueprintKey: run.blueprint.key,
  version: run.version.version,
  status: run.status,
  trigger: run.trigger,
  error: run.error,
  createdAt: run.createdAt.toISOString(),
  startedAt: iso(run.startedAt),
  finishedAt: iso(run.finishedAt)
})

/** Run'ları (opsiyonel blueprint filtresiyle, yeniden eskiye) listeler. */
export const listBlueprintRuns = async (
  prisma: PrismaClient,
  options: { readonly key?: string; readonly limit?: number } = {}
): Promise<BlueprintRunSummary[]> => {
  const runs = await prisma.blueprintRun.findMany({
    where: options.key !== undefined ? { blueprint: { key: options.key } } : {},
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 50,
    include: { blueprint: { select: { key: true } }, version: { select: { version: true } } }
  })
  return runs.map(toRunSummary)
}

/** Bir run'ı node izleriyle getirir. */
export const getBlueprintRun = async (prisma: PrismaClient, runId: string): Promise<BlueprintRunDetail | null> => {
  const run = await prisma.blueprintRun.findUnique({
    where: { id: runId },
    include: { blueprint: { select: { key: true } }, version: { select: { version: true } }, nodeRuns: true }
  })
  if (run === null) return null
  return {
    ...toRunSummary(run),
    nodeRuns: run.nodeRuns.map((n) => ({
      nodeId: n.nodeId,
      nodeType: n.nodeType,
      status: n.status,
      output: n.output,
      error: n.error,
      startedAt: iso(n.startedAt),
      finishedAt: iso(n.finishedAt)
    }))
  }
}

/** Bir run'ın log satırlarını (opsiyonel verilen seq'ten sonrasını) getirir. */
export const getBlueprintRunLogs = async (
  prisma: PrismaClient,
  runId: string,
  afterSeq?: number
): Promise<BlueprintRunLogLine[]> => {
  const logs = await prisma.blueprintRunLog.findMany({
    where: { runId, ...(afterSeq !== undefined ? { seq: { gt: afterSeq } } : {}) },
    orderBy: { seq: 'asc' }
  })
  return logs.map((l) => ({ seq: l.seq, at: l.at.toISOString(), level: l.level, nodeId: l.nodeId, message: l.message }))
}
