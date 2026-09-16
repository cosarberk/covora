/**
 * @module @covora/db/repositories/rule
 *
 * Kural veri erişimi. Kurallar bir pack'e aittir; projeler pack'lere abone
 * olur. Değişiklikler audit kaydıyla birlikte yazılır.
 */

import type {
  AuditRecord,
  ManagementRule,
  ReviewKind,
  RuleEvaluationType,
  Rule,
  Severity
} from '@covora/types'
import type { Prisma, PrismaClient } from '@prisma/client'

import { toAuditRecord, toDomainRule, toManagementRule } from '../mappers.js'

/** Yeni bir kural oluşturmak için gerekli alanlar. */
export interface CreateRuleData {
  /** Kuralın ait olduğu pack. */
  readonly packId: string
  /** Kararlı kural anahtarı (domain kimliği). */
  readonly key: string
  /** Kural başlığı. */
  readonly title: string
  /** Açıklama/talimat. */
  readonly description?: string
  /** Review türü. */
  readonly kind: ReviewKind
  /** Değerlendirme tipi. */
  readonly evaluation: RuleEvaluationType
  /** Önem derecesi. */
  readonly severity: Severity
  /** Coverage ağırlığı. */
  readonly weight: number
  /** LLM istemi (opsiyonel). */
  readonly prompt?: string | null
  /** Etkin mi. */
  readonly enabled?: boolean
}

/**
 * Bir projenin abone olduğu pack'lerdeki etkin kuralları, verilen review türü
 * için getirir (coverage/review'da kullanılır).
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @param kind - Review türü.
 * @returns Domain kural listesi.
 */
export const listEnabledRules = async (
  prisma: PrismaClient,
  projectId: string,
  kind: ReviewKind
): Promise<Rule[]> => {
  const rules = await prisma.rule.findMany({
    where: {
      enabled: true,
      kind,
      pack: { projects: { some: { projectId } } }
    }
  })
  return rules.map(toDomainRule)
}

/**
 * Bir projenin abone olduğu pack'lerdeki tüm kuralları yönetim modeli olarak
 * getirir (görüntüleme).
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @returns Yönetim kural listesi.
 */
export const listManagementRules = async (
  prisma: PrismaClient,
  projectId: string
): Promise<ManagementRule[]> => {
  const rules = await prisma.rule.findMany({
    where: { pack: { projects: { some: { projectId } } } },
    orderBy: { key: 'asc' }
  })
  return rules.map(toManagementRule)
}

/**
 * Bir pack'in tüm kurallarını yönetim modeli olarak getirir.
 *
 * @param prisma - Prisma client.
 * @param packId - Pack kimliği.
 * @returns Yönetim kural listesi.
 */
export const listRulesByPack = async (
  prisma: PrismaClient,
  packId: string
): Promise<ManagementRule[]> => {
  const rules = await prisma.rule.findMany({ where: { packId }, orderBy: { key: 'asc' } })
  return rules.map(toManagementRule)
}

/**
 * Bir pack'e yeni kural ekler ve audit kaydını yazar.
 *
 * @param prisma - Prisma client.
 * @param data - Kural alanları (packId dahil).
 * @param changedBy - İşlemi yapan kullanıcı.
 * @returns Oluşturulan domain kural.
 */
export const createRule = async (
  prisma: PrismaClient,
  data: CreateRuleData,
  changedBy: string
): Promise<Rule> => {
  const created = await prisma.rule.create({
    data: {
      packId: data.packId,
      key: data.key,
      title: data.title,
      description: data.description ?? '',
      kind: data.kind,
      evaluation: data.evaluation,
      severity: data.severity,
      weight: data.weight,
      prompt: data.prompt ?? null,
      enabled: data.enabled ?? true
    }
  })

  await prisma.ruleAudit.create({
    data: {
      ruleId: created.id,
      action: 'create',
      changedBy,
      changes: data as unknown as Prisma.InputJsonValue
    }
  })

  return toDomainRule(created)
}

/**
 * Bir kuralın audit kayıtlarını (yeniden eskiye) getirir.
 *
 * @param prisma - Prisma client.
 * @param ruleId - Kural kimliği.
 * @returns Audit kayıtları.
 */
export const listRuleAudits = async (
  prisma: PrismaClient,
  ruleId: string
): Promise<AuditRecord[]> => {
  const audits = await prisma.ruleAudit.findMany({
    where: { ruleId },
    orderBy: { createdAt: 'desc' }
  })
  return audits.map(toAuditRecord)
}

/**
 * Bir kuralı günceller ve değişikliği audit kaydıyla işler (tek transaction).
 *
 * @param prisma - Prisma client.
 * @param ruleId - Kural kimliği.
 * @param changes - Uygulanacak değişiklikler.
 * @param changedBy - İşlemi yapan kullanıcı.
 */
export const updateRuleWithAudit = async (
  prisma: PrismaClient,
  ruleId: string,
  changes: Prisma.RuleUncheckedUpdateInput,
  changedBy: string
): Promise<void> => {
  await prisma.$transaction([
    prisma.rule.update({ where: { id: ruleId }, data: changes }),
    prisma.ruleAudit.create({
      data: {
        ruleId,
        action: 'update',
        changedBy,
        changes: changes as unknown as Prisma.InputJsonValue
      }
    })
  ])
}
