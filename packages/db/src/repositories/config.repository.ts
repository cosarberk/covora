/**
 * @module @covora/db/repositories/config
 *
 * Proje yapılandırması veri erişimi. Proje kendi yapılandırmasını
 * tanımlamamışsa `@covora/core` varsayılanları kullanılır.
 */

import { defaultCoverageConfig, defaultGatePolicy } from '@covora/core'
import type { CoverageConfig, CoverageLevelThreshold, GatePolicy } from '@covora/types'
import type { Prisma, PrismaClient } from '@prisma/client'

import { toCoverageConfig, toGatePolicy } from '../mappers.js'

/** Bir proje için etkin coverage yapılandırması ve gate politikası. */
export interface EffectiveConfig {
  /** Coverage hesaplama yapılandırması. */
  readonly coverageConfig: CoverageConfig
  /** Merge gate politikası. */
  readonly gatePolicy: GatePolicy
}

/**
 * Bir projenin etkin yapılandırmasını getirir; kayıt yoksa varsayılanları
 * döner.
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @returns Etkin coverage yapılandırması ve gate politikası.
 */
export const getEffectiveConfig = async (
  prisma: PrismaClient,
  projectId: string
): Promise<EffectiveConfig> => {
  const config = await prisma.projectConfig.findUnique({ where: { projectId } })

  if (config === null) {
    return { coverageConfig: defaultCoverageConfig, gatePolicy: defaultGatePolicy }
  }

  return {
    coverageConfig: toCoverageConfig(config),
    gatePolicy: toGatePolicy(config)
  }
}

/** Proje yapılandırmasını güncellemek için gerekli alanlar. */
export interface ProjectConfigInput {
  readonly partialCredit: number
  readonly levels: readonly CoverageLevelThreshold[]
  readonly gateMinScore: number
  readonly gateBlockOnFailedBlockers: boolean
  readonly gateBlockOnRegression: boolean
  readonly regressionThreshold: number
}

/**
 * Bir projenin coverage yapılandırmasını ve gate politikasını oluşturur/günceller.
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @param input - Yapılandırma alanları.
 * @returns Güncellenmiş etkin yapılandırma.
 */
export const upsertProjectConfig = async (
  prisma: PrismaClient,
  projectId: string,
  input: ProjectConfigInput
): Promise<EffectiveConfig> => {
  const levels = input.levels as unknown as Prisma.InputJsonValue
  const data = {
    partialCredit: input.partialCredit,
    gateMinScore: input.gateMinScore,
    gateBlockOnFailedBlockers: input.gateBlockOnFailedBlockers,
    gateBlockOnRegression: input.gateBlockOnRegression,
    regressionThreshold: input.regressionThreshold
  }
  const config = await prisma.projectConfig.upsert({
    where: { projectId },
    create: { projectId, levels, ...data },
    update: { levels, ...data }
  })
  return { coverageConfig: toCoverageConfig(config), gatePolicy: toGatePolicy(config) }
}
