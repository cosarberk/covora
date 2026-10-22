/**
 * @module @covora/server/services/git-source
 *
 * Covora'nın bir projenin deposunu KENDİSİ çekmesi. Kayıtlı git bağlantısını
 * (provider + repoUrl + gizli token) kullanıp geçici bir dizine **shallow clone**
 * eder, kod dosyalarını toplar, commit sha'yı okur ve dizini her durumda siler.
 *
 * Provider-bağımsızdır (github/gitlab/gitea/generic aynı `git` ile çekilir);
 * sistemde `git` binary'si bulunur (runtime image'ına gömülüdür). Gizli token
 * yalnızca clone URL'sinde kullanılır; ne loglanır ne de hata mesajında sızdırılır
 * (bkz. {@link redact}).
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { promisify } from 'node:util'

import type { CodeFile, GitProvider } from '@covora/types'

const execFileAsync = promisify(execFile)

/** Çekilecek git bağlantısı. */
export interface GitSource {
  readonly provider: GitProvider | null
  readonly repoUrl: string
  readonly token: string | null
}

/** Çekme seçenekleri. */
export interface CloneOptions {
  /** Çekilecek dal (verilmezse deponun varsayılan dalı). */
  readonly ref?: string
  /** Clone zaman aşımı (ms). */
  readonly timeoutMs?: number
}

/** Çekme sonucu: toplanan dosyalar ve commit bilgisi. */
export interface CollectResult {
  readonly files: CodeFile[]
  readonly commitSha: string
  readonly branch: string
}

/** Diff çekme seçenekleri: iki ref arası değişen dosyalar. */
export interface DiffOptions {
  /** Karşılaştırma tabanı (base ref: dal/tag/sha). */
  readonly base: string
  /** İncelenecek uç (head ref: dal/tag/sha). */
  readonly head: string
  /** Fetch/diff zaman aşımı (ms). */
  readonly timeoutMs?: number
}

/** Diff sonucu: yalnızca değişen dosyalar + taraf commit'leri. */
export interface DiffResult {
  readonly files: CodeFile[]
  readonly baseSha: string
  readonly headSha: string
  readonly branch: string
}

/** Review'a alınmayacak dizinler (bağımlılık/çıktı/vcs). */
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

/** Review'a alınacak kaynak uzantıları (metin/kod). */
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
/** Toplam içerik üst sınırı (payload'ı sınırla). */
const MAX_TOTAL_BYTES = 8 * 1024 * 1024
/** Varsayılan clone zaman aşımı. */
const DEFAULT_TIMEOUT_MS = 120_000

/**
 * Bir hata/metinden gizli token'ı temizler. git hata mesajları clone URL'sini
 * (dolayısıyla token'ı) içerebildiğinden, dışarı vermeden önce maskelenir.
 */
const redact = (text: string, token: string | null): string =>
  token !== null && token.length > 0 ? text.split(token).join('***') : text

/**
 * Sağlayıcıya göre kimlikli clone URL'si üretir. Token yoksa URL değişmez
 * (public depo). http(s) dışındaki şemalar reddedilir.
 */
const buildAuthUrl = (source: GitSource): string => {
  const url = new URL(source.repoUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Depo adresi yalnızca http(s) olabilir')
  }
  if (source.token === null || source.token.length === 0) {
    return url.toString()
  }
  switch (source.provider) {
    case 'github':
      url.username = 'x-access-token'
      url.password = source.token
      break
    case 'gitlab':
      url.username = 'oauth2'
      url.password = source.token
      break
    default:
      // gitea ve jenerik: token'ı kullanıcı adı olarak ver (yaygın kabul).
      url.username = source.token
      break
  }
  return url.toString()
}

/** Bir uzantının review'a uygun (metin/kod) olup olmadığı. */
const isAllowedExt = (name: string): boolean => {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return ALLOWED_EXT.has(ext)
}

/**
 * Tek bir (göreli) yolu filtreden geçirip okur; uygun değilse (uzantı/boyut/
 * bulunamadı) null döner. Yol daima POSIX ayırıcıyla normalize edilir.
 */
const readAllowed = async (root: string, relPath: string): Promise<CodeFile | null> => {
  if (!isAllowedExt(relPath)) {
    return null
  }
  const full = join(root, relPath)
  try {
    const info = await stat(full)
    if (!info.isFile() || info.size === 0 || info.size > MAX_FILE_BYTES) {
      return null
    }
    const content = await readFile(full, 'utf8')
    return { path: relPath.split(sep).join('/'), content }
  } catch {
    return null
  }
}

/**
 * Bir dizini özyinelemeli gezip uygun kod dosyalarını toplar. Atlanan dizinler,
 * uzantı dışı/çok büyük dosyalar ve limitler uygulanır.
 */
