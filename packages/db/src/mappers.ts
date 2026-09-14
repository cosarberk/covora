/**
 * @module @covora/db/mappers
 *
 * Prisma modellerini `@covora/types` alan tiplerine dönüştüren saf fonksiyonlar.
 */

import {
  coverageConfigSchema,
  type CoverageConfig,
  type GatePolicy,
  type Rule
} from '@covora/types'
import type { ProjectConfig as PrismaProjectConfig, Rule as PrismaRule } from '@prisma/client'

/**
 * Prisma kuralını domain kuralına dönüştürür. Domain kimliği (`id`) olarak
 * kuralın kararlı `key` alanı kullanılır; coverage eşleşmeleri bu kimliğe
 * dayanır.
 *
 * @param rule - Prisma kural kaydı.
 * @returns Domain {@link Rule}.
 */
export const toDomainRule = (rule: PrismaRule): Rule => ({
  id: rule.key,
  title: rule.title,
  description: rule.description,
  kind: rule.kind,
  evaluation: rule.evaluation,
  severity: rule.severity,
  weight: rule.weight
})

/**
 * Proje yapılandırmasından coverage yapılandırmasını üretir. `levels` JSON'u
 * şema ile doğrulanır.
 *
 * @param config - Prisma proje yapılandırması.
 * @returns Doğrulanmış {@link CoverageConfig}.
 */
export const toCoverageConfig = (config: PrismaProjectConfig): CoverageConfig =>
  coverageConfigSchema.parse({
    partialCredit: config.partialCredit,
    levels: config.levels
  })

/**
 * Proje yapılandırmasından merge gate politikasını üretir.
 *
 * @param config - Prisma proje yapılandırması.
 * @returns {@link GatePolicy}.
 */
export const toGatePolicy = (config: PrismaProjectConfig): GatePolicy => ({
  minScore: config.gateMinScore,
  blockOnFailedBlockers: config.gateBlockOnFailedBlockers
})
