/**
 * @module @covora/types/rule
 *
 * Kural sözleşmesi ve ilgili sınıflandırmalar.
 */

import { z } from 'zod'

import { severitySchema } from './severity.js'

/**
 * Kuralın nasıl değerlendirileceğini belirler.
 * - `deterministic`: koddan/DOM'dan kesin ölçülür, LLM'e gitmez.
 * - `llm`: checklist maddesi olarak LLM'e sorulur.
 */
export const ruleEvaluationTypeSchema = z.enum(['deterministic', 'llm'])

/** {@link ruleEvaluationTypeSchema} tip çıkarımı. */
export type RuleEvaluationType = z.infer<typeof ruleEvaluationTypeSchema>

/**
 * Kuralın hangi kapsamda değerlendirileceği.
 * - `changes`: değişen/verilen dosyalar üzerinde (diff review ve normal akış).
 * - `project`: TÜM proje üzerinde çapraz-dosya analiz (ArchUnit tarzı; import
 *   grafiği, katman bağımlılığı, döngü). Yalnızca proje-geneli akışta koşar;
 *   diff'te grafik eksik olacağından atlanır.
 */
export const reviewScopeSchema = z.enum(['changes', 'project'])

/** {@link reviewScopeSchema} tip çıkarımı. */
export type ReviewScope = z.infer<typeof reviewScopeSchema>

/** Review türü: görsel arayüz (UI) ya da kaynak kod. */
export const reviewKindSchema = z.enum(['ui', 'code'])

/** {@link reviewKindSchema} tip çıkarımı. */
export type ReviewKind = z.infer<typeof reviewKindSchema>

/**
 * Tek bir review kuralı. Kurallar deklaratiftir ve coverage hesabının
 * girdisidir; `weight` kuralın coverage skoruna katkı payını belirler.
 */
export const ruleSchema = z.object({
  /** Kararlı, benzersiz kural kimliği. */
  id: z.string().min(1),
  /** Kısa, okunabilir kural başlığı. */
  title: z.string().min(1),
  /** Ayrıntılı açıklama; LLM kuralları için istemin bağlamını da besler. */
  description: z.string().default(''),
  /** Kuralın ait olduğu review türü. */
  kind: reviewKindSchema,
  /** Kuralın nasıl değerlendirileceği. */
  evaluation: ruleEvaluationTypeSchema,
  /**
   * Kuralın kapsamı. Eski kayıtlar/UI kuralları için varsayılan `changes`.
   * `project` (ArchUnit) yalnızca proje-geneli akışta koşar.
   */
  scope: reviewScopeSchema.default('changes'),
  /** Önem derecesi. */
  severity: severitySchema,
  /** Coverage katkı ağırlığı (pozitif). */
  weight: z.number().positive()
})

/** {@link ruleSchema} tip çıkarımı. */
export type Rule = z.infer<typeof ruleSchema>
