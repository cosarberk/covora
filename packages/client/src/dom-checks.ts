/**
 * @module @covora/client/dom-checks
 *
 * Tarayıcıda (DOM üzerinde) çalışan deterministik UI kontrolleri. Sonuçlar
 * review girdisiyle sunucuya gönderilir ve coverage'ın deterministik yarısına
 * katkı sağlar. Kontrol kimlikleri, kural anahtarlarıyla eşleşir.
 */

import type { RuleResult } from '@covora/types'

/** Bir DOM kontrolünün ham sonucu. */
export interface DomCheckOutcome {
  readonly outcome: 'pass' | 'fail'
  readonly note?: string
}

/** DOM kökü üzerinde çalışan deterministik kontrol. */
export type DomCheck = (root: HTMLElement) => DomCheckOutcome

/** Yerleşik DOM kontrolleri (kontrol kimliği → kontrol). */
export const builtinDomChecks: Readonly<Record<string, DomCheck>> = {
  'header-exists': (root) =>
    root.querySelector('header, [data-testid="header"]') !== null
      ? { outcome: 'pass' }
      : { outcome: 'fail', note: 'Header bulunamadı' },
  'has-primary-action': (root) =>
    root.querySelector('[data-variant="primary"], .btn-primary, button[data-primary]') !== null
      ? { outcome: 'pass' }
      : { outcome: 'fail', note: 'Primary aksiyon butonu bulunamadı' }
}

/**
 * Tüm yerleşik DOM kontrollerini çalıştırır ve kural sonuçlarına dönüştürür.
 *
 * @param root - Kontrol edilecek kök eleman.
 * @returns Kontrol kimliğiyle eşleşen kural sonuçları.
 */
export const runDomChecks = (root: HTMLElement = document.body): RuleResult[] =>
  Object.entries(builtinDomChecks).map(([ruleId, check]) => {
    const result = check(root)
    return result.note !== undefined
      ? { ruleId, outcome: result.outcome, note: result.note }
      : { ruleId, outcome: result.outcome }
  })
