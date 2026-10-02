/**
 * @module @covora/server
 *
 * Covora review sunucusunun giriş noktası. Ortamı yükler, veri erişimi ve
 * sağlayıcı bağımlılıklarını bağlar, review worker'ını başlatır ve HTTP
 * sunucusunu ayağa kaldırır. Review artık asenkron bir run olarak kuyruğa
 * alınır; worker onu arka planda işler ve ilerlemeyi canlı yayınlar.
 */

import { builtinCodeCheckers } from '@covora/checkers'
import {
  assignPackToProject,
  cancelQueuedRun,
  countUsers,
  createPack,
  createPrismaClient,
  createProvider as createProviderRecord,
  createRule,
  createRun,
  createUser,
  createWebhook,
  deletePack,
  deleteProjectByKey,
  deleteProvider,
  deleteWebhook,
  ensureBuiltinPacks,
  findProjectByKey,
  findUserByEmail,
  getActiveProviderRuntime,
  getDashboardSummary,
  getEffectiveConfig,
  getLatestReviewScore,
  getQueuePosition,
  getReviewResults,
  getRun,
  getRunLogs,
  listActiveWebhooks,
  listEnabledRules,
  listManagementRules,
  listPacks,
  listPacksByProject,
  listProjects,
  listProviders,
  listRecentReviews,
  listRuleAudits,
  listRuns,
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
import type { User } from '@covora/types'

import { buildApp } from './app.js'
import { hashPassword, verifyPassword } from './auth/password.js'
import { loadEnv } from './config/env.js'
import type { AuthDeps } from './routes/auth.js'
import type { ChatDeps } from './routes/chat.js'
import type { ReviewRoutesDeps } from './routes/reviews.js'
import type { RunRoutesDeps } from './routes/runs.js'
import { createChatSender } from './services/chat-factory.js'
import { createRunEventBus } from './services/events.js'
import type { ManagementDeps } from './services/management.js'
import { dispatchReviewNotifications } from './services/notifications.js'
import { createProviderResolver } from './services/provider-factory.js'
import { checkProviderHealth } from './services/provider-health.js'
import { startWorker } from './services/worker.js'

/**
 * Sunucuyu yapılandırır ve dinlemeye başlatır.
 */
const start = async (): Promise<void> => {
  const env = loadEnv()
  const prisma = createPrismaClient()
  const bus = createRunEventBus()

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

  // Sağlayıcı çözücü: tek kaynak DB'deki aktif sağlayıcı (türüne göre adapter);
  // yoksa AI adımı net hatayla degraded'a düşer.
  const resolveProvider = createProviderResolver({
    getActiveProviderRuntime: (kind) => getActiveProviderRuntime(prisma, kind)
  })

  // Review worker'ı: kuyruktan kapar, çekirdek yürütücüsüyle koşturur.
  const worker = startWorker({
    prisma,
    bus,
    resolveProvider,
    listEnabledRules: (projectId, kind) => listEnabledRules(prisma, projectId, kind),
    getEffectiveConfig: (projectId) => getEffectiveConfig(prisma, projectId),
    getLatestScore: (projectId, kind) => getLatestReviewScore(prisma, projectId, kind),
    notify: (payload) => {
      void dispatchReviewNotifications(
        { listActiveWebhooks: (projectId) => listActiveWebhooks(prisma, projectId) },
        payload
      )
    },
    checkers: builtinCodeCheckers,
    concurrency: env.COVORA_WORKER_CONCURRENCY
  })

  const reviewDeps: ReviewRoutesDeps = {
    findProjectByKey: (key) => findProjectByKey(prisma, key),
    createRun: (input) => createRun(prisma, input),
    getQueuePosition: (runId) => getQueuePosition(prisma, runId),
    getRun: (runId) => getRun(prisma, runId),
    getRunLogs: (runId) => getRunLogs(prisma, runId),
    bus
  }

  const runDeps: RunRoutesDeps = {
    bus,
    findProjectByKey: (key) => findProjectByKey(prisma, key),
    listRuns: (options) => listRuns(prisma, options),
    getRun: (runId) => getRun(prisma, runId),
    getRunLogs: (runId, afterSeq) => getRunLogs(prisma, runId, afterSeq),
    cancelRun: (runId) => cancelQueuedRun(prisma, runId)
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
    listReviewResults: (reviewId) => getReviewResults(prisma, reviewId),
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
    deleteProvider: (id) => deleteProvider(prisma, id),
    getProviderHealth: (id) => checkProviderHealth(prisma, id)
  }

  const chatDeps: ChatDeps = {
    sendChat: createChatSender({
      getActiveProviderRuntime: (kind) => getActiveProviderRuntime(prisma, kind)
    })
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

  const app = buildApp({
    reviewDeps,
    runDeps,
    managementDeps,
    chatDeps,
    authDeps,
    ingestDeps,
    ...(env.COVORA_CORS_ORIGINS !== undefined ? { corsOrigins: env.COVORA_CORS_ORIGINS } : {})
  })

  const shutdown = async (): Promise<void> => {
    worker.stop()
    await prisma.$disconnect()
  }

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    await shutdown()
    process.exit(1)
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown().finally(() => process.exit(0))
    })
  }
}

void start()
