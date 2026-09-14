/**
 * @module @covora/server/services/management
 *
 * Yönetim (studio) endpoint'lerinin bağımlılık sözleşmeleri ve okuma modelleri.
 * Bağımlılıklar dışarıdan enjekte edilir.
 */

import type { CreateRuleData } from '@covora/db'
import type { ManagementRule, ReviewKind, Rule, Severity } from '@covora/types'

/** Bir kural güncellemesinde değiştirilebilir alanlar. */
export interface RulePatch {
  readonly title?: string
  readonly description?: string
  readonly severity?: Severity
  readonly weight?: number
  readonly prompt?: string | null
  readonly enabled?: boolean
}

/** Proje okuma modeli. */
export interface ProjectRecord {
  readonly id: string
  readonly key: string
  readonly name: string
}

/** Review geçmişi okuma modeli (sonuç ayrıntısı olmadan özet). */
export interface ReviewRecord {
  readonly id: string
  readonly kind: ReviewKind
  readonly codeHash: string
  readonly score: number
  readonly level: string
  readonly gatePassed: boolean
  readonly createdAt: string
}

/** Yönetim endpoint'lerinin bağımlılıkları. */
export interface ManagementDeps {
  /** Projeyi anahtarına göre bulur. */
  readonly findProjectByKey: (key: string) => Promise<{ readonly id: string } | null>
  /** Projeyi oluşturur ya da adını günceller. */
  readonly upsertProject: (key: string, name: string) => Promise<ProjectRecord>
  /** Projenin (ve global) tüm kurallarını yönetim modeli olarak getirir. */
  readonly listRules: (projectId: string) => Promise<readonly ManagementRule[]>
  /** Yeni kural oluşturur (audit'li). */
  readonly createRule: (data: CreateRuleData, changedBy: string) => Promise<Rule>
  /** Kuralı günceller (audit'li). */
  readonly updateRule: (ruleId: string, patch: RulePatch, changedBy: string) => Promise<void>
  /** Projenin son review'larını getirir. */
  readonly listRecentReviews: (projectId: string, limit?: number) => Promise<readonly ReviewRecord[]>
}
