/**
 * @module @covora/db/repositories/config
 *
 * Proje yapılandırması veri erişimi. Proje kendi yapılandırmasını
 * tanımlamamışsa `@covora/core` varsayılanları kullanılır.
 */

import { defaultCoverageConfig, defaultGatePolicy } from '@covora/core'
import type { CoverageConfig, GatePolicy } from '@covora/types'
import type { PrismaClient } from '@prisma/client'

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
