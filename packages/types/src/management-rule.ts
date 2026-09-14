/**
 * @module @covora/types/management-rule
 *
 * Yönetim (studio) için kural modeli. Coverage için kullanılan sade {@link Rule}
 * tipinden farklı olarak, düzenleme/toggle için gereken kalıcılık kimliğini
 * (`id`) ve `enabled` durumunu taşır.
 */

import { z } from 'zod'

import { ruleEvaluationTypeSchema, reviewKindSchema } from './rule.js'
import { severitySchema } from './severity.js'

/** Studio'da yönetilen kural. */
export const managementRuleSchema = z.object({
  /** Kalıcılık kimliği (güncelleme için). */
  id: z.string().min(1),
  /** Kararlı kural anahtarı (domain kimliği / checker eşleşmesi). */
  key: z.string().min(1),
  /** Kural başlığı. */
  title: z.string().min(1),
  /** Açıklama/talimat. */
  description: z.string(),
  /** Review türü. */
  kind: reviewKindSchema,
  /** Değerlendirme tipi. */
  evaluation: ruleEvaluationTypeSchema,
  /** Önem derecesi. */
  severity: severitySchema,
  /** Coverage ağırlığı. */
  weight: z.number(),
  /** Kuralın etkin olup olmadığı. */
  enabled: z.boolean()
})

/** {@link managementRuleSchema} tip çıkarımı. */
export type ManagementRule = z.infer<typeof managementRuleSchema>
