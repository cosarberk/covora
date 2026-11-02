/**
 * @module @covora/server/routes/blueprints
 *
 * Studio Builder (Blueprint) yönetim uç noktaları — kullanıcı JWT'siyle korunur.
 * Blueprint CRUD + versiyonlama + çalıştırma + canlı akış (SSE) + node-tipi
 * paleti. Çalıştırma, grafı gerçek motorla (fire-and-forget) koşturur; UI akışı
 * `/blueprint-runs/:id/events` üzerinden izler.
 */

import { blueprintInterface, nodeCatalog, parseGraph, type NodeTypeMeta } from '@covora/flow'
import type {
  BlueprintDetail,
  BlueprintRunDetail,
  BlueprintRunLogLine,
  BlueprintRunSummary,
  BlueprintSummary,
  BlueprintVersionSummary
} from '@covora/db'
import type { FastifyInstance } from 'fastify'

import type { BlueprintEventBus } from '../services/blueprint-events.js'
import { streamBlueprintRunEvents } from './blueprint-sse.js'

/** Blueprint route bağımlılıkları. */
export interface BlueprintRoutesDeps {
  readonly bus: BlueprintEventBus
  readonly listBlueprints: () => Promise<readonly BlueprintSummary[]>
  readonly getBlueprint: (key: string, version?: number) => Promise<BlueprintDetail | null>
  readonly createBlueprint: (input: {
    readonly key: string
    readonly name: string
    readonly description?: string
    readonly graph: unknown
    readonly createdBy?: string
  }) => Promise<{ readonly key: string; readonly version: number }>
  readonly saveBlueprintVersion: (
    key: string,
    input: { readonly graph: unknown; readonly note?: string; readonly createdBy?: string }
  ) => Promise<{ readonly version: number }>
  readonly renameBlueprint: (key: string, patch: { readonly name?: string; readonly description?: string }) => Promise<void>
  readonly duplicateBlueprint: (
    key: string,
    target: { readonly key: string; readonly name: string }
  ) => Promise<{ readonly key: string }>
  readonly deleteBlueprint: (key: string) => Promise<void>
  readonly listBlueprintVersions: (key: string) => Promise<readonly BlueprintVersionSummary[]>
  readonly createBlueprintRun: (input: {
    readonly key: string
    readonly version?: number
    readonly trigger?: string
  }) => Promise<{ readonly id: string }>
  readonly listBlueprintRuns: (options: { readonly key?: string; readonly limit?: number }) => Promise<readonly BlueprintRunSummary[]>
  readonly getBlueprintRun: (runId: string) => Promise<BlueprintRunDetail | null>
  readonly getBlueprintRunLogs: (runId: string, afterSeq?: number) => Promise<readonly BlueprintRunLogLine[]>
  /** Bir run'ı gerçek motorla tetikler (beklemeden; akış SSE ile). */
  readonly startRun: (args: { readonly runId: string; readonly graph: unknown }) => void
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/**
 * Blueprint yönetim + çalıştırma route'larını kaydeder.
 *
 * @param app - Fastify örneği.
 * @param deps - Blueprint bağımlılıkları.
 */
export const registerBlueprintRoutes = (app: FastifyInstance, deps: BlueprintRoutesDeps): void => {
  // ── Node-tipi paleti (defterden; UI bunu çizer) ──────────────────────────
  app.get('/node-types', async (_request, reply) => {
    const types: NodeTypeMeta[] = nodeCatalog()
    return reply.send({ types })
  })

  // ── Blueprint CRUD + versiyon ────────────────────────────────────────────
  app.get('/blueprints', async (_request, reply) => {
    const blueprints = await deps.listBlueprints()
    return reply.send({ blueprints })
  })

  app.post('/blueprints', async (request, reply) => {
    const body = request.body as { key?: string; name?: string; description?: string; graph?: unknown }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name.length === 0) return reply.status(400).send({ error: 'Ad zorunlu' })
    const key = typeof body.key === 'string' && body.key.length > 0 ? slugify(body.key) : slugify(name)
    if (key.length === 0) return reply.status(400).send({ error: 'Geçerli bir anahtar üretilemedi' })
    const graph = body.graph ?? { nodes: [], edges: [] }
    try {
      parseGraph(graph)
    } catch (error) {
      return reply.status(400).send({ error: `Geçersiz graf: ${error instanceof Error ? error.message : String(error)}` })
    }
    const existing = await deps.getBlueprint(key)
    if (existing !== null) return reply.status(409).send({ error: `Bu anahtar kullanımda: ${key}` })
    const created = await deps.createBlueprint({
      key,
      name,
      graph,
      ...(typeof body.description === 'string' ? { description: body.description } : {}),
      ...(request.user?.email !== undefined ? { createdBy: request.user.email } : {})
    })
    return reply.status(201).send(created)
  })

  app.get('/blueprints/:key', async (request, reply) => {
    const { key } = request.params as { key: string }
    const query = request.query as { version?: string }
    const version = query.version !== undefined ? Number(query.version) : undefined
    const blueprint = await deps.getBlueprint(
      key,
      version !== undefined && Number.isFinite(version) ? version : undefined
    )
    if (blueprint === null) return reply.status(404).send({ error: 'Blueprint bulunamadı' })
    return reply.send(blueprint)
  })

