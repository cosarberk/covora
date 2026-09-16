/**
 * @module @covora/db/repositories/user
 *
 * Kullanıcı veri erişimi: giriş için e-posta ile arama, oluşturma ve sayım
 * (ilk kurulumda admin seed'i için).
 */

import type { PrismaClient, User as PrismaUser } from '@prisma/client'

/** Yeni kullanıcı için gerekli alanlar. */
export interface CreateUserData {
  readonly email: string
  readonly passwordHash: string
  readonly role?: string
}

/**
 * E-postaya göre kullanıcıyı getirir (parola hash'i dahil; doğrulama içindir).
 *
 * @param prisma - Prisma client.
 * @param email - Kullanıcı e-postası.
 * @returns Prisma kullanıcı kaydı ya da null.
 */
export const findUserByEmail = async (
  prisma: PrismaClient,
  email: string
): Promise<PrismaUser | null> => prisma.user.findUnique({ where: { email } })

/**
 * Kullanıcı sayısını döner (ilk kurulum tespiti için).
 *
 * @param prisma - Prisma client.
 * @returns Kullanıcı sayısı.
 */
export const countUsers = async (prisma: PrismaClient): Promise<number> => prisma.user.count()

/**
 * Yeni kullanıcı oluşturur.
 *
 * @param prisma - Prisma client.
 * @param data - Kullanıcı alanları (hash'lenmiş parola).
 * @returns Oluşturulan Prisma kullanıcı kaydı.
 */
export const createUser = async (
  prisma: PrismaClient,
  data: CreateUserData
): Promise<PrismaUser> =>
  prisma.user.create({
    data: {
      email: data.email,
      passwordHash: data.passwordHash,
      ...(data.role !== undefined ? { role: data.role } : {})
    }
  })
