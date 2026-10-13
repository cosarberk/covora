/**
 * @module @covora/db/repositories/project
 *
 * Proje (review edilen birim) veri erişimi.
 */

import { randomBytes } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

/**
 * Anahtarına göre bir projeyi getirir.
 *
 * @param prisma - Prisma client.
 * @param key - Proje anahtarı.
 * @returns Proje kaydı ya da null.
 */
export const findProjectByKey = async (prisma: PrismaClient, key: string) =>
  prisma.project.findUnique({ where: { key } })

/**
 * Bir projeyi anahtarına göre oluşturur ya da adını günceller.
 *
 * @param prisma - Prisma client.
 * @param key - Proje anahtarı.
 * @param name - Proje adı.
 * @returns Oluşturulan/güncellenen proje.
 */
export const upsertProject = async (prisma: PrismaClient, key: string, name: string) =>
  prisma.project.upsert({
    where: { key },
    create: { key, name },
    update: { name }
  })

/**
 * Tüm projeleri anahtar sırasına göre listeler.
 *
 * @param prisma - Prisma client.
 * @returns Proje kayıtları.
 */
export const listProjects = async (prisma: PrismaClient) =>
  prisma.project.findMany({ orderBy: { key: 'asc' } })

/**
 * Bir projeyi anahtarına göre siler (ilişkili kural/review'lar cascade ile gider).
 *
 * @param prisma - Prisma client.
 * @param key - Proje anahtarı.
 */
export const deleteProjectByKey = async (prisma: PrismaClient, key: string): Promise<void> => {
  await prisma.project.delete({ where: { key } })
}

/**
 * Bir projenin ingest token'ını yeniden üretir (sızıntı/rotasyon için). Eski
 * token derhal geçersiz olur; pipeline'ların yeni token ile güncellenmesi
 * gerekir.
 *
 * @param prisma - Prisma client.
 * @param key - Proje anahtarı.
 * @returns Yeni ingest token.
 */
export const rotateIngestToken = async (
  prisma: PrismaClient,
  key: string
): Promise<{ readonly ingestToken: string }> => {
  const token = randomBytes(24).toString('base64url')
  const project = await prisma.project.update({ where: { key }, data: { ingestToken: token } })
  return { ingestToken: project.ingestToken }
}