  // Yeni sürüm kaydet (graf snapshot'ı; latestVersion artar).
  app.put('/blueprints/:key', async (request, reply) => {
    const { key } = request.params as { key: string }
    const body = request.body as { graph?: unknown; note?: string }
    if (body.graph === undefined) return reply.status(400).send({ error: 'graph zorunlu' })
    try {
      parseGraph(body.graph)
    } catch (error) {
      return reply.status(400).send({ error: `Geçersiz graf: ${error instanceof Error ? error.message : String(error)}` })
    }
    const existing = await deps.getBlueprint(key)
    if (existing === null) return reply.status(404).send({ error: 'Blueprint bulunamadı' })
    const saved = await deps.saveBlueprintVersion(key, {
      graph: body.graph,
      ...(typeof body.note === 'string' ? { note: body.note } : {}),
      ...(request.user?.email !== undefined ? { createdBy: request.user.email } : {})
    })
    return reply.send(saved)
  })

  // Ad/açıklama güncelle.
  app.patch('/blueprints/:key', async (request, reply) => {
    const { key } = request.params as { key: string }
    const body = request.body as { name?: string; description?: string }
    const existing = await deps.getBlueprint(key)
    if (existing === null) return reply.status(404).send({ error: 'Blueprint bulunamadı' })
    await deps.renameBlueprint(key, {
      ...(typeof body.name === 'string' ? { name: body.name.trim() } : {}),
      ...(typeof body.description === 'string' ? { description: body.description } : {})
    })
    return reply.status(204).send()
  })

  app.delete('/blueprints/:key', async (request, reply) => {
    const { key } = request.params as { key: string }
    const existing = await deps.getBlueprint(key)
    if (existing === null) return reply.status(404).send({ error: 'Blueprint bulunamadı' })
    await deps.deleteBlueprint(key)
    return reply.status(204).send()
  })

  app.post('/blueprints/:key/duplicate', async (request, reply) => {
    const { key } = request.params as { key: string }
    const body = request.body as { name?: string; key?: string }
    const existing = await deps.getBlueprint(key)
    if (existing === null) return reply.status(404).send({ error: 'Blueprint bulunamadı' })
    const name = typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : `${existing.name} (kopya)`
    const targetKey = typeof body.key === 'string' && body.key.length > 0 ? slugify(body.key) : slugify(name)
    if ((await deps.getBlueprint(targetKey)) !== null) {
      return reply.status(409).send({ error: `Bu anahtar kullanımda: ${targetKey}` })
    }
    const result = await deps.duplicateBlueprint(key, { key: targetKey, name })
    return reply.status(201).send(result)
  })

  app.get('/blueprints/:key/versions', async (request, reply) => {
    const { key } = request.params as { key: string }
    const versions = await deps.listBlueprintVersions(key)
    return reply.send({ versions })
  })

  // Alt-blueprint arayüzü: içindeki Giriş/Çıkış node'larından türeyen dış portlar.
  // UI, bir `Alt-Blueprint` node'unu bu arayüzle (tipli portlarla) çizer.
  app.get('/blueprints/:key/interface', async (request, reply) => {
    const { key } = request.params as { key: string }
    const query = request.query as { version?: string }
    const version = query.version !== undefined ? Number(query.version) : undefined
    const blueprint = await deps.getBlueprint(
      key,
      version !== undefined && Number.isFinite(version) ? version : undefined
    )
    if (blueprint === null) return reply.status(404).send({ error: 'Blueprint bulunamadı' })
    try {
      return reply.send(blueprintInterface(parseGraph(blueprint.graph)))
    } catch (error) {
      return reply.status(400).send({ error: `Graf okunamadı: ${error instanceof Error ? error.message : String(error)}` })
    }
  })

  // ── Çalıştırma ───────────────────────────────────────────────────────────
  app.post('/blueprints/:key/run', async (request, reply) => {
    const { key } = request.params as { key: string }
    const body = (request.body ?? {}) as { version?: number }
    const version = typeof body.version === 'number' && Number.isFinite(body.version) ? body.version : undefined
    const blueprint = await deps.getBlueprint(key, version)
    if (blueprint === null) return reply.status(404).send({ error: 'Blueprint bulunamadı' })
    const run = await deps.createBlueprintRun({
      key,
      ...(version !== undefined ? { version } : {}),
      trigger: 'manual'
    })
    // Gerçek motoru beklemeden tetikle; UI akışı SSE ile izler.
    deps.startRun({ runId: run.id, graph: blueprint.graph })
    return reply.status(202).send({ runId: run.id })
  })

  // ── Run okuma + canlı akış ────────────────────────────────────────────────
  app.get('/blueprint-runs', async (request, reply) => {
    const query = request.query as { key?: string; limit?: string }
    const limit = query.limit !== undefined ? Number(query.limit) : undefined
    const runs = await deps.listBlueprintRuns({
      ...(typeof query.key === 'string' && query.key.length > 0 ? { key: query.key } : {}),
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {})
    })
    return reply.send({ runs })
  })

  app.get('/blueprint-runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const run = await deps.getBlueprintRun(id)
    if (run === null) return reply.status(404).send({ error: 'Run bulunamadı' })
    return reply.send(run)
  })

  app.get('/blueprint-runs/:id/logs', async (request, reply) => {
    const { id } = request.params as { id: string }
    const query = request.query as { afterSeq?: string }
    const afterSeq = query.afterSeq !== undefined ? Number(query.afterSeq) : undefined
    const logs = await deps.getBlueprintRunLogs(
      id,
      afterSeq !== undefined && Number.isFinite(afterSeq) ? afterSeq : undefined
    )
    return reply.send({ logs })
  })

  app.get('/blueprint-runs/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string }
    await streamBlueprintRunEvents(request, reply, deps, id)
  })
}
