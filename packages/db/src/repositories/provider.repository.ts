/**
 * @module @covora/db/repositories/provider
 *
 * LLM sağlayıcı veri erişimi. Her review türü için yalnızca bir sağlayıcı aktif
 * olur; aktifleştirme aynı türdeki diğerlerini pasifleştirir.
 */

import type { ProviderConfig, ReviewKind } from '@covora/types'
import type { PrismaClient } from '@prisma/client'

import { toProviderConfig } from '../mappers.js'

/** Yeni sağlayıcı için gerekli alanlar. */
export interface ProviderInput {
  readonly name: string
  readonly kind: ReviewKind
  readonly baseUrl: string
  readonly model: string
  readonly active?: boolean
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
        kind: input.kind,
        baseUrl: input.baseUrl,
        model: input.model,
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
