/**
 * @module @covora/types/project
 *
 * Proje git bağlantısı sözleşmesi. Covora, bir projenin kaynağını kendi başına
 * çekebilmek için (diff review + proje-geneli architecture review) git
 * sağlayıcısının adresini ve gizli erişim jetonunu projede tutar. Bu, 3. parti
 * "Bağlamalar" (Jira vb.) ile karıştırılmamalıdır; git bağlantısı projeye özeldir.
 *
 * Gizli jeton (`gitToken`) okuma modelinde taşınmaz; yalnızca varlığı
 * `hasGitToken` ile bildirilir.
 */

import { z } from 'zod'

/**
 * Desteklenen git sağlayıcıları. Covora depoyu bu sağlayıcının API'si/clone'u
 * ile çeker.
 */
export const gitProviderSchema = z.enum(['github', 'gitlab', 'gitea', 'generic'])

/** {@link gitProviderSchema} tip çıkarımı. */
export type GitProvider = z.infer<typeof gitProviderSchema>

/**
 * Bir projenin git bağlantısı güncelleme/oluşturma girdisi. Tüm alanlar
 * opsiyoneldir; token verilirse değiştirilir, `null` ise temizlenir, atlanırsa
 * korunur.
 */
export const gitConnectionInputSchema = z.object({
  gitProvider: gitProviderSchema.nullable().optional(),
  gitRepoUrl: z.string().min(1).nullable().optional(),
  gitToken: z.string().min(1).nullable().optional()
})

/** {@link gitConnectionInputSchema} tip çıkarımı. */
export type GitConnectionInput = z.infer<typeof gitConnectionInputSchema>
