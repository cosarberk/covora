/**
 * @module @covora/checkers/code
 *
 * Code review için deterministik checker'lar. Kaynak dosyalar üzerinde çalışır,
 * LLM'e gitmez; sonuç kesin ve tekrarlanabilirdir.
 */

import type { DeterministicChecker } from '@covora/core'
import type { CheckerLanguage, CodeFile } from '@covora/types'

/** Bir code checker'ın ham sonucu. */
export interface CodeCheckOutcome {
  readonly outcome: 'pass' | 'fail'
  readonly note?: string
}

/** Kaynak dosyalar üzerinde çalışan deterministik kontrol. */
export type CodeChecker = (files: readonly CodeFile[]) => CodeCheckOutcome

/** Her dilin bakacağı dosya uzantıları (küçük harf, nokta dahil). */
const LANGUAGE_EXTENSIONS: Record<Exclude<CheckerLanguage, '*'>, readonly string[]> = {
  ts: ['.ts', '.tsx', '.mts', '.cts'],
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  py: ['.py', '.pyi'],
  go: ['.go'],
  java: ['.java'],
  csharp: ['.cs']
}

/** Bir yolun küçük-harf uzantısı (`.ts` gibi), yoksa boş string. */
const extensionOf = (path: string): string => {
  const dot = path.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  return dot > slash ? path.slice(dot).toLowerCase() : ''
}

/**
 * Dosyaları verilen diller için süzer. `'*'` varsa (dilden bağımsız) tüm
 * dosyalar döner; aksi halde yalnızca ilgili uzantılı dosyalar. Böylece bir
 * TS/JS checker'ı Python projesinde eşleşen dosya bulamaz ve yanlış bulgu
 * üretmeden sessizce atlanır.
 */
const filterByLanguage = (
  files: readonly CodeFile[],
  languages: readonly CheckerLanguage[]
): readonly CodeFile[] => {
  if (languages.includes('*')) {
    return files
  }
  const allowed = new Set<string>()
  for (const lang of languages) {
    for (const ext of LANGUAGE_EXTENSIONS[lang as Exclude<CheckerLanguage, '*'>] ?? []) {
      allowed.add(ext)
    }
  }
  return files.filter((file) => allowed.has(extensionOf(file.path)))
}

/**
 * Bir {@link CodeChecker}'ı motorun beklediği {@link DeterministicChecker}'a
 * uyarlar. Girdi code değilse kural fail sayılır. `languages` verilirse checker
 * yalnızca o dil(ler)in dosyalarını görür (`['*']` dilden bağımsız).
 *
 * @param checker - Sarmalanacak code checker.
 * @param languages - Bakılacak dil(ler); varsayılan dilden bağımsız.
 * @returns Motorla uyumlu deterministik checker.
 */
export const asDeterministicChecker =
  (checker: CodeChecker, languages: readonly CheckerLanguage[] = ['*']): DeterministicChecker =>
  (rule, input) => {
    if (input.kind !== 'code') {
      return {
        ruleId: rule.id,
        outcome: 'fail',
        note: 'Bu deterministik kontrol yalnızca code review için geçerlidir'
      }
    }
    const result = checker(filterByLanguage(input.files, languages))
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
const MAX_HITS = 25

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

/** Bir dosyadan göreli import hedeflerini **satır numarasıyla** çıkarır. */
const relativeImportsWithLines = (content: string): { spec: string; line: number }[] => {
  const out: { spec: string; line: number }[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const patterns = [
      /\b(?:import|export)\b[^'"`]*?\bfrom\s*['"`](\.[^'"`]+)['"`]/g,
      /\bimport\s*\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g,
      /\brequire\s*\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g
    ]
    for (const pattern of patterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.exec(lines[i]!)) !== null) {
        out.push({ spec: match[1]!, line: i + 1 })
      }
    }
  }
  return out
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
  const fileByNode = new Map<string, CodeFile>()
  for (const file of files) {
    const node = stripModulePath(file.path)
    if (!fileByNode.has(node)) {
      fileByNode.set(node, file)
    }
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

  if (found.path === null) {
    return { outcome: 'pass' }
  }
  // Döngüyü, her kenarı (A, A'nın B'yi import ettiği dosya:satır) ile açıkla.
  const cycle = found.path
  const annotated = cycle.map((node, i) => {
    if (i === cycle.length - 1) {
      return node
    }
    const file = fileByNode.get(node)
    const next = cycle[i + 1]!
    const hit =
      file !== undefined
        ? relativeImportsWithLines(file.content).find(
            (imp) => resolveImport(file.path, imp.spec, nodeKeys) === next
          )
        : undefined
    return file !== undefined && hit !== undefined ? `${node} (${file.path}:${hit.line})` : node
  })
  return {
    outcome: 'fail',
    note: `Dairesel import tespit edildi: ${annotated.join(' → ')}`
  }
}

