/**
 * @module @covora/types/dashboard
 *
 * Studio genel bakış (dashboard) okuma modelleri. Değerler sunucuda hesaplanır;
 * studio yalnızca gösterir.
 */

import { z } from 'zod'

import { reviewKindSchema } from './rule.js'

/** Genel sayısal göstergeler. */
export const dashboardStatsSchema = z.object({
  /** Toplam proje sayısı. */
  projects: z.number().int().nonnegative(),
  /** Toplam pack sayısı. */
  packs: z.number().int().nonnegative(),
  /** Toplam AI sağlayıcı sayısı. */
  providers: z.number().int().nonnegative(),
  /** Toplam review sayısı. */
  reviews: z.number().int().nonnegative(),
  /** Gate'i geçen review oranı (0–100). */
  gatePassRate: z.number().min(0).max(100),
  /** Ortalama coverage skoru (0–100). */
  avgCoverage: z.number().min(0).max(100)
})

/** {@link dashboardStatsSchema} tip çıkarımı. */
export type DashboardStats = z.infer<typeof dashboardStatsSchema>

/** Tüm projeler genelinde son review özeti. */
export const dashboardRecentReviewSchema = z.object({
  id: z.string(),
  projectKey: z.string(),
  projectName: z.string(),
  kind: reviewKindSchema,
  score: z.number(),
  level: z.string(),
  gatePassed: z.boolean(),
  /** Önceki aynı tür review'a göre skor farkı (ilk review'da null). */
  delta: z.number().nullable(),
  createdAt: z.string()
})

/** {@link dashboardRecentReviewSchema} tip çıkarımı. */
export type DashboardRecentReview = z.infer<typeof dashboardRecentReviewSchema>

/** Tek bir türün (ui/code) coverage özeti. */
export const kindCoverageSchema = z.object({
  /** O türdeki review'ların ortalama coverage skoru (0–100). */
  avg: z.number().min(0).max(100),
  /** O türdeki review sayısı. */
  reviews: z.number().int().nonnegative(),
  /** O türdeki etkin kuralların toplam ağırlığı (birleşik coverage ağırlığı). */
  ruleWeight: z.number().nonnegative()
})

/** {@link kindCoverageSchema} tip çıkarımı. */
export type KindCoverage = z.infer<typeof kindCoverageSchema>

/**
 * Coverage dökümü: UI ve kod ayrı ayrı, bir de kural ağırlığına göre
 * harmanlanmış birleşik skor. Birleşik, iki türün ortalamasını o türün toplam
 * kural ağırlığıyla ağırlıklandırır (tek havuzda ortalamaz).
 */
export const coverageBreakdownSchema = z.object({
  ui: kindCoverageSchema,
  code: kindCoverageSchema,
  /** Kural ağırlığına göre harmanlanmış birleşik coverage (0–100). */
  combined: z.number().min(0).max(100)
})

/** {@link coverageBreakdownSchema} tip çıkarımı. */
export type CoverageBreakdown = z.infer<typeof coverageBreakdownSchema>

/** Dashboard özeti (göstergeler + coverage dökümü + son review'lar). */
export const dashboardSummarySchema = z.object({
  stats: dashboardStatsSchema,
  coverage: coverageBreakdownSchema,
  recent: z.array(dashboardRecentReviewSchema)
})

/** {@link dashboardSummarySchema} tip çıkarımı. */
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>
