/**
 * @module @covora/db/repositories/pack
 *
 * Review Pack veri erişimi: pack CRUD, proje aboneliği ve yerleşik (built-in)
 * paketlerin seed'i.
 */

import type { Pack, ReviewKind, RuleEvaluationType, Severity } from '@covora/types'
import type { PrismaClient } from '@prisma/client'

import { toPack } from '../mappers.js'

/** Yeni pack için gerekli alanlar. */
export interface PackInput {
  readonly key: string
  readonly name: string
  readonly description?: string
  readonly kind: ReviewKind
}

/**
 * Tüm pack'leri listeler.
 *
 * @param prisma - Prisma client.
 * @returns Pack listesi.
 */
export const listPacks = async (prisma: PrismaClient): Promise<Pack[]> => {
  const packs = await prisma.pack.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] })
  return packs.map(toPack)
}

/**
 * Bir projenin abone olduğu pack'leri listeler.
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @returns Pack listesi.
 */
export const listPacksByProject = async (
  prisma: PrismaClient,
  projectId: string
): Promise<Pack[]> => {
  const packs = await prisma.pack.findMany({
    where: { projects: { some: { projectId } } },
    orderBy: { name: 'asc' }
  })
  return packs.map(toPack)
}

/**
 * Yeni pack oluşturur (builtin değil).
 *
 * @param prisma - Prisma client.
 * @param input - Pack alanları.
 * @returns Oluşturulan pack.
 */
export const createPack = async (prisma: PrismaClient, input: PackInput): Promise<Pack> => {
  const pack = await prisma.pack.create({
    data: {
      key: input.key,
      name: input.name,
      description: input.description ?? '',
      kind: input.kind,
      builtin: false
    }
  })
  return toPack(pack)
}

/**
 * Bir pack'i siler (yerleşik pack'ler silinemez).
 *
 * @param prisma - Prisma client.
 * @param id - Pack kimliği.
 */
export const deletePack = async (prisma: PrismaClient, id: string): Promise<void> => {
  await prisma.pack.deleteMany({ where: { id, builtin: false } })
}

/**
 * Bir projeyi bir pack'e abone eder (idempotent).
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @param packId - Pack kimliği.
 */
export const assignPackToProject = async (
  prisma: PrismaClient,
  projectId: string,
  packId: string
): Promise<void> => {
  await prisma.projectPack.upsert({
    where: { projectId_packId: { projectId, packId } },
    create: { projectId, packId },
    update: {}
  })
}

/**
 * Bir projenin bir pack aboneliğini kaldırır.
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @param packId - Pack kimliği.
 */
export const removePackFromProject = async (
  prisma: PrismaClient,
  projectId: string,
  packId: string
): Promise<void> => {
  await prisma.projectPack.deleteMany({ where: { projectId, packId } })
}

interface BuiltinRule {
  readonly key: string
  readonly title: string
  readonly evaluation: RuleEvaluationType
  readonly severity: Severity
  readonly weight: number
}

interface BuiltinPack {
  readonly key: string
  readonly name: string
  readonly kind: ReviewKind
  readonly rules: readonly BuiltinRule[]
}

const BUILTIN_PACKS: readonly BuiltinPack[] = [
  {
    key: 'code-temel',
    name: 'Temel Code Review',
    kind: 'code',
    rules: [
      { key: 'no-todo', title: 'Kodda TODO/FIXME olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-console', title: 'console.* çağrısı olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 1 },
      { key: 'no-hardcoded-url', title: 'Gömülü URL olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 1 }
    ]
  },
  {
    key: 'ui-temel',
    name: 'Temel UI Review',
    kind: 'ui',
    rules: [
      { key: 'header-exists', title: 'Sayfada header bulunmalı', evaluation: 'deterministic', severity: 'blocker', weight: 3 },
      { key: 'has-primary-action', title: 'Primary aksiyon butonu bulunmalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'layout-tutarli', title: 'Görsel hiyerarşi ve boşluklar tutarlı mı', evaluation: 'llm', severity: 'warning', weight: 2 }
    ]
  }
]

/**
 * Yerleşik pack'leri ve kurallarını oluşturur/günceller (idempotent). Sunucu
 * başlangıcında çağrılır.
 *
 * @param prisma - Prisma client.
 */
export const ensureBuiltinPacks = async (prisma: PrismaClient): Promise<void> => {
  for (const builtin of BUILTIN_PACKS) {
    const pack = await prisma.pack.upsert({
      where: { key: builtin.key },
      create: { key: builtin.key, name: builtin.name, description: '', kind: builtin.kind, builtin: true },
      update: { name: builtin.name, builtin: true }
    })
    for (const rule of builtin.rules) {
      await prisma.rule.upsert({
        where: { packId_key: { packId: pack.id, key: rule.key } },
        create: {
          packId: pack.id,
          key: rule.key,
          title: rule.title,
          kind: builtin.kind,
          evaluation: rule.evaluation,
          severity: rule.severity,
          weight: rule.weight
        },
        update: { title: rule.title }
      })
    }
  }
}
