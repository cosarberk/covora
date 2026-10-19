/**
 * @module @covora/db/repositories/pack
 *
 * Review Pack veri erişimi: pack CRUD, proje aboneliği ve yerleşik (built-in)
 * paketlerin seed'i.
 */

import type { Pack, ReviewKind, ReviewScope, RuleEvaluationType, Severity } from '@covora/types'
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
  /** Kapsam; verilmezse changes. project = ArchUnit (tüm depo). */
  readonly scope?: ReviewScope
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
      { key: 'no-hardcoded-url', title: 'Gömülü URL olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 1 },
      { key: 'no-cyclic-imports', title: 'Dairesel import olmamalı (ArchUnit)', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 }
    ]
  },
  {
    // Yeten plugin konvansiyonu: tüm yapı/mimari/manifest kuralları tek pakette.
    // Bir plugin projesine abone edilince elle kural girmeye gerek kalmaz.
    key: 'plugin-standartlari',
    name: 'FE Plugin Standartları',
    kind: 'code',
    rules: [
      // Hijyen (dosya-içi)
      { key: 'no-todo', title: 'Kodda TODO/FIXME olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-console', title: 'console.* çağrısı olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-hardcoded-url', title: 'Gömülü URL olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-explicit-any', title: "TypeScript 'any' kullanılmamalı", evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-ts-ignore', title: '@ts-ignore/@ts-nocheck olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-default-export', title: 'Default export olmamalı (barrel uyumu)', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'max-file-lines', title: 'Dosya 300 satırı aşmamalı', evaluation: 'deterministic', severity: 'warning', weight: 1 },
      { key: 'i18n-no-bare-text', title: 'JSX içinde çıplak metin olmamalı (i18n)', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'react-hook-order', title: 'React: state hookları useEffect\'ten önce gelmeli', evaluation: 'deterministic', severity: 'warning', weight: 1 },
      { key: 'no-css', title: 'CSS yasak (stiller obje olmalı)', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-raw-html', title: 'Ham HTML yasak (sadece Yeten UI)', evaluation: 'deterministic', severity: 'blocker', weight: 3 },
      // Yapı / mimari (ArchUnit, scope=project)
      { key: 'required-project-structure', title: 'Zorunlu src klasör yapısı', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'folders-kebab-case', title: 'Tüm klasörler kebab-case', evaluation: 'deterministic', scope: 'project', severity: 'warning', weight: 2 },
      { key: 'all-files-are-index', title: 'Tüm dosyalar index olmalı', evaluation: 'deterministic', scope: 'project', severity: 'warning', weight: 2 },
      { key: 'barrel-structure', title: 'Barrel export yapısı zorunlu', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'no-deep-import', title: 'Deep import yasak', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'layer-dependencies', title: 'Katman bağımlılık kuralları', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'no-cyclic-imports', title: 'Dairesel import olmamalı', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      // Plugin'e özel
      { key: 'plugin-manifest-valid', title: 'PluginManifest eksiksiz ve kurallı', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'plugin-vite-config', title: 'vite.config plugin build kuralları', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'plugin-name-consistency', title: 'Plugin isim tutarlılığı', evaluation: 'deterministic', scope: 'project', severity: 'warning', weight: 2 }
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
          scope: rule.scope ?? 'changes',
          severity: rule.severity,
          weight: rule.weight
        },
        update: {
          title: rule.title,
          evaluation: rule.evaluation,
          scope: rule.scope ?? 'changes',
          severity: rule.severity,
          weight: rule.weight
        }
      })
    }
  }
}
