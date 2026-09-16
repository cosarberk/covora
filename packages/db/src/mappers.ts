/**
 * @module @covora/db/mappers
 *
 * Prisma modellerini `@covora/types` alan tiplerine dönüştüren saf fonksiyonlar.
 */

import {
  coverageConfigSchema,
  type AuditRecord,
  type CoverageConfig,
  type GatePolicy,
  type ManagementRule,
  type ProviderConfig,
  type Rule
} from '@covora/types'
import type {
  ProjectConfig as PrismaProjectConfig,
  ProviderConfig as PrismaProviderConfig,
  RuleAudit as PrismaRuleAudit,
  Rule as PrismaRule
} from '@prisma/client'

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
 * Prisma kuralını yönetim modeline dönüştürür. Domain modelden farklı olarak
 * kalıcılık kimliğini (`id`) ve `enabled` durumunu taşır.
 *
 * @param rule - Prisma kural kaydı.
 * @returns {@link ManagementRule}.
 */
export const toManagementRule = (rule: PrismaRule): ManagementRule => ({
  id: rule.id,
  key: rule.key,
  title: rule.title,
  description: rule.description,
  kind: rule.kind,
  evaluation: rule.evaluation,
  severity: rule.severity,
  weight: rule.weight,
  enabled: rule.enabled
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

/**
 * Prisma audit kaydını domain audit modeline dönüştürür.
 *
 * @param audit - Prisma audit kaydı.
 * @returns {@link AuditRecord}.
 */
/**
 * Prisma sağlayıcı kaydını domain modeline dönüştürür.
 *
 * @param provider - Prisma sağlayıcı kaydı.
 * @returns {@link ProviderConfig}.
 */
export const toProviderConfig = (provider: PrismaProviderConfig): ProviderConfig => ({
  id: provider.id,
  name: provider.name,
  kind: provider.kind,
  baseUrl: provider.baseUrl,
  model: provider.model,
  active: provider.active
})

export const toAuditRecord = (audit: PrismaRuleAudit): AuditRecord => ({
  id: audit.id,
  action: audit.action,
  changedBy: audit.changedBy,
  changes: audit.changes,
  createdAt: audit.createdAt.toISOString()
})
