/**
 * @module @covora/types/checklist
 *
 * Kural değerlendirme sonuçları (checklist çıktısı). LLM yalnızca bu
 * sonuçları üretir; skoru asla üretmez.
 */

import { z } from 'zod'

/**
 * Bir kuralın değerlendirme sonucu.
 * - `pass`: tam uyum.
 * - `partial`: kısmi uyum (kredi katsayısı coverage yapılandırmasından gelir).
 * - `fail`: uyumsuz.
 */
export const checklistOutcomeSchema = z.enum(['pass', 'partial', 'fail'])

/** {@link checklistOutcomeSchema} tip çıkarımı. */
export type ChecklistOutcome = z.infer<typeof checklistOutcomeSchema>

/**
 * Tek bir kuralın değerlendirilmiş sonucu. `note`, deterministik ölçümün
 * ayrıntısını ya da LLM'in gerekçesini taşıyabilir.
 */
export const ruleResultSchema = z.object({
  /** İlgili kuralın kimliği. */
  ruleId: z.string().min(1),
  /** Değerlendirme sonucu. */
  outcome: checklistOutcomeSchema,
  /** İsteğe bağlı açıklama/gerekçe. */
  note: z.string().optional()
})

/** {@link ruleResultSchema} tip çıkarımı. */
export type RuleResult = z.infer<typeof ruleResultSchema>
