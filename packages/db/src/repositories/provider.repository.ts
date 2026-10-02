/**
 * @module @covora/db/repositories/provider
 *
 * LLM sağlayıcı veri erişimi. Her review türü için yalnızca bir sağlayıcı aktif
 * olur; aktifleştirme aynı türdeki diğerlerini pasifleştirir.
 */

import type {
  ProviderCapabilities,
  ProviderConfig,
  ProviderType,
  ReviewKind
} from '@covora/types'
import type { PrismaClient } from '@prisma/client'

import { fromProviderType, toProviderConfig, toProviderType } from '../mappers.js'

/** Yeni sağlayıcı için gerekli alanlar. */
export interface ProviderInput {
  readonly name: string
  readonly providerType?: ProviderType
  readonly kind: ReviewKind
  readonly baseUrl: string
  readonly model: string
  readonly capabilities: ProviderCapabilities
  /** OpenAI-uyumlu uç noktalar için gizli API anahtarı. */
  readonly apiKey?: string | null
  readonly active?: boolean
}

/**
 * Bir sağlayıcının çalışma-zamanı (gizli dahil) görünümü. Yalnızca sunucunun
 * sağlayıcı fabrikası kullanır; API/UI'ya asla dönülmez.
 */
export interface ActiveProviderRuntime {
  readonly providerType: ProviderType
  readonly baseUrl: string
  readonly model: string
  readonly capabilities: ProviderCapabilities
  readonly apiKey: string | null
}

/**
 * Tüm sağlayıcıları listeler.
 *
 * @param prisma - Prisma client.
 * @returns Sağlayıcı listesi.
 */
export const listProviders = async (prisma: PrismaClient): Promise<ProviderConfig[]> => {
  const providers = await prisma.providerConfig.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] })
  return providers.map(toProviderConfig)
}

/**
 * Verilen review türü için aktif sağlayıcıyı getirir.
 *
 * @param prisma - Prisma client.
 * @param kind - Review türü.
 * @returns Aktif sağlayıcı ya da null.
 */
export const getActiveProvider = async (
  prisma: PrismaClient,
  kind: ReviewKind
): Promise<ProviderConfig | null> => {
  const provider = await prisma.providerConfig.findFirst({ where: { kind, active: true } })
  return provider === null ? null : toProviderConfig(provider)
}

/**
 * Verilen tür için aktif sağlayıcının çalışma-zamanı görünümünü (gizli API
 * anahtarı dahil) getirir. Yalnızca sunucu sağlayıcı fabrikası için.
 *
 * @param prisma - Prisma client.
 * @param kind - Review türü.
 * @returns Çalışma-zamanı görünümü ya da null.
 */
export const getActiveProviderRuntime = async (
  prisma: PrismaClient,
  kind: ReviewKind
): Promise<ActiveProviderRuntime | null> => {
  const provider = await prisma.providerConfig.findFirst({ where: { kind, active: true } })
  if (provider === null) {
    return null
  }
  return {
    providerType: toProviderType(provider.providerType),
    baseUrl: provider.baseUrl,
    model: provider.model,
    capabilities: { vision: provider.visionCapable, text: provider.textCapable },
    apiKey: provider.apiKey
  }
}

/**
 * Yeni sağlayıcı oluşturur. `active` ise aynı türdeki diğerleri pasifleştirilir.
 *
 * @param prisma - Prisma client.
 * @param input - Sağlayıcı alanları.
 * @returns Oluşturulan sağlayıcı.
 */
export const createProvider = async (
  prisma: PrismaClient,
  input: ProviderInput
): Promise<ProviderConfig> => {
  const created = await prisma.$transaction(async (tx) => {
    if (input.active === true) {
      await tx.providerConfig.updateMany({ where: { kind: input.kind }, data: { active: false } })
    }
    return tx.providerConfig.create({
      data: {
        name: input.name,
        providerType: fromProviderType(input.providerType ?? 'ollama'),
        kind: input.kind,
        baseUrl: input.baseUrl,
        model: input.model,
        visionCapable: input.capabilities.vision,
        textCapable: input.capabilities.text,
        apiKey: input.apiKey ?? null,
        active: input.active ?? false
      }
    })
  })
  return toProviderConfig(created)
}

/**
 * Bir sağlayıcıyı aktif yapar; aynı türdeki diğerlerini pasifleştirir.
 *
 * @param prisma - Prisma client.
 * @param id - Sağlayıcı kimliği.
 */
export const setActiveProvider = async (prisma: PrismaClient, id: string): Promise<void> => {
  const provider = await prisma.providerConfig.findUnique({ where: { id } })
  if (provider === null) {
    return
  }
  await prisma.$transaction([
    prisma.providerConfig.updateMany({ where: { kind: provider.kind }, data: { active: false } }),
    prisma.providerConfig.update({ where: { id }, data: { active: true } })
  ])
}

/**
 * Bir sağlayıcıyı siler.
 *
 * @param prisma - Prisma client.
 * @param id - Sağlayıcı kimliği.
 */
export const deleteProvider = async (prisma: PrismaClient, id: string): Promise<void> => {
  await prisma.providerConfig.delete({ where: { id } })
}
