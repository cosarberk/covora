/**
 * @module @covora/types/coverage-config
 *
 * Coverage yapılandırması ve merge gate politikası sözleşmeleri.
 */

import { z } from 'zod'

/**
 * Bir coverage seviyesi eşiği. `minScore`, bu seviyenin geçerli sayılması için
 * gereken en düşük yüzdedir.
 */
export const coverageLevelThresholdSchema = z.object({
  /** Seviye kimliği (örn. `good`). */
  id: z.string().min(1),
  /** Bu seviye için gereken en düşük skor (0-100). */
  minScore: z.number().min(0).max(100)
})

/** {@link coverageLevelThresholdSchema} tip çıkarımı. */
export type CoverageLevelThreshold = z.infer<typeof coverageLevelThresholdSchema>

/**
 * Coverage algoritmasının yapılandırması: kısmi kredi katsayısı ve seviye
 * eşikleri. Çağıran taraf (studio/DB) bunu sağlar ya da override eder; hiçbir
 * eşik koda gömülü değildir.
 */
export const coverageConfigSchema = z.object({
  /** `partial` sonucuna verilecek kredi (0-1 arası). */
  partialCredit: z.number().min(0).max(1),
  /** Seviye eşikleri; en az bir tane (tabanı 0 olan) bulunmalıdır. */
  levels: z.array(coverageLevelThresholdSchema).min(1)
})

/** {@link coverageConfigSchema} tip çıkarımı. */
export type CoverageConfig = z.infer<typeof coverageConfigSchema>

/**
 * Merge gate politikası. Coverage sonucunun merge'e izin verip vermeyeceğini
 * belirleyen kurallar.
 */
export const gatePolicySchema = z.object({
  /** Merge için gereken asgari coverage skoru (0-100). */
  minScore: z.number().min(0).max(100),
  /** `true` ise uyumsuz bir blocker kural tek başına merge'i durdurur. */
  blockOnFailedBlockers: z.boolean()
})

/** {@link gatePolicySchema} tip çıkarımı. */
export type GatePolicy = z.infer<typeof gatePolicySchema>

/**
 * Gate değerlendirmesinin sonucu. `passed` false ise `reasons` en az bir
 * gerekçe içerir.
 */
export const gateDecisionSchema = z.object({
  /** Merge'e izin verilip verilmediği. */
  passed: z.boolean(),
  /** Geçmediyse insan-okunur gerekçeler. */
  reasons: z.array(z.string())
})

/** {@link gateDecisionSchema} tip çıkarımı. */
export type GateDecision = z.infer<typeof gateDecisionSchema>
