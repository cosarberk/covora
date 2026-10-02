/**
 * @module @covora/db/mappers
 *
 * Prisma modellerini `@covora/types` alan tiplerine dönüştüren saf fonksiyonlar.
 */

import {
  coverageConfigSchema,
  userRoleSchema,
  webhookEventSchema,
  type AuditRecord,
  type CoverageConfig,
  type GatePolicy,
  type ManagementRule,
  type Pack,
  type ProviderConfig,
  type ProviderType,
  type ReviewRun,
  type Rule,
  type RunLogLine,
  type RunStep,
  type RunSummary,
  type User,
  type Webhook
} from '@covora/types'
import type {
  Pack as PrismaPack,
  ProjectConfig as PrismaProjectConfig,
  ProviderConfig as PrismaProviderConfig,
  ProviderType as PrismaProviderType,
  Review as PrismaReview,
  ReviewRun as PrismaReviewRun,
  RuleAudit as PrismaRuleAudit,
  Rule as PrismaRule,
  RunLog as PrismaRunLog,
  RunStep as PrismaRunStep,
  User as PrismaUser,
  Webhook as PrismaWebhook
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
  blockOnFailedBlockers: config.gateBlockOnFailedBlockers,
  blockOnRegression: config.gateBlockOnRegression,
  regressionThreshold: config.regressionThreshold
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
/** Prisma sağlayıcı türü enum'ını domain değerine çevirir. */
export const toProviderType = (type: PrismaProviderType): ProviderType =>
  type === 'openai_compatible' ? 'openai-compatible' : 'ollama'

/** Domain sağlayıcı türünü Prisma enum'ına çevirir. */
export const fromProviderType = (type: ProviderType): PrismaProviderType =>
  type === 'openai-compatible' ? 'openai_compatible' : 'ollama'

export const toProviderConfig = (provider: PrismaProviderConfig): ProviderConfig => ({
  id: provider.id,
  name: provider.name,
  providerType: toProviderType(provider.providerType),
  kind: provider.kind,
  baseUrl: provider.baseUrl,
  model: provider.model,
  capabilities: { vision: provider.visionCapable, text: provider.textCapable },
  hasApiKey: provider.apiKey !== null && provider.apiKey.length > 0,
  active: provider.active
})

/** Prisma run adımını domain modeline dönüştürür. */
export const toRunStep = (step: PrismaRunStep): RunStep => ({
  key: step.key,
  name: step.name,
  order: step.order,
  status: step.status,
  ...(step.startedAt !== null ? { startedAt: step.startedAt.toISOString() } : {}),
  ...(step.finishedAt !== null ? { finishedAt: step.finishedAt.toISOString() } : {}),
  ...(step.error !== null ? { error: step.error } : {})
})

/** Prisma log satırını domain modeline dönüştürür. */
export const toRunLogLine = (log: PrismaRunLog): RunLogLine => ({
  seq: log.seq,
  at: log.at.toISOString(),
  level: log.level,
  ...(log.stepKey !== null ? { stepKey: log.stepKey } : {}),
  message: log.message
})

/** Prisma run kaydını (adımları ve varsa bağlı review özetiyle) domain {@link ReviewRun}'a dönüştürür. */
export const toReviewRun = (
  run: PrismaReviewRun,
  projectKey: string,
  steps: readonly PrismaRunStep[],
  review: Pick<PrismaReview, 'score' | 'level' | 'gatePassed'> | null,
  queuePosition?: number
): ReviewRun => ({
  id: run.id,
  projectKey,
  kind: run.kind,
  codeHash: run.codeHash,
  status: run.status,
  ...(queuePosition !== undefined ? { queuePosition } : {}),
  steps: [...steps].sort((a, b) => a.order - b.order).map(toRunStep),
  createdAt: run.createdAt.toISOString(),
  ...(run.startedAt !== null ? { startedAt: run.startedAt.toISOString() } : {}),
  ...(run.finishedAt !== null ? { finishedAt: run.finishedAt.toISOString() } : {}),
  score: review?.score ?? null,
  level: review?.level ?? null,
  gatePassed: review?.gatePassed ?? null,
  delta: run.delta,
  ...(run.error !== null ? { error: run.error } : {})
})

/** Prisma run kaydını (bağlı review özetiyle) liste satırına dönüştürür. */
export const toRunSummary = (
  run: PrismaReviewRun,
  projectKey: string,
  review: Pick<PrismaReview, 'score' | 'level' | 'gatePassed'> | null,
  queuePosition?: number
): RunSummary => ({
  id: run.id,
  projectKey,
  kind: run.kind,
  codeHash: run.codeHash,
  status: run.status,
  ...(queuePosition !== undefined ? { queuePosition } : {}),
  score: review?.score ?? null,
  level: review?.level ?? null,
  gatePassed: review?.gatePassed ?? null,
  delta: run.delta,
  createdAt: run.createdAt.toISOString(),
  ...(run.startedAt !== null ? { startedAt: run.startedAt.toISOString() } : {}),
  ...(run.finishedAt !== null ? { finishedAt: run.finishedAt.toISOString() } : {})
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

/**
 * Prisma webhook kaydını domain modeline dönüştürür. Geçersiz olay adları
 * ayıklanır.
 *
 * @param webhook - Prisma webhook kaydı.
 * @returns {@link Webhook}.
 */
export const toWebhook = (webhook: PrismaWebhook): Webhook => ({
  id: webhook.id,
  url: webhook.url,
  events: webhook.events.flatMap((event) => {
    const parsed = webhookEventSchema.safeParse(event)
    return parsed.success ? [parsed.data] : []
  }),
  active: webhook.active
})

export const toAuditRecord = (audit: PrismaRuleAudit): AuditRecord => ({
  id: audit.id,
  action: audit.action,
  changedBy: audit.changedBy,
  changes: audit.changes,
  createdAt: audit.createdAt.toISOString()
})
