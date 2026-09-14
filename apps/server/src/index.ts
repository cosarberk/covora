/**
 * @module @covora/server
 *
 * Covora review sunucusunun giriş noktası. Ortamı yükler, veri erişimi ve
 * sağlayıcı bağımlılıklarını bağlar ve HTTP sunucusunu başlatır.
 */

import {
  createPrismaClient,
  findProjectByKey,
  getEffectiveConfig,
  listEnabledRules,
  saveReview
} from '@covora/db'

import { buildApp } from './app.js'
import { loadEnv } from './config/env.js'
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
    saveReview: (input) => saveReview(prisma, input)
  }

  const app = buildApp({ reviewDeps })

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

void start()
