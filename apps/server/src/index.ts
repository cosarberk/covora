/**
 * @module @covora/server
 *
 * Covora review sunucusunun giriş noktası. Ortamı yükler, veri erişimi ve
 * sağlayıcı bağımlılıklarını bağlar ve HTTP sunucusunu başlatır.
 */

import { builtinCodeCheckers } from '@covora/checkers'
import type { LlmProvider } from '@covora/core'
import { createOllamaChat, createOllamaProvider } from '@covora/provider-ollama'
import {
  assignPackToProject,
  createPack,
  createPrismaClient,
  createProvider as createProviderRecord,
  createRule,
  deletePack,
  deleteProjectByKey,
  deleteProvider,
  ensureBuiltinPacks,
  findProjectByKey,
  getActiveProvider,
  getEffectiveConfig,
  listEnabledRules,
  listManagementRules,
  listPacks,
  listPacksByProject,
  listProjects,
  listProviders,
  listRecentReviews,
  listRuleAudits,
  listRulesByPack,
  removePackFromProject,
  saveReview,
  setActiveProvider,
  updateRuleWithAudit,
  upsertProject
} from '@covora/db'
import type { ReviewKind } from '@covora/types'

import { buildApp } from './app.js'
import { loadEnv } from './config/env.js'
import type { ChatDeps } from './routes/chat.js'
import type { ManagementDeps } from './services/management.js'
import { createProviderFactory } from './services/provider-factory.js'
import type { CreateReviewDeps } from './services/review.service.js'

/**
 * Sunucuyu yapılandırır ve dinlemeye başlatır.
 */
const start = async (): Promise<void> => {
  const env = loadEnv()
  const prisma = createPrismaClient()
  const envProvider = createProviderFactory(env)

  // Yerleşik pack'leri ve kurallarını hazırla (idempotent).
  await ensureBuiltinPacks(prisma)

  // Aktif sağlayıcı DB'de tanımlıysa onu, yoksa env'deki varsayılanı kullan.
  const resolveProvider = async (kind: ReviewKind): Promise<LlmProvider> => {
    const active = await getActiveProvider(prisma, kind)
    if (active !== null) {
      return createOllamaProvider({ baseUrl: active.baseUrl, model: active.model, kind })
    }
    return envProvider(kind)
  }

  const reviewDeps: CreateReviewDeps = {
    findProjectByKey: (key) => findProjectByKey(prisma, key),
    listEnabledRules: (projectId, kind) => listEnabledRules(prisma, projectId, kind),
    getEffectiveConfig: (projectId) => getEffectiveConfig(prisma, projectId),
    createProvider: resolveProvider,
    saveReview: (input) => saveReview(prisma, input),
    checkers: builtinCodeCheckers
  }

  const managementDeps: ManagementDeps = {
    findProjectByKey: (key) => findProjectByKey(prisma, key),
    upsertProject: (key, name) => upsertProject(prisma, key, name),
    listProjects: async () =>
      (await listProjects(prisma)).map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name
      })),
    deleteProject: (key) => deleteProjectByKey(prisma, key),
    listRules: (projectId) => listManagementRules(prisma, projectId),
    listPacks: () => listPacks(prisma),
    listPacksByProject: (projectId) => listPacksByProject(prisma, projectId),
    createPack: (input) => createPack(prisma, input),
    deletePack: (id) => deletePack(prisma, id),
    assignPackToProject: (projectId, packId) => assignPackToProject(prisma, projectId, packId),
    removePackFromProject: (projectId, packId) => removePackFromProject(prisma, projectId, packId),
    listRulesByPack: (packId) => listRulesByPack(prisma, packId),
    createRule: (data, changedBy) => createRule(prisma, data, changedBy),
    updateRule: (ruleId, patch, changedBy) => updateRuleWithAudit(prisma, ruleId, patch, changedBy),
    listRuleAudits: (ruleId) => listRuleAudits(prisma, ruleId),
    listRecentReviews: async (projectId, limit) =>
      (await listRecentReviews(prisma, projectId, limit)).map((review) => ({
        id: review.id,
        kind: review.kind,
        codeHash: review.codeHash,
        score: review.score,
        level: review.level,
        gatePassed: review.gatePassed,
        createdAt: review.createdAt.toISOString()
      })),
    listProviders: () => listProviders(prisma),
    createProvider: (input) => createProviderRecord(prisma, input),
    setActiveProvider: (id) => setActiveProvider(prisma, id),
    deleteProvider: (id) => deleteProvider(prisma, id)
  }

  const chat = createOllamaChat({
    baseUrl: env.OLLAMA_UI_BASE_URL,
    model: env.OLLAMA_UI_MODEL,
    kind: 'ui'
  })

  const chatDeps: ChatDeps = {
    sendChat: (messages) => chat.send(messages)
  }

  const app = buildApp({ reviewDeps, managementDeps, chatDeps })

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

void start()
