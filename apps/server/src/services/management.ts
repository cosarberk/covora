/**
 * @module @covora/server/services/management
 *
 * Yönetim (studio) endpoint'lerinin bağımlılık sözleşmeleri ve okuma modelleri.
 * Bağımlılıklar dışarıdan enjekte edilir.
 */

import type { CreateRuleData, PackInput, ProviderInput } from '@covora/db'
import type {
  AuditRecord,
  DashboardSummary,
  ManagementRule,
  Pack,
  ProviderConfig,
  ReviewKind,
  Rule,
  Severity
} from '@covora/types'

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
  /** Makine istemcilerinin review göndermek için kullandığı gizli token. */
  readonly ingestToken: string
}

/** Review geçmişi okuma modeli (sonuç ayrıntısı olmadan özet). */
export interface ReviewRecord {
  readonly id: string
  readonly kind: ReviewKind
  readonly codeHash: string
  readonly score: number
  readonly level: string
  readonly gatePassed: boolean
  /** Önceki aynı tür review'a göre skor farkı (ilk review'da null). */
  readonly delta: number | null
  readonly createdAt: string
}

/** Yönetim endpoint'lerinin bağımlılıkları. */
export interface ManagementDeps {
  /** Projeyi anahtarına göre bulur. */
  readonly findProjectByKey: (key: string) => Promise<{ readonly id: string } | null>
  /** Projeyi oluşturur ya da adını günceller. */
  readonly upsertProject: (key: string, name: string) => Promise<ProjectRecord>
  /** Tüm projeleri listeler. */
  readonly listProjects: () => Promise<readonly ProjectRecord[]>
  /** Bir projeyi anahtarına göre siler. */
  readonly deleteProject: (key: string) => Promise<void>
  /** Projenin abone olduğu pack'lerdeki tüm kuralları yönetim modeli olarak getirir. */
  readonly listRules: (projectId: string) => Promise<readonly ManagementRule[]>
  /** Tüm pack'leri listeler. */
  readonly listPacks: () => Promise<readonly Pack[]>
  /** Projenin abone olduğu pack'leri listeler. */
  readonly listPacksByProject: (projectId: string) => Promise<readonly Pack[]>
  /** Yeni pack oluşturur. */
  readonly createPack: (input: PackInput) => Promise<Pack>
  /** Bir pack'i siler (yerleşik olmayanlar). */
  readonly deletePack: (id: string) => Promise<void>
  /** Bir projeyi bir pack'e abone eder. */
  readonly assignPackToProject: (projectId: string, packId: string) => Promise<void>
  /** Bir projenin bir pack aboneliğini kaldırır. */
  readonly removePackFromProject: (projectId: string, packId: string) => Promise<void>
  /** Bir pack'in kurallarını yönetim modeli olarak getirir. */
  readonly listRulesByPack: (packId: string) => Promise<readonly ManagementRule[]>
  /** Yeni kural oluşturur (audit'li). */
  readonly createRule: (data: CreateRuleData, changedBy: string) => Promise<Rule>
  /** Kuralı günceller (audit'li). */
  readonly updateRule: (ruleId: string, patch: RulePatch, changedBy: string) => Promise<void>
  /** Bir kuralın audit geçmişini getirir. */
  readonly listRuleAudits: (ruleId: string) => Promise<readonly AuditRecord[]>
  /** LLM sağlayıcılarını listeler. */
  readonly listProviders: () => Promise<readonly ProviderConfig[]>
  /** Yeni LLM sağlayıcısı oluşturur. */
  readonly createProvider: (input: ProviderInput) => Promise<ProviderConfig>
  /** Bir sağlayıcıyı aktif yapar (aynı türdeki diğerleri pasifleşir). */
  readonly setActiveProvider: (id: string) => Promise<void>
  /** Bir sağlayıcıyı siler. */
  readonly deleteProvider: (id: string) => Promise<void>
  /** Projenin son review'larını getirir. */
  readonly listRecentReviews: (projectId: string, limit?: number) => Promise<readonly ReviewRecord[]>
  /** Tüm projeler genelinde genel bakış özetini getirir. */
  readonly getDashboard: () => Promise<DashboardSummary>
}
