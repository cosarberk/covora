/**
 * @module @covora/db/repositories/project
 *
 * Proje (review edilen birim) veri erişimi.
 */

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
