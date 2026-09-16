/**
 * @module @covora/db/repositories/webhook
 *
 * Bildirim webhook'u veri erişimi: listeleme, oluşturma, silme ve bir review
 * bildirimi için etkin webhook'ları getirme.
 */

import type { Webhook, WebhookEvent } from '@covora/types'
import type { PrismaClient, Webhook as PrismaWebhook } from '@prisma/client'

import { toWebhook } from '../mappers.js'

/** Yeni webhook için gerekli alanlar. */
export interface CreateWebhookData {
  readonly projectId: string
  readonly url: string
  readonly events: readonly WebhookEvent[]
}

/**
 * Bir projenin webhook'larını listeler.
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @returns Webhook listesi.
 */
export const listWebhooks = async (
  prisma: PrismaClient,
  projectId: string
): Promise<Webhook[]> => {
  const rows = await prisma.webhook.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' }
  })
  return rows.map(toWebhook)
}

/**
 * Bir projenin etkin webhook'larını (ham kayıt) getirir; bildirim gönderiminde
 * kullanılır.
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @returns Etkin Prisma webhook kayıtları.
 */
export const listActiveWebhooks = async (
  prisma: PrismaClient,
  projectId: string
): Promise<PrismaWebhook[]> =>
  prisma.webhook.findMany({ where: { projectId, active: true } })

/**
 * Yeni webhook oluşturur.
 *
 * @param prisma - Prisma client.
 * @param data - Webhook alanları.
 * @returns Oluşturulan webhook.
 */
export const createWebhook = async (
  prisma: PrismaClient,
  data: CreateWebhookData
): Promise<Webhook> => {
  const row = await prisma.webhook.create({
    data: { projectId: data.projectId, url: data.url, events: [...data.events] }
  })
  return toWebhook(row)
}

/**
 * Bir webhook'un etkin durumunu değiştirir.
 *
 * @param prisma - Prisma client.
 * @param id - Webhook kimliği.
 * @param active - Yeni etkinlik durumu.
 */
export const setWebhookActive = async (
  prisma: PrismaClient,
  id: string,
  active: boolean
): Promise<void> => {
  await prisma.webhook.update({ where: { id }, data: { active } })
}

/**
 * Bir webhook'u siler.
 *
 * @param prisma - Prisma client.
 * @param id - Webhook kimliği.
 */
export const deleteWebhook = async (prisma: PrismaClient, id: string): Promise<void> => {
  await prisma.webhook.delete({ where: { id } })
}
