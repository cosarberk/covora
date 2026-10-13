/**
 * @module @covora/db/repositories/dashboard
 *
 * Studio genel bakış için toplu okuma: sayımlar, gate geçme oranı, ortalama
 * coverage ve tüm projeler genelinde son review'lar.
 */

import type { DashboardSummary } from '@covora/types'
import type { PrismaClient } from '@prisma/client'

/**
 * Dashboard özetini hesaplar.
 *
 * @param prisma - Prisma client.
 * @param recentLimit - Son review sayısı (varsayılan 15).
 * @returns {@link DashboardSummary}.
 */
export const getDashboardSummary = async (
  prisma: PrismaClient,
  recentLimit = 15
): Promise<DashboardSummary> => {
  const [projects, packs, providers, reviews, passed, aggregate, byKind, ruleWeights, recent] =
    await Promise.all([
      prisma.project.count(),
      prisma.pack.count(),
      prisma.providerConfig.count(),
      prisma.review.count(),
      prisma.review.count({ where: { gatePassed: true } }),
      prisma.review.aggregate({ _avg: { score: true } }),
      // Tür bazında ortalama coverage + review sayısı.
      prisma.review.groupBy({ by: ['kind'], _avg: { score: true }, _count: { _all: true } }),
      // Tür bazında etkin kuralların toplam ağırlığı (birleşik ağırlık için).
      prisma.rule.groupBy({ by: ['kind'], where: { enabled: true }, _sum: { weight: true } }),
      prisma.review.findMany({
        orderBy: { createdAt: 'desc' },
        take: recentLimit,
        include: { project: { select: { key: true, name: true } } }
      })
    ])

  const round1 = (value: number): number => Math.round(value * 10) / 10
  const kindCoverage = (kind: 'ui' | 'code') => {
    const review = byKind.find((row) => row.kind === kind)
    const weight = ruleWeights.find((row) => row.kind === kind)
    return {
      avg: round1(review?._avg.score ?? 0),
      reviews: review?._count._all ?? 0,
      ruleWeight: Math.round((weight?._sum.weight ?? 0) * 100) / 100
    }
  }
  const ui = kindCoverage('ui')
  const code = kindCoverage('code')
  // Birleşik: her türün ortalamasını o türün toplam kural ağırlığıyla
  // ağırlıklandır. Hiç kural ağırlığı yoksa (ör. yeni kurulum) review sayısına,
  // o da yoksa düz ortalamaya düş.
  const wTotal = ui.ruleWeight + code.ruleWeight
  const rTotal = ui.reviews + code.reviews
  const combined =
    wTotal > 0
      ? (ui.avg * ui.ruleWeight + code.avg * code.ruleWeight) / wTotal
      : rTotal > 0
        ? (ui.avg * ui.reviews + code.avg * code.reviews) / rTotal
        : 0

  return {
    stats: {
      projects,
      packs,
      providers,
      reviews,
      gatePassRate: reviews === 0 ? 0 : Math.round((passed / reviews) * 1000) / 10,
      avgCoverage: round1(aggregate._avg.score ?? 0)
    },
    coverage: { ui, code, combined: round1(combined) },
    recent: recent.map((review) => ({
      id: review.id,
      projectKey: review.project.key,
      projectName: review.project.name,
      kind: review.kind,
      score: review.score,
      level: review.level,
      gatePassed: review.gatePassed,
      delta: review.delta,
      createdAt: review.createdAt.toISOString()
    }))
  }
}
