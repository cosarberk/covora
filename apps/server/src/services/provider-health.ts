/**
 * @module @covora/server/services/provider-health
 *
 * Bir sağlayıcının anlık sağlık/gözlemlenebilirlik görünümünü (erişilebilir mi,
 * hangi modeller mevcut, hedef model yüklü mü) üretir. En iyi çaba (best-effort)
 * ilkesiyle, zaman aşımlı ve hatayı yutan bir biçimde çalışır; panelin sağlayıcı
 * detay dashboard'unu besler.
 */

import { toProviderType } from '@covora/db'
import type { ProviderHealth } from '@covora/types'
import type { PrismaClient } from '@covora/db'

const TIMEOUT_MS = 4000

/** Zaman aşımlı JSON GET; hata/zaman aşımında null döner. */
const getJson = async (url: string, apiKey: string | null): Promise<unknown | null> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers:
        apiKey !== null && apiKey.length > 0 ? { authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === 'object' && item !== null && typeof (item as { name?: unknown }).name === 'string'
          ? [(item as { name: string }).name]
          : typeof item === 'object' && item !== null && typeof (item as { model?: unknown }).model === 'string'
            ? [(item as { model: string }).model]
            : typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string'
              ? [(item as { id: string }).id]
              : []
      )
    : []

/**
 * Bir sağlayıcının sağlığını kontrol eder.
 *
 * @param prisma - Prisma client.
 * @param id - Sağlayıcı kimliği.
 * @returns Sağlık görünümü; sağlayıcı yoksa null.
 */
export const checkProviderHealth = async (
  prisma: PrismaClient,
  id: string
): Promise<ProviderHealth | null> => {
  const provider = await prisma.providerConfig.findUnique({ where: { id } })
  if (provider === null) {
    return null
  }

  const type = toProviderType(provider.providerType)
  const base = provider.baseUrl.replace(/\/$/, '')
  const started = Date.now()

  if (type === 'ollama') {
    const tags = await getJson(`${base}/api/tags`, null)
    const latencyMs = Date.now() - started
    if (tags === null) {
      return {
        providerId: id,
        reachable: false,
        checkedAt: new Date().toISOString(),
        error: 'Ollama uç noktasına ulaşılamadı'
      }
    }
    const models = asStringArray((tags as { models?: unknown }).models)
    const ps = await getJson(`${base}/api/ps`, null)
    const loadedModels = ps === null ? [] : asStringArray((ps as { models?: unknown }).models)
    return {
      providerId: id,
      reachable: true,
      modelLoaded: loadedModels.includes(provider.model),
      busy: loadedModels.length > 0,
      models,
      latencyMs,
      checkedAt: new Date().toISOString()
    }
  }

  // openai-compatible
  const list = await getJson(`${base}/models`, provider.apiKey)
  const latencyMs = Date.now() - started
  if (list === null) {
    return {
      providerId: id,
      reachable: false,
      checkedAt: new Date().toISOString(),
      error: 'OpenAI-uyumlu uç noktaya ulaşılamadı'
    }
  }
  const models = asStringArray((list as { data?: unknown }).data)
  return {
    providerId: id,
    reachable: true,
    models,
    latencyMs,
    checkedAt: new Date().toISOString()
  }
}