// --- Proje yapısı / konvansiyon yardımcıları ---

/** Kaynak kökü (tüm yapı kuralları bu önekin altında çalışır). */
const SRC = 'src/'

/** src altındaki üst düzey "katman" (aggregator) klasörleri. */
const AGGREGATORS = new Set([
  'api',
  'components',
  'constants',
  'hooks',
  'langs',
  'pages',
  'service',
  'store',
  'types',
  'utils'
])

/** Bir yolun bulunduğu dizin ('a/b/c.ts' → 'a/b'), kökte ise ''. */
const dirOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

/** Bir yolun dosya/klasör adı ('a/b/c.ts' → 'c.ts'). */
const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** Dosya adı index barrel'ı mı (index.ts / index.tsx). */
const isIndexName = (name: string): boolean => name === 'index.ts' || name === 'index.tsx'

/** Regex özel karakterlerini kaçırır. */
const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** kebab-base'i PascalCase'e çevirir ('hab-x' → 'HabX'). */
const pascalCase = (base: string): string =>
  base
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

/** `fromFile`'daki göreli `spec`'i, dosya kümesinden bağımsız olarak çözer (karşılaştırılabilir yol). */
const resolveTarget = (fromFile: string, spec: string): string =>
  stripModulePath(normalizePath(`${dirOf(fromFile)}/${spec}`))

/** Yol listesini note için kısaltarak biçimlendirir. */
const listPaths = (paths: readonly string[]): string => {
  const shown = paths.slice(0, MAX_HITS)
  const extra = paths.length > MAX_HITS ? ` (+${paths.length - MAX_HITS} tane daha)` : ''
  return `${shown.join(' | ')}${extra}`
}

/** Verilen yolun dosya içeriğini bulur (yoksa null). */
const fileContent = (files: readonly CodeFile[], path: string): string | null =>
  files.find((file) => file.path === path)?.content ?? null

// --- Hijyen kuralları (dosya-içi / scope=changes) ---

/** TypeScript'te `any` tipi kullanılmamalı. */
export const noExplicitAnyChecker: CodeChecker = (files) => {
  const hits = linesMatching(files, /(:\s*any\b|\bas\s+any\b|<\s*any\s*>|\bany\[\])/)
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${hits.length} any kullanımı — ${formatHits(hits)}` }
}

/** `@ts-ignore` / `@ts-nocheck` bastırma yorumu bulunmamalı. */
export const noTsIgnoreChecker: CodeChecker = (files) => {
  const hits = linesMatching(files, /@ts-(ignore|nocheck)\b/)
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${hits.length} @ts-ignore/@ts-nocheck — ${formatHits(hits)}` }
}

/** En fazla izin verilen dosya satır sayısı (aşılırsa dosya bölünmeli). */
const MAX_FILE_LINES = 300

/** Bir dosya {@link MAX_FILE_LINES} satırı aşmamalı. */
export const maxFileLinesChecker: CodeChecker = (files) => {
  const over: string[] = []
  for (const file of files) {
    const count = file.content.split(/\r?\n/).length
    if (count > MAX_FILE_LINES) {
      over.push(`${file.path} (${count} satır)`)
    }
  }
  return over.length === 0
    ? { outcome: 'pass' }
    : {
        outcome: 'fail',
        note: `${over.length} dosya ${MAX_FILE_LINES} satırı aşıyor — ${listPaths(over)}`
      }
}

/** `index.ts` (manifest) ve `*.config.*` dışında default export kullanılmamalı (barrel uyumu). */
const isDefaultExportExempt = (path: string): boolean =>
  path === 'src/index.ts' || /\.config\.(ts|js|mjs|cjs)$/.test(path)

