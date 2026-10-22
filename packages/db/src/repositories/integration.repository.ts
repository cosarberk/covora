/**
 * @module @covora/db/repositories/integration
 *
 * Çalışma-alanı geneli 3. parti bağlantı (Bağlamalar) veri erişimi. Jira gibi
 * dış sistemlerin uç noktası ve gizli jetonu saklanır. Gizli jeton yalnızca
 * burada tutulur; okuma modeli (`toIntegration`) onu asla dışarı vermez.
 */

import type {
  CreateIntegrationInput,
  Integration,
  UpdateIntegrationInput
} from '@covora/types'
import type { PrismaClient } from '@prisma/client'

import { toIntegration } from '../mappers.js'

/**
 * Tüm bağlantıları (sağlayıcı + ada göre) listeler.
 *
 * @param prisma - Prisma client.
 * @returns Bağlantı okuma modelleri (jeton hariç).
 */
export const listIntegrations = async (prisma: PrismaClient): Promise<Integration[]> => {
  const integrations = await prisma.integration.findMany({
    orderBy: [{ provider: 'asc' }, { name: 'asc' }]
  })
  return integrations.map(toIntegration)
}

/**
 * Yeni bir bağlantı oluşturur.
 *
 * @param prisma - Prisma client.
 * @param input - Bağlantı alanları (jeton opsiyonel).
 * @returns Oluşturulan bağlantı (jeton hariç).
 */
export const createIntegration = async (
  prisma: PrismaClient,
  input: CreateIntegrationInput
): Promise<Integration> => {
  const created = await prisma.integration.create({
    data: {
      provider: input.provider,
      name: input.name,
      baseUrl: input.baseUrl,
      token: input.token ?? null,
      enabled: input.enabled ?? true
    }
  })
  return toIntegration(created)
}

/**
 * Bir bağlantıyı kısmi günceller. `token` atlanırsa korunur, `null` ise
 * temizlenir, değer ise değiştirilir.
 *
 * @param prisma - Prisma client.
 * @param id - Bağlantı kimliği.
 * @param patch - Değişecek alanlar.
 * @returns Güncellenen bağlantı ya da (yoksa) null.
 */
export const updateIntegration = async (
  prisma: PrismaClient,
  id: string,
  patch: UpdateIntegrationInput
): Promise<Integration | null> => {
  const existing = await prisma.integration.findUnique({ where: { id } })
  if (existing === null) {
    return null
  }
  const updated = await prisma.integration.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.baseUrl !== undefined ? { baseUrl: patch.baseUrl } : {}),
      ...(patch.token !== undefined ? { token: patch.token } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {})
    }
  })
  return toIntegration(updated)
}

/**
 * Bir bağlantıyı siler.
 *
 * @param prisma - Prisma client.
 * @param id - Bağlantı kimliği.
 */
export const deleteIntegration = async (prisma: PrismaClient, id: string): Promise<void> => {
  await prisma.integration.deleteMany({ where: { id } })
}
