/**
 * @module @covora/db/client
 *
 * Prisma client fabrikası. Uygulama katmanı tek bir örnek oluşturup
 * repository fonksiyonlarına geçirir.
 */

import { PrismaClient } from '@prisma/client'

/**
 * Yeni bir Prisma client örneği oluşturur.
 *
 * @returns Yapılandırılmış {@link PrismaClient}.
 */
export const createPrismaClient = (): PrismaClient => new PrismaClient()

export { PrismaClient }
