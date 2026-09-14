/**
 * @module @covora/types/audit
 *
 * Kural değişiklik (audit) kaydı sözleşmesi.
 */

import { z } from 'zod'

/** Bir kural değişikliğinin audit kaydı. */
export const auditRecordSchema = z.object({
  /** Kayıt kimliği. */
  id: z.string().min(1),
  /** İşlem (örn. create/update). */
  action: z.string().min(1),
  /** İşlemi yapan aktör. */
  changedBy: z.string(),
  /** Değişiklik verisi (serbest biçim). */
  changes: z.unknown(),
  /** Oluşturulma zamanı (ISO). */
  createdAt: z.string()
})

/** {@link auditRecordSchema} tip çıkarımı. */
export type AuditRecord = z.infer<typeof auditRecordSchema>