/** Default export yasak (barrel `export *` uyumu); manifest ve config dosyaları muaf. */
export const noDefaultExportChecker: CodeChecker = (files) => {
  const hits: LineHit[] = []
  for (const file of files) {
    if (isDefaultExportExempt(file.path)) {
      continue
    }
    const lines = file.content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (/\bexport\s+default\b/.test(lines[i]!)) {
        hits.push({ path: file.path, line: i + 1, text: lines[i]!.trim() })
      }
    }
  }
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${hits.length} default export — ${formatHits(hits)}` }
}

// --- Yapı / ArchUnit kuralları (scope=project) ---

/** src altında zorunlu katman klasörleri + `src/index.ts` bulunmalı, fazlası olmamalı. */
export const requiredProjectStructureChecker: CodeChecker = (files) => {
  const topDirs = new Set<string>()
  let hasIndex = false
  for (const file of files) {
    if (!file.path.startsWith(SRC)) {
      continue
    }
    const rest = file.path.slice(SRC.length)
    if (rest === 'index.ts') {
      hasIndex = true
    }
    const slash = rest.indexOf('/')
    if (slash > 0) {
      topDirs.add(rest.slice(0, slash))
    }
  }
  if (topDirs.size === 0 && !hasIndex) {
    // src yapısı yok (bu proje bu konvansiyonu kullanmıyor) → sessiz geç.
    return { outcome: 'pass' }
  }
  const missing = [...AGGREGATORS].filter((dir) => !topDirs.has(dir))
  if (!hasIndex) {
    missing.push('index.ts')
  }
  const extra = [...topDirs].filter((dir) => !AGGREGATORS.has(dir))
  if (missing.length === 0 && extra.length === 0) {
    return { outcome: 'pass' }
  }
  const parts: string[] = []
  if (missing.length > 0) {
    parts.push(`eksik: ${missing.join(', ')}`)
  }
  if (extra.length > 0) {
    parts.push(`beklenmeyen: ${extra.join(', ')}`)
  }
  return { outcome: 'fail', note: `src yapısı uyumsuz — ${parts.join(' | ')}` }
}

/** Tüm klasör adları kebab-case olmalı. */
export const foldersKebabCaseChecker: CodeChecker = (files) => {
  const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/
  // Bad: kuralı bozan segmentin TAM yolu (nerede olduğu görünsün).
  const bad = new Set<string>()
  for (const file of files) {
    let acc = ''
    for (const seg of dirOf(file.path).split('/')) {
      if (seg.length === 0) {
        continue
      }
      acc = acc.length > 0 ? `${acc}/${seg}` : seg
      if (seg.startsWith('.')) {
        continue
      }
      if (!kebab.test(seg)) {
        bad.add(`${acc} (segment: ${seg})`)
      }
    }
  }
  return bad.size === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${bad.size} klasör kebab-case değil — ${listPaths([...bad].sort())}` }
}

/** src altındaki tüm kaynak dosyaları `index.ts`/`index.tsx` olmalı (dosya adı = klasör). */
export const allFilesAreIndexChecker: CodeChecker = (files) => {
  const bad: string[] = []
  for (const file of files) {
    if (!file.path.startsWith(SRC)) {
      continue
    }
    if (/\.(test|spec)\.tsx?$/.test(file.path) || /\.d\.ts$/.test(file.path)) {
      continue
    }
    if (!isIndexName(baseOf(file.path))) {
      bad.push(file.path)
    }
  }
  return bad.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${bad.length} dosya index değil — ${listPaths(bad)}` }
}

/**
 * Barrel yapısı: kod içeren her klasörde bir `index` dosyası olmalı ve bir
 * aggregator index'i alt modüllerini `export ... from './<child>'` ile yeniden
 * ihraç etmeli (manifest olan `src/index.ts` muaf).
 */
export const barrelStructureChecker: CodeChecker = (files) => {
  const indexByDir = new Map<string, string>()
  const codeDirs = new Set<string>()
  for (const file of files) {
    if (!file.path.startsWith(SRC)) {
      continue
    }
    const dir = dirOf(file.path)
    codeDirs.add(dir)
    if (isIndexName(baseOf(file.path))) {
      indexByDir.set(dir, file.content)
    }
  }
  // Kod dizinleri + tüm ataları (ör. 'src/components' alt modül içeriyorsa).
  const codeTree = new Set<string>()
  for (const dir of codeDirs) {
    let cur = dir
    while (cur.length > 0) {
      codeTree.add(cur)
      cur = dirOf(cur)
    }
  }

  const missingIndex: string[] = []
  const notReexported: string[] = []
  for (const dir of codeTree) {
    if (!dir.startsWith('src')) {
      continue
    }
    const content = indexByDir.get(dir)
    if (content === undefined) {
      missingIndex.push(dir)
      continue
    }
    if (dir === 'src') {
      continue // manifest; barrel değil
    }
    for (const child of codeTree) {
      if (dirOf(child) !== dir || child === dir) {
        continue
      }
      const name = baseOf(child)
      const re = new RegExp(`from\\s*['"\`]\\./${escapeRe(name)}(/index)?['"\`]`)
      if (!re.test(content)) {
        notReexported.push(`${dir}/index → ${name}`)
      }
    }
  }
  if (missingIndex.length === 0 && notReexported.length === 0) {
    return { outcome: 'pass' }
  }
  const parts: string[] = []
  if (missingIndex.length > 0) {
    parts.push(`barrel index yok: ${listPaths(missingIndex)}`)
  }
  if (notReexported.length > 0) {
    parts.push(`re-export edilmeyen: ${listPaths(notReexported)}`)
  }
  return { outcome: 'fail', note: parts.join(' | ') }
}

