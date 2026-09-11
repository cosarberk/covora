/**
 * @module @covora/types/review
 *
 * Review akışının checklist ve nihai çıktı sözleşmeleri.
 */

import { z } from 'zod'

import { coverageResultSchema } from './coverage.js'
import { gateDecisionSchema } from './coverage-config.js'

/**
 * LLM'e sunulan tek bir checklist maddesi. Bilinçli olarak yalnızca "ne
 * kontrol edileceğini" taşır; ağırlık/severity gibi skorlama ayrıntıları
 * LLM'i yanlı etkilememesi için dışarıda bırakılır.
 */
export const checklistItemSchema = z.object({
  /** İlgili kuralın kimliği. */
  ruleId: z.string().min(1),
  /** Kısa başlık. */
  title: z.string().min(1),
  /** Ayrıntılı açıklama/talimat. */
  description: z.string()
})

/** {@link checklistItemSchema} tip çıkarımı. */
export type ChecklistItem = z.infer<typeof checklistItemSchema>

/**
 * Bir review'ın uçtan uca sonucu: hesaplanan coverage ve merge gate kararı.
 */
export const reviewOutcomeSchema = z.object({
  /** Deterministik olarak hesaplanmış coverage sonucu. */
  coverage: coverageResultSchema,
  /** Coverage'a ve politikaya göre verilen merge gate kararı. */
  gate: gateDecisionSchema
})

/** {@link reviewOutcomeSchema} tip çıkarımı. */
export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>
