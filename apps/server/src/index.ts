/**
 * @module @covora/server
 *
 * Covora review sunucusunun giriş noktası. Ortamı yükler, veri erişimi ve
 * sağlayıcı bağımlılıklarını bağlar ve HTTP sunucusunu başlatır.
 */

import { builtinCodeCheckers } from '@covora/checkers'
import { createOllamaChat } from '@covora/provider-ollama'
import {
  createPrismaClient,
  createRule,
  findProjectByKey,
  getEffectiveConfig,
  listEnabledRules,
  listManagementRules,
  listRecentReviews,
  saveReview,
  updateRuleWithAudit,
  upsertProject
} from '@covora/db'

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
  const createProvider = createProviderFactory(env)

  const reviewDeps: CreateReviewDeps = {
    findProjectByKey: (key) => findProjectByKey(prisma, key),
    listEnabledRules: (projectId, kind) => listEnabledRules(prisma, projectId, kind),
    getEffectiveConfig: (projectId) => getEffectiveConfig(prisma, projectId),
    createProvider,
    saveReview: (input) => saveReview(prisma, input),
    checkers: builtinCodeCheckers
  }

  const managementDeps: ManagementDeps = {
    findProjectByKey: (key) => findProjectByKey(prisma, key),
    upsertProject: (key, name) => upsertProject(prisma, key, name),
    listRules: (projectId) => listManagementRules(prisma, projectId),
    createRule: (data, changedBy) => createRule(prisma, data, changedBy),
    updateRule: (ruleId, patch, changedBy) => updateRuleWithAudit(prisma, ruleId, patch, changedBy),
    listRecentReviews: async (projectId, limit) =>
      (await listRecentReviews(prisma, projectId, limit)).map((review) => ({
        id: review.id,
        kind: review.kind,
        codeHash: review.codeHash,
        score: review.score,
        level: review.level,
        gatePassed: review.gatePassed,
        createdAt: review.createdAt.toISOString()
      }))
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