const collectFiles = async (root: string): Promise<CodeFile[]> => {
  const files: CodeFile[] = []
  let totalBytes = 0

  const walk = async (dir: string): Promise<void> => {
    if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) {
      return
    }
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) {
        return
      }
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue
        }
        await walk(full)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      const ext = entry.name.includes('.') ? entry.name.split('.').pop()!.toLowerCase() : ''
      if (!ALLOWED_EXT.has(ext)) {
        continue
      }
      const info = await stat(full)
      if (info.size === 0 || info.size > MAX_FILE_BYTES) {
        continue
      }
      if (totalBytes + info.size > MAX_TOTAL_BYTES) {
        continue
      }
      const content = await readFile(full, 'utf8')
      // Yol daima POSIX ayırıcıyla (review/checker'lar path:line bekliyor).
      const path = relative(root, full).split(sep).join('/')
      files.push({ path, content })
      totalBytes += info.size
    }
  }

  await walk(root)
  return files
}

/**
 * Bir projenin deposunu çeker ve kod dosyalarını toplar. Geçici dizin her durumda
 * (hata dahil) silinir.
 *
 * @param source - Git bağlantısı (provider/repoUrl/token).
 * @param options - Dal ve zaman aşımı.
 * @returns Toplanan dosyalar + commit sha + dal.
 */
export const cloneAndCollect = async (
  source: GitSource,
  options: CloneOptions = {}
): Promise<CollectResult> => {
  const authUrl = buildAuthUrl(source)
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const dir = await mkdtemp(join(tmpdir(), 'covora-src-'))
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }

  try {
    const cloneArgs = [
      'clone',
      '--depth',
      '1',
      '--single-branch',
      ...(options.ref !== undefined && options.ref.length > 0 ? ['--branch', options.ref] : []),
      authUrl,
      dir
    ]
    await execFileAsync('git', cloneArgs, { timeout, env })

    const [{ stdout: shaOut }, { stdout: branchOut }] = await Promise.all([
      execFileAsync('git', ['-C', dir, 'rev-parse', 'HEAD'], { timeout, env }),
      execFileAsync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout, env })
    ])

    const files = await collectFiles(dir)
    if (files.length === 0) {
      throw new Error('Depoda incelenecek kod dosyası bulunamadı')
    }

    return {
      files,
      commitSha: shaOut.trim(),
      branch: options.ref ?? branchOut.trim()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Depo çekilemedi: ${redact(message, source.token)}`)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * İki ref (base → head) arasındaki **değişen** dosyaları çeker. Her iki ref'i de
 * shallow fetch eder (hızlı), head'i checkout edip base ile iki-nokta diff alır;
 * yalnızca eklenen/değişen/yeniden-adlandırılan (silinenler hariç) dosyaların
 * güncel içeriğini toplar. Diff bazlı review bunu kullanır.
 *
 * @param source - Git bağlantısı.
 * @param options - base/head ref'leri ve zaman aşımı.
 * @returns Değişen dosyalar + base/head sha + dal (head).
 */
export const cloneAndCollectDiff = async (
  source: GitSource,
  options: DiffOptions
): Promise<DiffResult> => {
  const authUrl = buildAuthUrl(source)
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const dir = await mkdtemp(join(tmpdir(), 'covora-diff-'))
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  const git = (args: readonly string[]): Promise<{ stdout: string }> =>
    execFileAsync('git', ['-C', dir, ...args], { timeout, env, maxBuffer: 32 * 1024 * 1024 })

  try {
    await execFileAsync('git', ['init', '-q', dir], { timeout, env })
    await git(['remote', 'add', 'origin', authUrl])
    // base ve head'i ayrı ayrı shallow çek; base'i geçici bir ref'e sabitle.
    await git(['fetch', '--depth', '1', 'origin', options.base])
    const { stdout: baseShaOut } = await git(['rev-parse', 'FETCH_HEAD'])
    const baseSha = baseShaOut.trim()
    await git(['fetch', '--depth', '1', 'origin', options.head])
    const { stdout: headShaOut } = await git(['rev-parse', 'FETCH_HEAD'])
    const headSha = headShaOut.trim()
    await git(['checkout', '-q', '--detach', 'FETCH_HEAD'])

    const { stdout: diffOut } = await git([
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      baseSha,
      headSha
    ])
    const changed = diffOut.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)

    const files: CodeFile[] = []
    let totalBytes = 0
    for (const relPath of changed) {
      if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) {
        break
      }
      const file = await readAllowed(dir, relPath)
      if (file !== null) {
        files.push(file)
        totalBytes += Buffer.byteLength(file.content, 'utf8')
      }
    }
    if (files.length === 0) {
      throw new Error('İki ref arasında incelenecek değişen kod dosyası yok')
    }

    return { files, baseSha, headSha, branch: options.head }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Diff çekilemedi: ${redact(message, source.token)}`)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
