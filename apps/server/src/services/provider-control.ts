/**
 * @module @covora/server/services/provider-control
 *
 * Sağlayıcı çalışma-zamanı kontrolleri: modeli belleğe (RAM) önceden yükleme
 * (ısıtma) ve bellekten boşaltma. Ollama için `/api/generate` + `keep_alive`
 * ile yapılır; yükleme CPU'da dakikalar sürebildiğinden **ateşle-unut**'tur —
 * istek beklenmez, hazır olup olmadığı sağlık kontrolünden (`/providers/:id/health`)
 * izlenir. OpenAI-uyumlu sağlayıcılarda "modeli yükle" kavramı olmadığından
 * desteklenmez.
 */

import { toProviderType } from '@covora/db'
import type { PrismaClient } from '@covora/db'

/** Kontrol aksiyonunun sonucu. */
export interface ProviderControlResult {
  /** Sağlayıcı türü bu aksiyonu destekliyor mu (yalnızca ollama). */
  readonly supported: boolean
  /** Aksiyon başlatıldı mı. */
  readonly started: boolean
}

/** Ollama'ya ateşle-unut bir keep_alive isteği gönderir (yükle/boşalt). */
const sendKeepAlive = (baseUrl: string, model: string, keepAlive: number): void => {
  const base = baseUrl.replace(/\/$/, '')
  // Yanıtı beklemiyoruz: model yüklemesi uzun sürebilir; durum health'ten gelir.
  void fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: keepAlive })
  }).catch(() => {
    // Hata health kontrolünde görünür; burada yutulur.
  })
}

/**
 * Modeli belleğe önceden yükler (süresiz tutar). Ateşle-unut.
 *
 * @returns Sağlayıcı yoksa null; aksi halde aksiyon sonucu.
 */
export const warmProvider = async (
  prisma: PrismaClient,
  id: string
): Promise<ProviderControlResult | null> => {
  const provider = await prisma.providerConfig.findUnique({ where: { id } })
  if (provider === null) {
    return null
  }
  if (toProviderType(provider.providerType) !== 'ollama') {
    return { supported: false, started: false }
  }
  sendKeepAlive(provider.baseUrl, provider.model, -1)
  return { supported: true, started: true }
}

/**
 * Modeli bellekten boşaltır (keep_alive 0). Ateşle-unut.
 *
 * @returns Sağlayıcı yoksa null; aksi halde aksiyon sonucu.
 */
export const unloadProvider = async (
  prisma: PrismaClient,
  id: string
): Promise<ProviderControlResult | null> => {
  const provider = await prisma.providerConfig.findUnique({ where: { id } })
  if (provider === null) {
    return null
  }
  if (toProviderType(provider.providerType) !== 'ollama') {
    return { supported: false, started: false }
  }
  sendKeepAlive(provider.baseUrl, provider.model, 0)
  return { supported: true, started: true }
}
