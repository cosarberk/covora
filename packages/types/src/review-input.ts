/**
 * @module @covora/types/review-input
 *
 * Review girdisi sözleşmeleri. UI review bir ekran görüntüsü, code review ise
 * kaynak dosyalar üzerinden çalışır; ayrımı `kind` ayırıcısı yapar.
 */

import { z } from 'zod'

import { ruleResultSchema } from './checklist.js'

/** Code review'da değerlendirilecek tek bir kaynak dosya. */
export const codeFileSchema = z.object({
  /** Depoya göreli dosya yolu. */
  path: z.string().min(1),
  /** Dosya içeriği. */
  content: z.string()
})

/** {@link codeFileSchema} tip çıkarımı. */
export type CodeFile = z.infer<typeof codeFileSchema>

/**
 * Review girdisi. `ui` için base64 ekran görüntüsü, `code` için kaynak
 * dosyalar taşınır.
 */
export const reviewInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ui'),
    /** Base64 kodlu ekran görüntüsü (PNG). */
    screenshot: z.string().min(1),
    /**
     * Client tarafında (DOM üzerinde) hesaplanan deterministik kural sonuçları.
     * Server DOM'a erişemediği için UI deterministik kuralları burada gelir.
     */
    clientResults: z.array(ruleResultSchema).optional()
  }),
  z.object({
    kind: z.literal('code'),
    /** Değerlendirilecek kaynak dosyalar. */
    files: z.array(codeFileSchema).min(1)
  })
])

/** {@link reviewInputSchema} tip çıkarımı. */
export type ReviewInput = z.infer<typeof reviewInputSchema>
