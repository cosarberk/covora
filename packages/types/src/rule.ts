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

/**
 * UI kuralının hangi ekran tipine (surface) ait olduğu. Review tetiklenirken
 * ekran tipi seçilir; `genel` her UI review'ında geçerlidir, diğerleri yalnızca
 * o ekran tipi review edilirken değerlendirmeye girer.
 * - `genel`: tüm ekranlar (ör. buton isimleri ≤ 2 kelime).
 * - `liste`: listeleme ekranı kuralları.
 * - `onizleme`: ön izleme ekranı kuralları.
 * - `form`: form ekranı kuralları.
 *
 * Code review kuralları her zaman `genel`'dir (surface yalnızca UI için anlamlı).
 */
export const reviewSurfaceSchema = z.enum(['genel', 'liste', 'onizleme', 'form'])

/** {@link reviewSurfaceSchema} tip çıkarımı. */
export type ReviewSurface = z.infer<typeof reviewSurfaceSchema>

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
  /**
   * UI kuralının ekran tipi. `genel` her zaman; `liste`/`onizleme`/`form` yalnızca
   * o ekran tipi review edilirken. Code kuralları için `genel` (anlamsız).
   */
  surface: reviewSurfaceSchema.default('genel'),
  /**
   * Kural tek bir ekran görüntüsünden doğrulanabilir mi? `false` ise davranışsal
   * kuraldır (ör. "primary aksiyon sonrası onay modalı açılmalı") ve statik
   * görüntüden görülemez — görsel modele GÖNDERİLMEZ, skorlamaya da girmez.
   */
  visual: z.boolean().default(true),
  /** Önem derecesi. */
  severity: severitySchema,
  /** Coverage katkı ağırlığı (pozitif). */
  weight: z.number().positive()
})

/** {@link ruleSchema} tip çıkarımı. */
export type Rule = z.infer<typeof ruleSchema>
