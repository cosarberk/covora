/**
 * @module @covora/types/integration
 *
 * Çalışma-alanı geneli 3. parti bağlantı (Bağlamalar) sözleşmesi. Jira gibi dış
 * sistemlerin uç noktası ve gizli erişim jetonu burada tanımlanır; ileride
 * otomasyon kuralları (örn. "Jira'da task review'a alınınca MR kontrolü başlat")
 * bu bağlantılara dayanır. Git sağlayıcıları (GitHub/GitLab) buraya DEĞİL,
 * projenin kendi git bağlantısına aittir.
 *
 * Gizli bilgi (`token`) bu okuma modelinde taşınmaz; yalnızca varlığı
 * `hasToken` ile belirtilir (sağlayıcı `apiKey` deseniyle tutarlı).
 */

import { z } from 'zod'

/**
 * Desteklenen bağlantı sağlayıcıları. Yeni bir sağlayıcı eklemek yalnızca bu
 * listeyi ve bir adapter'ı genişletmeyi gerektirir.
 * - `jira`: Atlassian Jira (task/issue otomasyonları).
 * - `generic`: Jenerik HTTP uç noktası (webhook benzeri serbest bağlantı).
 */
export const integrationProviderSchema = z.enum(['jira', 'generic'])

/** {@link integrationProviderSchema} tip çıkarımı. */
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>

/**
 * Kayıtlı bir bağlantının okuma modeli. Gizli jeton asla dönülmez; yalnızca
 * tanımlı olup olmadığı `hasToken` ile bildirilir.
 */
export const integrationSchema = z.object({
  /** Kalıcılık kimliği. */
  id: z.string().min(1),
  /** Sağlayıcı. */
  provider: integrationProviderSchema,
  /** Okunabilir ad. */
  name: z.string().min(1),
  /** Dış sistemin temel adresi. */
  baseUrl: z.string().min(1),
  /** Erişim jetonu tanımlı mı (değerin kendisi asla dönülmez). */
  hasToken: z.boolean().default(false),
  /** Bağlantı etkin mi. */
  enabled: z.boolean(),
  /** Oluşturulma zamanı (ISO). */
  createdAt: z.string().min(1)
})

/** {@link integrationSchema} tip çıkarımı. */
export type Integration = z.infer<typeof integrationSchema>

/** Yeni bağlantı oluşturma girdisi. */
export const createIntegrationInputSchema = z.object({
  provider: integrationProviderSchema,
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  /** Gizli jeton (opsiyonel; sonradan eklenebilir). */
  token: z.string().min(1).optional(),
  enabled: z.boolean().optional()
})

/** {@link createIntegrationInputSchema} tip çıkarımı. */
export type CreateIntegrationInput = z.infer<typeof createIntegrationInputSchema>

/**
 * Bağlantı güncelleme girdisi (kısmi). `token` verilirse değiştirilir; `null`
 * verilirse temizlenir; atlanırsa korunur.
 */
export const updateIntegrationInputSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  token: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional()
})

/** {@link updateIntegrationInputSchema} tip çıkarımı. */
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationInputSchema>