/**
 * Deep import yasak: bir aggregator alt modülüne dışarıdan erişim yalnızca
 * klasör barrel'ı üzerinden olmalı (`../hooks` ✓, `../hooks/x-hook` ✗).
 */
export const noDeepImportChecker: CodeChecker = (files) => {
  const hits: string[] = []
  for (const file of files) {
    if (!file.path.startsWith(SRC)) {
      continue
    }
    // İçinde bulunduğu katman: aynı katmandaki kardeş import'lar serbest (modül
    // kendi barrel'ını import edemez — yalnızca KATMANLAR-ARASI deep import yasak).
    const importerAgg = file.path.split('/')[1]
    for (const { spec, line } of relativeImportsWithLines(file.content)) {
      const segs = resolveTarget(file.path, spec).split('/')
      for (let i = 0; i < segs.length - 1; i++) {
        if (!AGGREGATORS.has(segs[i]!)) {
          continue
        }
        if (segs[i] === importerAgg) {
          break // aynı katman (kardeş modül) → izinli
        }
        const barrel = segs.slice(0, i + 1).join('/')
        hits.push(`${file.path}:${line} → '${spec}' yerine '${barrel}' barrel'ını kullan`)
        break
      }
    }
  }
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${hits.length} deep import — ${listPaths(hits)}` }
}

/** Katman bağımlılık kuralları: her aggregator yalnızca izinli katmanları import edebilir. */
const LAYER_DEPS: Record<string, readonly string[]> = {
  api: ['constants', 'types'],
  utils: ['constants', 'types'],
  store: ['constants', 'types', 'utils'],
  service: ['api', 'store', 'utils', 'constants', 'types'],
  hooks: ['service', 'constants', 'utils', 'types'],
  pages: ['hooks', 'components', 'langs', 'types'],
  components: ['hooks', 'components', 'constants', 'types', 'utils', 'langs'],
  constants: ['types'],
  types: ['types'],
  langs: ['types']
}

/** Katman ihlali olmamalı (ArchUnit: ör. pages sadece hooks/components çağırabilir). */
export const layerDependenciesChecker: CodeChecker = (files) => {
  const hits: string[] = []
  for (const file of files) {
    if (!file.path.startsWith(SRC)) {
      continue
    }
    const segs = file.path.split('/')
    const from = segs[1]
    if (from === undefined || !(from in LAYER_DEPS)) {
      continue
    }
    const allowed = LAYER_DEPS[from]!
    for (const { spec, line } of relativeImportsWithLines(file.content)) {
      const to = resolveTarget(file.path, spec).split('/')[1]
      if (to === undefined || !AGGREGATORS.has(to) || to === from) {
        continue
      }
      if (!allowed.includes(to)) {
        hits.push(`${file.path}:${line} → ${from} katmanı '${to}' katmanını import edemez ('${spec}')`)
      }
    }
  }
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${hits.length} katman ihlali — ${listPaths(hits)}` }
}

