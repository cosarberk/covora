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
  const [projects, packs, providers, reviews, passed, aggregate, recent] = await Promise.all([
    prisma.project.count(),
    prisma.pack.count(),
    prisma.providerConfig.count(),
    prisma.review.count(),
    prisma.review.count({ where: { gatePassed: true } }),
    prisma.review.aggregate({ _avg: { score: true } }),
    prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      take: recentLimit,
      include: { project: { select: { key: true, name: true } } }
    })
  ])

  return {
    stats: {
      projects,
      packs,
      providers,
      reviews,
      gatePassRate: reviews === 0 ? 0 : Math.round((passed / reviews) * 1000) / 10,
      avgCoverage: Math.round((aggregate._avg.score ?? 0) * 10) / 10
    },
    recent: recent.map((review) => ({
      id: review.id,
      projectKey: review.project.key,
      projectName: review.project.name,
      kind: review.kind,
      score: review.score,
      level: review.level,
      gatePassed: review.gatePassed,
      createdAt: review.createdAt.toISOString()
    }))
  }
}
