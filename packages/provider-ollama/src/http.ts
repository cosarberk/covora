/**
 * @module @covora/provider-ollama/http
 *
 * `node:http(s)` tabanlı JSON POST yardımcısı. Neden fetch değil: Node'un global
 * fetch'i (undici) gizli bir `headersTimeout`'a sahiptir (~5 dk) ve bu kapatılamaz;
 * sunucu yanıt başlığını geç gönderirse (ör. Ollama CPU'da modeli dakikalarca
 * yüklerken) bağlantıyı keser → model yüklemesi iptal olur. `node:http` ile
 * böyle bir başlık zaman aşımı yoktur; `timeoutMs` 0/verilmezse **süresiz**
 * beklenir, AI cevap verene kadar bağlantı açık kalır.
 */

import http from 'node:http'
import https from 'node:https'

/** {@link postJson} seçenekleri. */
export interface PostJsonOptions {
  /** Bearer API anahtarı (varsa). */
  readonly apiKey?: string | null
  /** Socket zaman aşımı (ms). 0 ya da verilmezse süresiz bekler. */
  readonly timeoutMs?: number
}

/**
 * Bir JSON gövdesini POST eder ve yanıtı JSON olarak çözer. 4xx/5xx durumunda
 * reddeder. Zaman aşımı yalnızca `timeoutMs > 0` ise kurulur.
 *
 * @param url - Hedef URL.
 * @param body - JSON gövdesi.
 * @param options - API anahtarı ve zaman aşımı.
 * @returns Ayrıştırılmış yanıt (gövde boşsa boş nesne).
 */
export const postJson = (
  url: string,
  body: unknown,
  options: PostJsonOptions = {}
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const payload = JSON.stringify(body)

    const request = lib.request(
      parsed,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...(options.apiKey !== undefined && options.apiKey !== null && options.apiKey.length > 0
            ? { authorization: `Bearer ${options.apiKey}` }
            : {})
        }
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const status = response.statusCode ?? 0
          if (status >= 400) {
            reject(new Error(`HTTP ${status}: ${text.slice(0, 300)}`))
            return
          }
          try {
            resolve(text.length > 0 ? JSON.parse(text) : {})
          } catch (error) {
            reject(error instanceof Error ? error : new Error('Geçersiz JSON yanıtı'))
          }
        })
      }
    )

    // Yalnızca pozitif timeout'ta socket zaman aşımı kur; aksi halde süresiz bekle.
    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      request.setTimeout(options.timeoutMs, () => {
        request.destroy(new Error('İstek zaman aşımına uğradı'))
      })
    }

    request.on('error', (error) => reject(error))
    request.write(payload)
    request.end()
  })