/**
 * JSX'te i18n'siz çıplak metin bulunmamalı (hepsi `t(...)` ile çevrilmeli).
 * Muhafazakâr desen: yalnızca `>metin</` (bir kapanış etiketinden hemen önceki
 * metin) yakalanır. Böylece `Promise<T>`, `value is NonNullable<...>`, `= Omit<>`
 * gibi generic/tip sözdizimi (ki `<` ardından `/` gelmez) yanlışlıkla
 * eşleşmez — deterministik ama düşük yanlış-pozitif.
 */
export const i18nNoBareTextChecker: CodeChecker = (files) => {
  const bare = />\s*([^<>{}]*\p{L}[^<>{}]*?)\s*<\//gu
  const hits: LineHit[] = []
  for (const file of files) {
    if (!file.path.endsWith('.tsx')) {
      continue
    }
    const lines = file.content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      bare.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = bare.exec(line)) !== null) {
        const text = match[1]!.trim()
        if (text.length > 0 && /\p{L}/u.test(text)) {
          hits.push({ path: file.path, line: i + 1, text })
          break
        }
      }
    }
  }
  return hits.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `${hits.length} çıplak JSX metni — ${formatHits(hits)}` }
}

/** State hook'ları (effect'ten önce gelmeli). useMemo/useCallback hariç — onlar
 * memoizasyon olup effect'ten sonra gelmeleri normaldir (yanlış-pozitif olmasın). */
