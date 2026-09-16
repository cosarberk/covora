/**
 * @module @covora/db/mappers
 *
 * Prisma modellerini `@covora/types` alan tiplerine dönüştüren saf fonksiyonlar.
 */

import {
  coverageConfigSchema,
  userRoleSchema,
  type AuditRecord,
  type CoverageConfig,
  type GatePolicy,
  type ManagementRule,
  type Pack,
  type ProviderConfig,
  type Rule,
  type User
} from '@covora/types'
import type {
  Pack as PrismaPack,
  ProjectConfig as PrismaProjectConfig,
  ProviderConfig as PrismaProviderConfig,
  RuleAudit as PrismaRuleAudit,
  Rule as PrismaRule,
  User as PrismaUser
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
  enabled: rule.enabled,
  packId: rule.packId
})

/**
 * Prisma pack kaydını domain modeline dönüştürür.
 *
 * @param pack - Prisma pack kaydı.
 * @returns {@link Pack}.
 */
export const toPack = (pack: PrismaPack): Pack => ({
  id: pack.id,
  key: pack.key,
  name: pack.name,
  description: pack.description,
  kind: pack.kind,
  builtin: pack.builtin
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

/**
 * Prisma kullanıcısını domain modeline dönüştürür. Parola hash'i çıkarılmaz.
 *
 * @param user - Prisma kullanıcı kaydı.
 * @returns {@link User}.
 */
export const toUser = (user: PrismaUser): User => ({
  id: user.id,
  email: user.email,
  role: userRoleSchema.catch('admin').parse(user.role)
})

export const toAuditRecord = (audit: PrismaRuleAudit): AuditRecord => ({
  id: audit.id,
  action: audit.action,
  changedBy: audit.changedBy,
  changes: audit.changes,
  createdAt: audit.createdAt.toISOString()
})
