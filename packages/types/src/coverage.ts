/**
 * @module @covora/types/coverage
 *
 * Coverage (kurallara uyum derecesi) çıktısı.
 */

import { z } from 'zod'

import { ruleResultSchema } from './checklist.js'

/**
 * Coverage hesabının çıktısı. `score` 0-100 arası yüzdelik uyumu, `level`
 * yapılandırmadaki eşiklere göre belirlenen seviye kimliğini verir.
 * `failedBlockers`, uyumsuz (fail) olan `blocker` kuralların kimlikleridir;
 * merge kararı verilirken bu liste boş olmalıdır.
 */
export const coverageResultSchema = z.object({
  /** 0-100 arası yüzdelik uyum skoru. */
  score: z.number().min(0).max(100),
  /** Skora karşılık gelen seviye kimliği (yapılandırmadan). */
  level: z.string().min(1),
  /** Değerlendirilen kuralların toplam ağırlığı. */
  totalWeight: z.number().nonnegative(),
  /** Kazanılan (kredilendirilmiş) ağırlık toplamı. */
  earnedWeight: z.number().nonnegative(),
  /** Her kural için normalize edilmiş sonuç. */
  ruleResults: z.array(ruleResultSchema),
  /** Uyumsuz olan blocker kuralların kimlikleri. */
  failedBlockers: z.array(z.string())
})

/** {@link coverageResultSchema} tip çıkarımı. */
export type CoverageResult = z.infer<typeof coverageResultSchema>
