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

// --- ArchUnit tarzı (proje-geneli / scope=project) deterministik kontroller ---
// Bu checker'lar TÜM proje dosyaları verildiğinde anlamlıdır (çapraz-dosya); diff
// akışında eksik grafik yüzünden koşmazlar.

/** Bir modül yolunu uzantı/index varyantlarından sadeleştirir (karşılaştırma için). */
const stripModulePath = (path: string): string =>
  path.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '').replace(/\/index$/, '')

/** POSIX yol parçalarını `.`/`..` çözerek normalize eder. */
const normalizePath = (path: string): string => {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') {
      continue
    }
    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return parts.join('/')
}

/** Bir dosyadan göreli import/require/export-from hedeflerini çıkarır. */
const relativeImports = (content: string): string[] => {
  const specs: string[] = []
  const patterns = [
    /\b(?:import|export)\b[^'"`]*?\bfrom\s*['"`](\.[^'"`]+)['"`]/g,
    /\bimport\s*\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g,
    /\brequire\s*\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      specs.push(match[1]!)
    }
  }
  return specs
}

/** `fromFile`'daki göreli `spec`'i dosya kümesindeki bir düğüme çözer (yoksa null). */
const resolveImport = (fromFile: string, spec: string, nodes: ReadonlySet<string>): string | null => {
  const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : ''
  const target = stripModulePath(normalizePath(`${dir}/${spec}`))
  return nodes.has(target) ? target : null
}

/**
 * Proje içinde dairesel (cyclic) import bağımlılığı bulunmamalı. Tüm dosyaların
 * göreli import grafiğini kurar ve bir döngü tespit ederse (A → B → … → A) kuralı
 * başarısız sayar; ArchUnit'teki `noCycles` kuralının karşılığıdır.
 */
export const noCyclicImportsChecker: CodeChecker = (files) => {
  // Her dosyayı sadeleştirilmiş yoluyla düğüm yap; aynı düğüme düşenleri birleştir.
  const nodeKeys = new Set(files.map((file) => stripModulePath(file.path)))
  const graph = new Map<string, string[]>()
  for (const file of files) {
    const node = stripModulePath(file.path)
    const edges = graph.get(node) ?? []
    for (const spec of relativeImports(file.content)) {
      const target = resolveImport(file.path, spec, nodeKeys)
      if (target !== null && target !== node) {
        edges.push(target)
      }
    }
    graph.set(node, edges)
  }

  // DFS ile geri-kenar (back-edge) arayarak ilk döngüyü bul.
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const stack: string[] = []
  // Holder nesnesi: closure içinde atanan değeri TS'in null'a daraltmaması için.
  const found: { path: string[] | null } = { path: null }

  const visit = (node: string): void => {
    if (found.path !== null) {
      return
    }
    color.set(node, GRAY)
    stack.push(node)
    for (const next of graph.get(node) ?? []) {
      if (found.path !== null) {
        break
      }
      const state = color.get(next) ?? WHITE
      if (state === WHITE) {
        visit(next)
      } else if (state === GRAY) {
        const start = stack.indexOf(next)
        found.path = [...stack.slice(start), next]
      }
    }
    stack.pop()
    color.set(node, BLACK)
  }

  for (const node of nodeKeys) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      visit(node)
    }
    if (found.path !== null) {
      break
    }
  }

  return found.path === null
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `Dairesel import tespit edildi: ${found.path.join(' → ')}` }
}
