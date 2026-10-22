/**
 * @module @covora/cli/collect
 *
 * Yerel bir çalışma kopyasından review'a gönderilecek dosyaları toplar:
 * bir klasörü özyinelemeli gezerek (full proje review) veya git'e göre değişen
 * dosyaları seçerek (diff review). Dönen yollar daima **çalışma dizinine (cwd)
 * göreli** ve POSIX ayırıcılıdır; sunucudaki checker'lar `src/...` önekini bu
 * sayede doğru görür (depo kökünden çalıştırıldığında).
 */

import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Bir yolun bir deseni dışlayıp dışlamadığını söyleyen fonksiyon. */
export type IgnoreMatcher = (relPath: string) => boolean

/** Glob desenini (`*`, `**`, `?`) tam-eşleşme regex'ine çevirir. */
const globToRegex = (glob: string): RegExp => {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000') // ** → her şey (ayırıcı dahil)
    .replace(/\*/g, '[^/]*') // * → ayırıcı olmayan
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${source}$`)
}

/**
 * gitignore benzeri dışlama eşleştiricisi kurar. Desen türleri:
 * - düz isim (`tests`, `api`) → herhangi bir yol segmentiyle eşleşir (klasör/dosya),
 * - yol (`src/api`) → o yola ve altına sabitlenir,
 * - glob (`**\/*.stories.tsx`, `*.test.ts`) → yola/dosya adına göre eşleşir.
 *
 * @param patterns - Dışlama desenleri.
 * @returns Göreli yolu alıp dışlanıp dışlanmadığını dönen fonksiyon.
 */
export const makeIgnoreMatcher = (patterns: readonly string[]): IgnoreMatcher => {
  const compiled = patterns
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0 && !raw.startsWith('#'))
    .map((raw) => {
      const pattern = raw.replace(/^\.?\//, '').replace(/\/+$/, '')
      const hasSlash = pattern.includes('/')
      const hasGlob = /[*?]/.test(pattern)
      return {
        pattern,
        hasSlash,
        hasGlob,
        re: hasSlash || hasGlob ? globToRegex(pattern) : null
      }
    })

  return (relPath: string): boolean => {
    const base = relPath.slice(relPath.lastIndexOf('/') + 1)
    for (const c of compiled) {
      if (c.re === null) {
        // Düz isim → herhangi bir segmentle eşleşsin.
        if (relPath.split('/').includes(c.pattern)) {
          return true
        }
      } else if (c.hasSlash) {
        if (c.re.test(relPath)) {
          return true
        }
        if (!c.hasGlob && (relPath === c.pattern || relPath.startsWith(`${c.pattern}/`))) {
          return true
        }
      } else if (c.re.test(base)) {
        // Ayırıcısız glob → dosya adına göre (her seviyede).
        return true
      }
    }
    return false
  }
}

/** `.covoraignore` dosyasından desenleri yükler (yoksa boş). */
export const readIgnoreFile = async (dir: string = process.cwd()): Promise<string[]> => {
  try {
    const content = await readFile(resolve(dir, '.covoraignore'), 'utf8')
    return content.split(/\r?\n/)
  } catch {
    return []
  }
}

/**
 * `.covoraignore` dosyası ile `--ignore` CLI değerini birleştirip tek bir
 * eşleştirici kurar.
 *
 * @param cliIgnore - `--ignore` değeri (virgül/boşlukla ayrılmış), opsiyonel.
 * @returns Dışlama eşleştiricisi.
 */
export const loadIgnoreMatcher = async (cliIgnore?: string): Promise<IgnoreMatcher> => {
  const fromFile = await readIgnoreFile()
  const fromCli = cliIgnore !== undefined ? cliIgnore.split(/[,\s]+/) : []
  return makeIgnoreMatcher([...fromFile, ...fromCli])
}

/** Taranmayacak dizinler (bağımlılık/çıktı/vcs). */
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  'vendor',
  'target',
  '.turbo',
  '.cache',
  '__pycache__'
])

