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
 * LLM çağrısının ham izi (trace). Hata ayıklama/şeffaflık için modele gönderilen
 * tam istemi ve modelden dönen ham (parse edilmemiş) yanıtı taşır; run log'una
 * `debug` seviyesinde birebir yazılır.
 */
export interface LlmTrace {
  /** Modele gönderilen tam istem (system + user; code'da dosya içeriği dahil). */
  readonly prompt: string
  /** Modelin döndürdüğü ham yanıt metni (JSON parse edilmeden önce). */
  readonly rawResponse: string
}

/** {@link LlmProvider.fillChecklist} dönüşü: sonuçlar + opsiyonel ham iz. */
export interface FillChecklistResult {
  /** Her madde için değerlendirme sonucu. */
  readonly results: readonly RuleResult[]
  /** Modele giden istem ve ham yanıt (sağlayıcı sağlıyorsa). */
  readonly trace?: LlmTrace
}

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
   * @returns Her madde için değerlendirme sonucu ve (varsa) ham iz.
   */
  fillChecklist(
    input: ReviewInput,
    items: readonly ChecklistItem[]
  ): Promise<FillChecklistResult>
}
