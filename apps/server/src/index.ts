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
  countUsers,
  createPack,
  createPrismaClient,
  createProvider as createProviderRecord,
  createRule,
  createUser,
  createWebhook,
  deletePack,
  deleteProjectByKey,
  deleteProvider,
  deleteWebhook,
  ensureBuiltinPacks,
  findProjectByKey,
  findUserByEmail,
  getActiveProvider,
  getDashboardSummary,
  getLatestReviewScore,
  getEffectiveConfig,
  listEnabledRules,
  listManagementRules,
  listPacks,
  listPacksByProject,
  listProjects,
  listProviders,
  listRecentReviews,
  listActiveWebhooks,
  listRuleAudits,
  listRulesByPack,
  listWebhooks,
  removePackFromProject,
  saveReview,
  setActiveProvider,
  setWebhookActive,
  toUser,
  updateRuleWithAudit,
  upsertProject,
  upsertProjectConfig
} from '@covora/db'
import type { ReviewKind, User } from '@covora/types'

import { buildApp } from './app.js'
import { hashPassword, verifyPassword } from './auth/password.js'
import { loadEnv } from './config/env.js'
import type { AuthDeps } from './routes/auth.js'
import type { ChatDeps } from './routes/chat.js'
import type { ManagementDeps } from './services/management.js'
import { dispatchReviewNotifications } from './services/notifications.js'
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

  // İlk kurulumda admin kullanıcıyı seed et (hiç kullanıcı yoksa ve env verilmişse).
  if (env.COVORA_ADMIN_EMAIL !== undefined && env.COVORA_ADMIN_PASSWORD !== undefined) {
    if ((await countUsers(prisma)) === 0) {
      await createUser(prisma, {
        email: env.COVORA_ADMIN_EMAIL,
        passwordHash: await hashPassword(env.COVORA_ADMIN_PASSWORD)
      })
    }
  }

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
    getLatestScore: (projectId, kind) => getLatestReviewScore(prisma, projectId, kind),
    saveReview: (input) => saveReview(prisma, input),
    notify: (payload) => {
      void dispatchReviewNotifications(
        { listActiveWebhooks: (projectId) => listActiveWebhooks(prisma, projectId) },
        payload
      )
    },
    checkers: builtinCodeCheckers
  }

  const managementDeps: ManagementDeps = {
    findProjectByKey: (key) => findProjectByKey(prisma, key),
    upsertProject: async (key, name) => {
      const project = await upsertProject(prisma, key, name)
      return {
        id: project.id,
        key: project.key,
        name: project.name,
        ingestToken: project.ingestToken
      }
    },
    listProjects: async () =>
      (await listProjects(prisma)).map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        ingestToken: project.ingestToken
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
        delta: review.delta,
        createdAt: review.createdAt.toISOString()
      })),
    getDashboard: () => getDashboardSummary(prisma),
    listWebhooks: (projectId) => listWebhooks(prisma, projectId),
    createWebhook: (data) => createWebhook(prisma, data),
    setWebhookActive: (id, active) => setWebhookActive(prisma, id, active),
    deleteWebhook: (id) => deleteWebhook(prisma, id),
    getProjectConfig: (projectId) => getEffectiveConfig(prisma, projectId),
    updateProjectConfig: (projectId, input) => upsertProjectConfig(prisma, projectId, input),
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

  const authenticate = async (email: string, password: string): Promise<User | null> => {
    const record = await findUserByEmail(prisma, email)
    if (record === null || !(await verifyPassword(password, record.passwordHash))) {
      return null
    }
    return toUser(record)
  }

  const authDeps: AuthDeps = {
    authenticate,
    secret: env.COVORA_AUTH_SECRET
  }

  const ingestDeps = {
    resolveIngestToken: async (projectKey: string): Promise<string | null> => {
      const project = await findProjectByKey(prisma, projectKey)
      return project?.ingestToken ?? null
    }
  }

  const app = buildApp({ reviewDeps, managementDeps, chatDeps, authDeps, ingestDeps })

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

void start()
