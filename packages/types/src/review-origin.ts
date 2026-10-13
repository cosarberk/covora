/**
 * @module @covora/types/review-origin
 *
 * Review'u tetikleyen köken (provenance) metadata'sı. Bu bir yetki/rol DEĞİL;
 * yalnızca "nereden, kim, hangi dal/commit tetikledi" bilgisidir ve tümüyle
 * opsiyoneldir (eski istemciler etkilenmez). Tipik olarak pipeline (CI) ya da
 * CLI gönderir; Studio bunu ilgili GitHub/GitLab MR/PR/commit'ine tıklanabilir
 * bir bağlantı olarak gösterir, böylece bir node'dan kaynağa gidilebilir.
 */

import { z } from 'zod'

/** Review'u tetikleyen ortam. */
export const reviewSourceSchema = z.enum(['browser', 'cli', 'ci'])

/** {@link reviewSourceSchema} tip çıkarımı. */
export type ReviewSource = z.infer<typeof reviewSourceSchema>

/** Tetikleyen kişi (git author ya da CI aktörü). */
export const reviewActorSchema = z.object({
  /** Görünen ad ya da kullanıcı adı. */
  name: z.string().min(1).optional(),
  /** E-posta ya da kullanıcı adı/handle. */
  email: z.string().min(1).optional()
})

/** {@link reviewActorSchema} tip çıkarımı. */
export type ReviewActor = z.infer<typeof reviewActorSchema>

/**
 * Review'un köken/tetikleme bağlamı. Tüm alanlar opsiyoneldir; hiçbiri
 * gelmezse review yine çalışır (köken bilinmez). Bağlantılar geçerli URL
 * olmalıdır ki Studio'da güvenle tıklanabilsin.
 */
export const reviewOriginSchema = z.object({
  /** Tetikleyen ortam (tarayıcı / CLI / CI). */
  source: reviewSourceSchema.optional(),
  /** Depo ana sayfası (GitHub/GitLab). */
  repoUrl: z.string().url().optional(),
  /** Tetikleyen MR/PR ya da commit bağlantısı (Studio'da tıklanır). */
  refUrl: z.string().url().optional(),
  /** Dal adı. */
  branch: z.string().min(1).optional(),
  /** Commit SHA (kısa ya da tam). */
  commitSha: z.string().min(1).optional(),
  /** Tetikleyen kişi. */
  actor: reviewActorSchema.optional()
})

/** {@link reviewOriginSchema} tip çıkarımı. */
export type ReviewOrigin = z.infer<typeof reviewOriginSchema>
