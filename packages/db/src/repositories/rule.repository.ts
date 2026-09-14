/**
 * @module @covora/db/repositories/rule
 *
 * Kural veri erişimi. Değişiklikler audit kaydıyla birlikte yazılır.
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
  /** Bağlı proje kimliği; null ise global kural. */
  readonly projectId?: string | null
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
 * Bir projenin (ve global) etkin kurallarını verilen review türü için getirir.
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
      OR: [{ projectId }, { projectId: null }]
    }
  })
  return rules.map(toDomainRule)
}

/**
 * Bir projenin (ve global) tüm kurallarını getirir (etkin olmayanlar dahil).
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @returns Domain kural listesi.
 */
export const listRules = async (prisma: PrismaClient, projectId: string): Promise<Rule[]> => {
  const rules = await prisma.rule.findMany({
    where: { OR: [{ projectId }, { projectId: null }] },
    orderBy: { key: 'asc' }
  })
  return rules.map(toDomainRule)
}

/**
 * Bir projenin (ve global) tüm kurallarını yönetim modeli olarak getirir
 * (kalıcılık kimliği ve `enabled` dahil).
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
    where: { OR: [{ projectId }, { projectId: null }] },
    orderBy: { key: 'asc' }
  })
  return rules.map(toManagementRule)
}

/**
 * Yeni bir kural oluşturur ve audit kaydını yazar.
 *
 * @param prisma - Prisma client.
 * @param data - Kural alanları.
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
      projectId: data.projectId ?? null,
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
 * Bir kuralı günceller ve değişikliği audit kaydıyla işler (tek transaction).
 *
 * @param prisma - Prisma client.
 * @param ruleId - Güncellenecek kuralın kimliği (Prisma id).
 * @param changes - Uygulanacak değişiklikler.
 * @param changedBy - İşlemi yapan kullanıcı.
 */
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
