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

/**
 * Verilen desene uyan satır içeren dosyaların yollarını toplayan yardımcı.
 *
 * @param files - Kaynak dosyalar.
 * @param pattern - Aranan desen.
 * @returns Eşleşen dosya yolları.
 */
const filesMatching = (files: readonly CodeFile[], pattern: RegExp): string[] =>
  files.filter((file) => pattern.test(file.content)).map((file) => file.path)

/** Kodda TODO/FIXME/XXX işareti bulunmamalı. */
export const noTodoChecker: CodeChecker = (files) => {
  const hits = filesMatching(files, /\b(TODO|FIXME|XXX)\b/)
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `TODO/FIXME işareti: ${hits.join(', ')}` }
}

/** Üretim kodunda `console.*` çağrısı bulunmamalı. */
export const noConsoleChecker: CodeChecker = (files) => {
  const hits = filesMatching(files, /\bconsole\.(log|debug|info|warn|error)\s*\(/)
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `console çağrısı: ${hits.join(', ')}` }
}

/** Kodda gömülü (hardcoded) http(s) adresi bulunmamalı. */
export const noHardcodedUrlChecker: CodeChecker = (files) => {
  const hits = filesMatching(files, /https?:\/\/[^\s"'`]+/)
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `Gömülü URL: ${hits.join(', ')}` }
}
