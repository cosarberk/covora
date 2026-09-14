/**
 * @module @covora/db/repositories/review
 *
 * Review kaydı veri erişimi.
 */

import type { ReviewKind, ReviewOutcome } from '@covora/types'
import type { PrismaClient } from '@prisma/client'

/** Bir review sonucunu kalıcılaştırmak için gerekli alanlar. */
export interface SaveReviewInput {
  /** Bağlı proje kimliği. */
  readonly projectId: string
  /** Review türü. */
  readonly kind: ReviewKind
  /** Review edilen kodun/durumun hash'i. */
  readonly codeHash: string
  /** Uçtan uca review sonucu (coverage + gate). */
  readonly outcome: ReviewOutcome
}

/**
 * Bir review'ı ve kural sonuçlarını kaydeder.
 *
 * @param prisma - Prisma client.
 * @param input - Kaydedilecek review verisi.
 * @returns Oluşturulan review'ın kimliği.
 */
export const saveReview = async (prisma: PrismaClient, input: SaveReviewInput): Promise<string> => {
  const review = await prisma.review.create({
    data: {
      projectId: input.projectId,
      kind: input.kind,
      codeHash: input.codeHash,
      score: input.outcome.coverage.score,
      level: input.outcome.coverage.level,
      gatePassed: input.outcome.gate.passed,
      results: {
        create: input.outcome.coverage.ruleResults.map((result) =>
          result.note !== undefined
            ? { ruleKey: result.ruleId, outcome: result.outcome, note: result.note }
            : { ruleKey: result.ruleId, outcome: result.outcome }
        )
      }
    }
  })

  return review.id
}

/**
 * Bir projenin en son review'larını (yeniden eskiye) getirir.
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @param limit - Getirilecek kayıt sayısı.
 * @returns Review kayıtları.
 */
export const listRecentReviews = async (
  prisma: PrismaClient,
  projectId: string,
  limit = 20
) =>
  prisma.review.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: limit
  })
