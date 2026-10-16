/**
 * @module @covora/server/services/management
 *
 * Yönetim (studio) endpoint'lerinin bağımlılık sözleşmeleri ve okuma modelleri.
 * Bağımlılıklar dışarıdan enjekte edilir.
 */

import type {
  CreateRuleData,
  CreateWebhookData,
  EffectiveConfig,
  PackInput,
  ProjectConfigInput,
  ProviderInput
} from '@covora/db'
import type {
  AuditRecord,
  CreateIntegrationInput,
  DashboardSummary,
  GitConnectionInput,
  GitProvider,
  Integration,
  ManagementRule,
  Pack,
  ProviderConfig,
  ProviderHealth,
  ReviewKind,
  ReviewOutcome,
  Rule,
  RuleResult,
  Severity,
  UpdateIntegrationInput,
  Webhook
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
  /** Git sağlayıcısı (covora'nın depoyu çekmesi için); yoksa null. */
  readonly gitProvider: GitProvider | null
  /** Depo adresi; yoksa null. */
  readonly gitRepoUrl: string | null
  /** Git erişim jetonu tanımlı mı (değerin kendisi asla dönülmez). */
  readonly hasGitToken: boolean
}

/**
 * Covora'nın depoyu kendisi çekip review'ı kuyruğa alması sonucu. `ok:false`
 * iş kuralı hatasıdır (proje/git yok); clone/çekme hataları ise fırlatılır.
 */
export type PullReviewOutcome =
  | { readonly ok: true; readonly runId: string; readonly queuePosition?: number }
  | { readonly ok: false; readonly reason: 'no-project' | 'no-git' }

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
  /** Projeyi oluşturur ya da adını/git bağlantısını günceller. */
  readonly upsertProject: (
    key: string,
    name: string,
    git?: GitConnectionInput
  ) => Promise<ProjectRecord>
  /** Tüm projeleri listeler. */
  readonly listProjects: () => Promise<readonly ProjectRecord[]>
  /** Bir projeyi anahtarına göre siler. */
  readonly deleteProject: (key: string) => Promise<void>
  /** Projenin ingest token'ını yeniden üretir (rotasyon). */
  readonly rotateIngestToken: (key: string) => Promise<{ readonly ingestToken: string }>
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
  /** Bir sağlayıcının anlık sağlığını kontrol eder. */
  readonly getProviderHealth: (id: string) => Promise<ProviderHealth | null>
  /** Sağlayıcının modelini belleğe önceden yükler (ısıtma). */
  readonly warmProvider: (
    id: string
  ) => Promise<{ readonly supported: boolean; readonly started: boolean } | null>
  /** Sağlayıcının modelini bellekten boşaltır. */
  readonly unloadProvider: (
    id: string
  ) => Promise<{ readonly supported: boolean; readonly started: boolean } | null>
  /** Projenin son review'larını getirir. */
  readonly listRecentReviews: (projectId: string, limit?: number) => Promise<readonly ReviewRecord[]>
  /** Bir review'ın kural bazında sonuçlarını getirir. */
  readonly listReviewResults: (reviewId: string) => Promise<readonly RuleResult[]>
  /** Bir review'ın tam coverage/gate dökümünü getirir (yoksa null). */
  readonly getReviewOutcome: (reviewId: string) => Promise<ReviewOutcome | null>
  /** Tüm projeler genelinde genel bakış özetini getirir. */
  readonly getDashboard: () => Promise<DashboardSummary>
  /** Projenin bildirim webhook'larını listeler. */
  readonly listWebhooks: (projectId: string) => Promise<readonly Webhook[]>
  /** Bir webhook'u kimliğine göre getirir (test gönderimi için). */
  readonly getWebhook: (id: string) => Promise<{ readonly url: string } | null>
  /** Yeni webhook oluşturur. */
  readonly createWebhook: (data: CreateWebhookData) => Promise<Webhook>
  /** Bir webhook'un etkinlik durumunu değiştirir. */
  readonly setWebhookActive: (id: string, active: boolean) => Promise<void>
  /** Bir webhook'u siler. */
  readonly deleteWebhook: (id: string) => Promise<void>
  /** Projenin etkin yapılandırmasını (coverage + gate) getirir. */
  readonly getProjectConfig: (projectId: string) => Promise<EffectiveConfig>
  /** Projenin yapılandırmasını günceller. */
  readonly updateProjectConfig: (
    projectId: string,
    input: ProjectConfigInput
  ) => Promise<EffectiveConfig>
  /** Çalışma-alanı geneli 3. parti bağlantıları (Bağlamalar) listeler. */
  readonly listIntegrations: () => Promise<readonly Integration[]>
  /** Yeni bir bağlantı oluşturur. */
  readonly createIntegration: (input: CreateIntegrationInput) => Promise<Integration>
  /** Bir bağlantıyı kısmi günceller. */
  readonly updateIntegration: (
    id: string,
    patch: UpdateIntegrationInput
  ) => Promise<Integration | null>
  /** Bir bağlantıyı siler. */
  readonly deleteIntegration: (id: string) => Promise<void>
  /**
   * Projenin kayıtlı git bağlantısıyla depoyu çeker ve bir code review'ı kuyruğa
   * alır (dışarıdan dosya push etmeden). Proje/git yoksa `ok:false` döner; çekme
   * hatası fırlatılır.
   */
  readonly pullReview: (key: string, ref?: string) => Promise<PullReviewOutcome>
}
