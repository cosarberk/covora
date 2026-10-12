/**
 * @module @covora/db/repositories/review
 *
 * Review kaydı veri erişimi.
 */

import { reviewOutcomeSchema, type ReviewKind, type ReviewOutcome, type RuleResult } from '@covora/types'
import type { Prisma, PrismaClient } from '@prisma/client'

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
  /** Önceki aynı tür review'a göre skor farkı (ilk review'da null). */
  readonly delta?: number | null
}

/**
 * Bir projenin verilen tür için en son review skorunu getirir (regresyon
 * karşılaştırması için).
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @param kind - Review türü.
 * @returns Son skor ya da hiç review yoksa null.
 */
export const getLatestReviewScore = async (
  prisma: PrismaClient,
  projectId: string,
  kind: ReviewKind
): Promise<number | null> => {
  const latest = await prisma.review.findFirst({
    where: { projectId, kind },
    orderBy: { createdAt: 'desc' },
    select: { score: true }
  })
  return latest?.score ?? null
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
      delta: input.delta ?? null,
      outcome: input.outcome as unknown as Prisma.InputJsonValue,
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
 * Bir review'ın kural bazında sonuçlarını (pass/partial/fail + not) getirir.
 *
 * @param prisma - Prisma client.
 * @param reviewId - Review kimliği.
 * @returns Kural sonuçları (kural anahtarına göre sıralı).
 */
export const getReviewResults = async (
  prisma: PrismaClient,
  reviewId: string
): Promise<RuleResult[]> => {
  const results = await prisma.reviewResult.findMany({
    where: { reviewId },
    orderBy: { ruleKey: 'asc' }
  })
  return results.map((result) =>
    result.note !== null
      ? { ruleId: result.ruleKey, outcome: result.outcome, note: result.note }
      : { ruleId: result.ruleKey, outcome: result.outcome }
  )
}

/**
 * Bir review'ın saklı uçtan uca sonucunu (coverage dökümü + gate gerekçeleri)
 * getirir. Eski kayıtlarda `outcome` saklanmadıysa (null) ya da şema
 * uyuşmuyorsa null döner.
 *
 * @param prisma - Prisma client.
 * @param reviewId - Review kimliği.
 * @returns Saklı {@link ReviewOutcome} ya da null.
 */
export const getReviewOutcome = async (
  prisma: PrismaClient,
  reviewId: string
): Promise<ReviewOutcome | null> => {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { outcome: true }
  })
  if (review === null || review.outcome === null) {
    return null
  }
  const parsed = reviewOutcomeSchema.safeParse(review.outcome)
  return parsed.success ? parsed.data : null
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