const STATE_HOOK = /\b(useState|useReducer)\s*\(/
/** Effect hook'ları (state'ten sonra gelmeli). */
const EFFECT_HOOK = /\b(useEffect|useLayoutEffect)\s*\(/

/**
 * React kuralı: hook sıralaması — state/deklarasyon hook'ları (`useState`,
 * `useRef`, `useMemo`…) `useEffect`/`useLayoutEffect`'ten ÖNCE gelmeli. Bir
 * state hook'u ilk effect'ten sonra geliyorsa (dosya bazlı sezgisel) işaretlenir.
 */
export const reactHookOrderChecker: CodeChecker = (files) => {
  const hits: LineHit[] = []
  for (const file of files) {
    if (!file.path.endsWith('.tsx') && !file.path.endsWith('.ts')) {
      continue
    }
    const lines = file.content.split(/\r?\n/)
    let firstEffect = -1
    for (let i = 0; i < lines.length; i++) {
      if (EFFECT_HOOK.test(lines[i]!)) {
        firstEffect = i
        break
      }
    }
    if (firstEffect < 0) {
      continue
    }
    for (let i = firstEffect + 1; i < lines.length; i++) {
      if (STATE_HOOK.test(lines[i]!)) {
        hits.push({ path: file.path, line: i + 1, text: lines[i]!.trim() })
      }
    }
  }
  return hits.length === 0
    ? { outcome: 'pass' }
    : {
        outcome: 'fail',
        note: `${hits.length} state hook'u useEffect'ten sonra tanımlanmış (önce gelmeli) — ${formatHits(hits)}`
      }
}

// --- Plugin'e özel kurallar (manifest / vite / isim tutarlılığı) ---

/** Eksiksiz ve kurallı bir `PluginManifest` (`src/index.ts`) olmalı. */
export const pluginManifestValidChecker: CodeChecker = (files) => {
  const content = fileContent(files, 'src/index.ts')
  if (content === null) {
    return { outcome: 'pass' } // plugin değil
  }
  const problems: string[] = []
  const required = ['name', 'version', 'displayName', 'description', 'icon', 'routes', 'menuItems', 'permissions']
  for (const key of required) {
    if (!new RegExp(`\\b${key}\\s*:`).test(content)) {
      problems.push(`manifest.${key} eksik`)
    }
  }
  if (!/\bexport\s+default\b/.test(content)) {
    problems.push('default export yok')
  }
  if (!/export\s*\{\s*manifest\b/.test(content)) {
    problems.push('named `export { manifest }` yok')
  }
  const dn = content.match(/displayName\s*:\s*['"]([^'"]+)['"]/)
  if (dn !== null && dn[1] !== dn[1]!.toUpperCase()) {
    problems.push(`displayName tamamı büyük harf değil: '${dn[1]}'`)
  }
  const ver = content.match(/version\s*:\s*['"]([^'"]+)['"]/)
  if (ver !== null && !/^\d+\.\d+\.\d+$/.test(ver[1]!)) {
    problems.push(`version semver değil: '${ver[1]}'`)
  }
  const nm = content.match(/\bname\s*:\s*['"]([^'"]+)['"]/)
  if (nm !== null && !/^[a-z0-9-]+$/.test(nm[1]!)) {
    problems.push(`name slug (lowercase) değil: '${nm[1]}'`)
  }
  return problems.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `Manifest kuralları — ${problems.join(' | ')}` }
}

/** `vite.config.ts` plugin build kurallarına uymalı (lib/iife/external-globals). */
export const pluginViteConfigChecker: CodeChecker = (files) => {
  const content = fileContent(files, 'vite.config.ts')
  if (content === null) {
    return { outcome: 'pass' }
  }
  const problems: string[] = []
  const must: readonly [RegExp, string][] = [
    [/entry\s*:\s*['"]src\/index\.ts['"]/, "entry: 'src/index.ts'"],
    [/formats\s*:\s*\[\s*['"]iife['"]\s*\]/, "formats: ['iife']"],
    [/outDir\s*:\s*['"]dist['"]/, "outDir: 'dist'"],
    [/emptyOutDir\s*:\s*true/, 'emptyOutDir: true'],
    [/minify\s*:\s*true/, 'minify: true'],
    [/format\s*:\s*['"]iife['"]/, "output.format: 'iife'"],
    [/footer\s*:\s*['"][^'"]*window\./, 'output.footer window.* ataması']
  ]
  for (const [re, label] of must) {
    if (!re.test(content)) {
      problems.push(`eksik/yanlış: ${label}`)
    }
  }
  const extBlock = content.match(/external\s*:\s*\[([^\]]*)\]/)
  const globBlock = content.match(/globals\s*:\s*\{([\s\S]*?)\}/)
  if (extBlock !== null && globBlock !== null) {
    const exts = [...extBlock[1]!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!)
    const keys = new Set([...globBlock[1]!.matchAll(/['"]([^'"]+)['"]\s*:/g)].map((m) => m[1]!))
    const missing = exts.filter((ext) => !keys.has(ext))
    if (missing.length > 0) {
      problems.push(`global eşleşmesi eksik external'lar: ${missing.join(', ')}`)
    }
  } else {
    problems.push('external / globals blokları bulunamadı')
  }
  return problems.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `vite.config kuralları — ${problems.join(' | ')}` }
}

/** manifest.name ↔ package.json ↔ vite isimlendirmesi tek base'den türetilmeli. */
export const pluginNameConsistencyChecker: CodeChecker = (files) => {
  const idx = fileContent(files, 'src/index.ts')
  const pkg = fileContent(files, 'package.json')
  const vite = fileContent(files, 'vite.config.ts')
  if (idx === null || pkg === null || vite === null) {
    return { outcome: 'pass' } // tam doğrulanamıyor
  }
  const base = idx.match(/\bname\s*:\s*['"]([a-z0-9-]+)['"]/)?.[1]
  if (base === undefined) {
    return { outcome: 'pass' } // manifest.name yok (manifest checker yakalar)
  }
  const pascal = pascalCase(base)
  const problems: string[] = []

  const pkgName = pkg.match(/"name"\s*:\s*"([^"]+)"/)?.[1]
  const expectPkg = `${base}-plugin`
  if (pkgName !== undefined && pkgName !== expectPkg) {
    problems.push(`package.json name '${pkgName}' ≠ '${expectPkg}'`)
  }

  const expectVite = `${pascal}Plugin`
  if (!vite.includes(`'${expectVite}'`) && !vite.includes(`"${expectVite}"`)) {
    problems.push(`vite name '${expectVite}' bulunamadı`)
  }

  const fileName = vite.match(/fileName\s*:\s*\(\)\s*=>\s*['"]([^'"]+)['"]/)?.[1]
  const expectFile = `${base}-plugin.js`
  if (fileName !== undefined && fileName !== expectFile) {
    problems.push(`fileName '${fileName}' ≠ '${expectFile}'`)
  }

  const globalName = vite.match(/window\.([A-Za-z0-9_]+)\s*=/)?.[1]
  const expectGlobal = `${pascal}Plugin`
  if (globalName !== undefined && globalName !== expectGlobal) {
    problems.push(`footer global 'window.${globalName}' ≠ 'window.${expectGlobal}'`)
  }

  return problems.length === 0
    ? { outcome: 'pass' }
    : { outcome: 'fail', note: `İsim tutarlılığı — ${problems.join(' | ')}` }
}