/** Review'a alınacak kaynak uzantıları. */
const ALLOWED_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'go', 'java', 'kt', 'rb', 'rs', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs',
  'php', 'swift', 'scala', 'sh', 'bash',
  'html', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
  'json', 'yaml', 'yml', 'toml', 'xml', 'sql', 'graphql', 'proto',
  'md', 'txt'
])

/** Tek dosya üst sınırı (büyük/üretilmiş dosyaları ele). */
const MAX_FILE_BYTES = 256 * 1024
/** Toplanacak en fazla dosya sayısı. */
const MAX_FILES = 1500

/** Bir uzantının review'a uygun olup olmadığı. */
const isAllowedExt = (name: string): boolean => {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return ALLOWED_EXT.has(ext)
}

/** Mutlak yolu cwd'ye göreli, POSIX ayırıcılı yola çevirir. */
const toRel = (full: string): string => relative(process.cwd(), full).split(sep).join('/')

/**
 * Bir klasörü özyinelemeli gezip uygun kaynak dosyalarının (cwd'ye göreli)
 * yollarını toplar.
 *
 * @param scanPath - Taranacak klasör (cwd'ye göreli veya mutlak).
 * @returns Göreli dosya yolları.
 */
export const collectPaths = async (
  scanPath: string,
  ignore: IgnoreMatcher = () => false
): Promise<string[]> => {
  const root = resolve(process.cwd(), scanPath)
  const paths: string[] = []

  const walk = async (dir: string): Promise<void> => {
    if (paths.length >= MAX_FILES) {
      return
    }
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (paths.length >= MAX_FILES) {
        return
      }
      const full = resolve(dir, entry.name)
      const rel = toRel(full)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !ignore(rel)) {
          await walk(full)
        }
        continue
      }
      if (!entry.isFile() || !isAllowedExt(entry.name) || ignore(rel)) {
        continue
      }
      const info = await stat(full)
      if (info.size === 0 || info.size > MAX_FILE_BYTES) {
        continue
      }
      paths.push(rel)
    }
  }

  const info = await stat(root)
  if (info.isFile()) {
    const rel = toRel(root)
    return isAllowedExt(root) && !ignore(rel) ? [rel] : []
  }
  await walk(root)
  return paths.sort()
}

/**
 * Git'e göre değişen (eklenen/değiştirilen/yeniden-adlandırılan) uygun dosyaların
 * yollarını toplar. Diff review için kullanılır.
 *
 * @param base - Karşılaştırma tabanı (verilmezse çalışma ağacı HEAD'e karşı).
 * @returns Göreli dosya yolları.
 */
export const changedPaths = async (
  base?: string,
  ignore: IgnoreMatcher = () => false
): Promise<string[]> => {
  const args =
    base !== undefined && base.length > 0
      ? ['diff', '--name-only', '--diff-filter=ACMR', base]
      : ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']
  const { stdout } = await execFileAsync('git', args, { maxBuffer: 16 * 1024 * 1024 })
  const names = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && isAllowedExt(line) && !ignore(line))

  const existing: string[] = []
  for (const name of names) {
    try {
      const info = await stat(resolve(process.cwd(), name))
      if (info.isFile() && info.size > 0 && info.size <= MAX_FILE_BYTES) {
        existing.push(name)
      }
    } catch {
      // Silinmiş/erişilemez dosyayı atla.
    }
  }
  return existing
}

/**
 * code-hash üretir: önce git HEAD kısa sha'sı, olmazsa zaman damgası. Review'ı
 * bir kod sürümüyle ilişkilendirmek içindir.
 */
export const deriveCodeHash = async (): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'])
    const sha = stdout.trim()
    if (sha.length > 0) {
      return sha
    }
  } catch {
    // git yok/repo değil → zaman damgasına düş.
  }
  return `local-${Date.now()}`
}
