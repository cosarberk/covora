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
