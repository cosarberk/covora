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
