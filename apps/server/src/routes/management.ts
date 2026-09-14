/**
 * @module @covora/server/routes/management
 *
 * Yönetim (studio) uç noktaları: projeler, kurallar (audit'li CRUD) ve review
 * geçmişi.
 */

import { reviewKindSchema, ruleEvaluationTypeSchema, severitySchema } from '@covora/types'
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

  app.get('/projects/:key/rules', async (request, reply) => {
    const { key } = request.params as { key: string }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }
    return reply.send({ rules: await deps.listRules(project.id) })
  })

  app.post('/projects/:key/rules', async (request, reply) => {
    const { key } = request.params as { key: string }
    const parsed = createRuleBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz istek', details: parsed.error.issues })
    }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }

    const rule = await deps.createRule(
      {
        projectId: project.id,
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

  app.get('/projects/:key/reviews', async (request, reply) => {
    const { key } = request.params as { key: string }
    const project = await deps.findProjectByKey(key)
    if (project === null) {
      return reply.status(404).send({ error: `Proje bulunamadı: ${key}` })
    }
    return reply.send({ reviews: await deps.listRecentReviews(project.id) })
  })
}
