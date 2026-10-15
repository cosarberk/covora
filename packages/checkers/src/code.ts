/**
 * @module @covora/checkers/code
 *
 * Code review için deterministik checker'lar. Kaynak dosyalar üzerinde çalışır,
 * LLM'e gitmez; sonuç kesin ve tekrarlanabilirdir.
 */

import type { DeterministicChecker } from '@covora/core'
import type { CodeFile } from '@covora/types'

/** Bir code checker'ın ham sonucu. */
export interface CodeCheckOutcome {
  readonly outcome: 'pass' | 'fail'
  readonly note?: string
}

/** Kaynak dosyalar üzerinde çalışan deterministik kontrol. */
export type CodeChecker = (files: readonly CodeFile[]) => CodeCheckOutcome

/**
 * Bir {@link CodeChecker}'ı motorun beklediği {@link DeterministicChecker}'a
 * uyarlar. Girdi code değilse kural fail sayılır.
 *
 * @param checker - Sarmalanacak code checker.
 * @returns Motorla uyumlu deterministik checker.
 */
export const asDeterministicChecker =
  (checker: CodeChecker): DeterministicChecker =>
  (rule, input) => {
    if (input.kind !== 'code') {
      return {
        ruleId: rule.id,
        outcome: 'fail',
        note: 'Bu deterministik kontrol yalnızca code review için geçerlidir'
      }
    }
    const result = checker(input.files)
    return result.note !== undefined
      ? { ruleId: rule.id, outcome: result.outcome, note: result.note }
      : { ruleId: rule.id, outcome: result.outcome }
  }

/** Desene uyan tek bir satır eşleşmesi: dosya yolu, 1-tabanlı satır, satır metni. */
interface LineHit {
  readonly path: string
  readonly line: number
  readonly text: string
}

/** Note'ta gösterilecek en fazla eşleşme; fazlası özetlenir (log şişmesin). */
const MAX_HITS = 10

/** Uzun satırları note için kısaltır. */
const truncate = (text: string, max = 120): string =>
  text.length > max ? `${text.slice(0, max)}…` : text

/**
 * Verilen desene uyan satırları (dosya yolu + satır no + satır metni) toplar.
 * Dosya yolu yerine satır düzeyinde eşleşme döndürür ki note'ta "nerede"
 * bilgisi (path:line → satır) görünsün.
 *
 * @param files - Kaynak dosyalar.
 * @param pattern - Aranan desen (global olmamalı).
 * @returns Eşleşen satırların listesi.
 */
const linesMatching = (files: readonly CodeFile[], pattern: RegExp): LineHit[] => {
  const hits: LineHit[] = []
  for (const file of files) {
    const lines = file.content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i]!
      if (pattern.test(text)) {
        hits.push({ path: file.path, line: i + 1, text: text.trim() })
      }
    }
  }
  return hits
}

/** Eşleşmeleri `path:line → satır` biçiminde, en fazla {@link MAX_HITS} tane listeler. */
const formatHits = (hits: readonly LineHit[]): string => {
  const shown = hits
    .slice(0, MAX_HITS)
    .map((hit) => `${hit.path}:${hit.line} → ${truncate(hit.text)}`)
  const extra = hits.length > MAX_HITS ? ` (+${hits.length - MAX_HITS} tane daha)` : ''
  return `${shown.join(' | ')}${extra}`
}

/** Kodda TODO/FIXME/XXX işareti bulunmamalı. */
export const noTodoChecker: CodeChecker = (files) => {
  const hits = linesMatching(files, /\b(TODO|FIXME|XXX)\b/)
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${hits.length} TODO/FIXME işareti — ${formatHits(hits)}` }
}

/** Üretim kodunda `console.*` çağrısı bulunmamalı. */
export const noConsoleChecker: CodeChecker = (files) => {
  const hits = linesMatching(files, /\bconsole\.(log|debug|info|warn|error)\s*\(/)
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${hits.length} console çağrısı — ${formatHits(hits)}` }
}

/** Kodda gömülü (hardcoded) http(s) adresi bulunmamalı. */
export const noHardcodedUrlChecker: CodeChecker = (files) => {
  const hits = linesMatching(files, /https?:\/\/[^\s"'`]+/)
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${hits.length} gömülü URL — ${formatHits(hits)}` }
}
