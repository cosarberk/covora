/**
 * @module @covora/core/engine/provider
 *
 * LLM sağlayıcı arayüzü. Sağlayıcı, verilen checklist maddelerini doldurur
 * (pass/partial/fail) ve asla skor üretmez. UI (vision) ve code için ayrı
 * implementasyonlar bu arayüzü uygular; adapter deseni sayesinde motor somut
 * modele/endpoint'e bağımlı değildir.
 */

import type { ChecklistItem, ReviewInput, ReviewKind, RuleResult } from '@covora/types'

/**
 * Bir LLM sağlayıcısı. `kind`, sağlayıcının hangi review türünü işlediğini
 * belirtir; `fillChecklist` verilen maddeleri değerlendirip sonuçlarını döner.
 */
export interface LlmProvider {
  /** Sağlayıcının işlediği review türü. */
  readonly kind: ReviewKind
  /**
   * Verilen checklist maddelerini review girdisine göre doldurur.
   *
   * @param input - Review girdisi (ekran görüntüsü ya da kaynak dosyalar).
   * @param items - Değerlendirilecek checklist maddeleri.
   * @returns Her madde için değerlendirme sonucu.
   */
  fillChecklist(
    input: ReviewInput,
    items: readonly ChecklistItem[]
  ): Promise<readonly RuleResult[]>
}
