/**
 * @module @covora/server/routes/management
 *
 * Yönetim (studio) uç noktaları: projeler, kurallar (audit'li CRUD) ve review
 * geçmişi.
 */

import {
  reviewKindSchema,
  ruleEvaluationTypeSchema,
  severitySchema,
  webhookEventSchema
} from '@covora/types'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { ManagementDeps, RulePatch } from '../services/management.js'

const upsertProjectBodySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1)
})

const createRuleBodySchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  kind: reviewKindSchema,
  evaluation: ruleEvaluationTypeSchema,
  severity: severitySchema,
  weight: z.number().positive(),
  prompt: z.string().nullable().optional(),
  enabled: z.boolean().optional()
})

const createPackBodySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  kind: reviewKindSchema
})

const assignPackBodySchema = z.object({
  packId: z.string().min(1)
})

const createWebhookBodySchema = z.object({
  url: z.string().min(1),
  events: z.array(webhookEventSchema).min(1)
})

const webhookPatchBodySchema = z.object({
  active: z.boolean()
})

const createProviderBodySchema = z.object({
  name: z.string().min(1),
  kind: reviewKindSchema,
  baseUrl: z.string().min(1),
  model: z.string().min(1),
  active: z.boolean().optional()
})

const rulePatchBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  severity: severitySchema.optional(),
  weight: z.number().positive().optional(),
  prompt: z.string().nullable().optional(),
  enabled: z.boolean().optional()
})

/**
 * İsteği yapan aktörü belirler (audit için). `x-covora-user` başlığı yoksa
 * `system` kabul edilir.
 *
 * @param request - Fastify isteği.
 * @returns Aktör kimliği.
 */
const getActor = (request: FastifyRequest): string => {
  const header = request.headers['x-covora-user']
  return typeof header === 'string' && header.length > 0 ? header : 'system'
}

/**
 * Yönetim route'larını kaydeder.
 *
 * @param app - Fastify örneği.
 * @param deps - Yönetim bağımlılıkları.
 */
export const registerManagementRoutes = (app: FastifyInstance, deps: ManagementDeps): void => {
  app.post('/projects', async (request, reply) => {
    const parsed = upsertProjectBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    const project = await deps.upsertProject(parsed.data.key, parsed.data.name)
    return reply.status(201).send(project)
  })

  app.get('/projects', async () => ({ projects: await deps.listProjects() }))

  app.delete('/projects/:key', async (request, reply) => {
    const { key } = request.params as { key: string }
    await deps.deleteProject(key)
    return reply.status(204).send()
  })

  app.get('/projects/:key/rules', async (request, reply) => {
    const { key } = request.params as { key: string }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }
    return reply.send({ rules: await deps.listRules(project.id) })
  })

  app.get('/packs', async () => ({ packs: await deps.listPacks() }))

  app.post('/packs', async (request, reply) => {
    const parsed = createPackBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    const pack = await deps.createPack({
      key: parsed.data.key,
      name: parsed.data.name,
      kind: parsed.data.kind,
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {})
    })
    return reply.status(201).send(pack)
  })

  app.delete('/packs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await deps.deletePack(id)
    return reply.status(204).send()
  })

  app.get('/packs/:id/rules', async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send({ rules: await deps.listRulesByPack(id) })
  })

  app.post('/packs/:id/rules', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = createRuleBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }

    const rule = await deps.createRule(
      {
        packId: id,
        key: parsed.data.key,
        title: parsed.data.title,
        kind: parsed.data.kind,
        evaluation: parsed.data.evaluation,
        severity: parsed.data.severity,
        weight: parsed.data.weight,
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.prompt !== undefined ? { prompt: parsed.data.prompt } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {})
      },
      getActor(request)
    )
    return reply.status(201).send(rule)
  })

  app.get('/projects/:key/packs', async (request, reply) => {
    const { key } = request.params as { key: string }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }
    return reply.send({ packs: await deps.listPacksByProject(project.id) })
  })

  app.post('/projects/:key/packs', async (request, reply) => {
    const { key } = request.params as { key: string }
    const parsed = assignPackBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }
    await deps.assignPackToProject(project.id, parsed.data.packId)
    return reply.status(204).send()
  })

  app.delete('/projects/:key/packs/:packId', async (request, reply) => {
    const { key, packId } = request.params as { key: string; packId: string }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }
    await deps.removePackFromProject(project.id, packId)
    return reply.status(204).send()
  })

  app.patch('/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = rulePatchBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }

    const patch: RulePatch = {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.severity !== undefined ? { severity: parsed.data.severity } : {}),
      ...(parsed.data.weight !== undefined ? { weight: parsed.data.weight } : {}),
      ...(parsed.data.prompt !== undefined ? { prompt: parsed.data.prompt } : {}),
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {})
    }

    await deps.updateRule(id, patch, getActor(request))
    return reply.status(204).send()
  })

  app.get('/rules/:id/audits', async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send({ audits: await deps.listRuleAudits(id) })
  })

  app.get('/projects/:key/reviews', async (request, reply) => {
    const { key } = request.params as { key: string }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }
    return reply.send({ reviews: await deps.listRecentReviews(project.id) })
  })

  app.get('/dashboard', async () => deps.getDashboard())

  app.get('/projects/:key/webhooks', async (request, reply) => {
    const { key } = request.params as { key: string }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }
    return reply.send({ webhooks: await deps.listWebhooks(project.id) })
  })

  app.post('/projects/:key/webhooks', async (request, reply) => {
    const { key } = request.params as { key: string }
    const parsed = createWebhookBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }
    const webhook = await deps.createWebhook({
      projectId: project.id,
      url: parsed.data.url,
      events: parsed.data.events
    })
    return reply.status(201).send(webhook)
  })

  app.patch('/webhooks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = webhookPatchBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    await deps.setWebhookActive(id, parsed.data.active)
    return reply.status(204).send()
  })

  app.delete('/webhooks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await deps.deleteWebhook(id)
    return reply.status(204).send()
  })

  app.get('/providers', async () => ({ providers: await deps.listProviders() }))

  app.post('/providers', async (request, reply) => {
    const parsed = createProviderBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    const provider = await deps.createProvider({
      name: parsed.data.name,
      kind: parsed.data.kind,
      baseUrl: parsed.data.baseUrl,
      model: parsed.data.model,
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {})
    })
    return reply.status(201).send(provider)
  })

  app.post('/providers/:id/activate', async (request, reply) => {
    const { id } = request.params as { id: string }
    await deps.setActiveProvider(id)
    return reply.status(204).send()
  })

  app.delete('/providers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await deps.deleteProvider(id)
    return reply.status(204).send()
  })
}
