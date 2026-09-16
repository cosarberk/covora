/**
 * @module studio/api/client
 *
 * Covora sunucusunun yönetim uç noktalarını çağıran client. JWT token'ı
 * localStorage'da saklanır ve her isteğe `Authorization: Bearer` olarak eklenir;
 * 401 alınınca `onUnauthorized` tetiklenir (App oturumu kapatır).
 */

import type {
  AuditRecord,
  CoverageConfig,
  DashboardSummary,
  GatePolicy,
  ManagementRule,
  Pack,
  ProviderConfig,
  ReviewKind,
  Rule,
  RuleEvaluationType,
  Severity,
  User,
  Webhook,
  WebhookEvent
} from '@covora/types'

/** Bir projenin etkin yapılandırması (coverage + gate). */
export interface ProjectConfig {
  readonly coverageConfig: CoverageConfig
  readonly gatePolicy: GatePolicy
}

/** Proje yapılandırması güncelleme girdisi (server şemasıyla uyumlu). */
export interface ProjectConfigInput {
  readonly partialCredit: number
  readonly levels: readonly { readonly id: string; readonly minScore: number }[]
  readonly gateMinScore: number
  readonly gateBlockOnFailedBlockers: boolean
  readonly gateBlockOnRegression: boolean
  readonly regressionThreshold: number
}

/** Studio API yapılandırması. */
export interface StudioApiConfig {
  /** Sunucunun temel adresi. */
  readonly baseUrl: string
}

/** Proje özeti. */
export interface ProjectSummary {
  readonly id: string
  readonly key: string
  readonly name: string
  /** Makine istemcilerinin review göndermek için kullandığı gizli token. */
  readonly ingestToken: string
}

/** Review geçmişi kaydı. */
export interface ReviewRecord {
  readonly id: string
  readonly kind: ReviewKind
  readonly codeHash: string
  readonly score: number
  readonly level: string
  readonly gatePassed: boolean
  readonly delta: number | null
  readonly createdAt: string
}

/** Yeni kural oluşturma girdisi. */
export interface CreateRuleInput {
  readonly key: string
  readonly title: string
  readonly description?: string
  readonly kind: ReviewKind
  readonly evaluation: RuleEvaluationType
  readonly severity: Severity
  readonly weight: number
  readonly prompt?: string | null
}

/** Yeni pack oluşturma girdisi. */
export interface CreatePackInput {
  readonly key: string
  readonly name: string
  readonly description?: string
  readonly kind: ReviewKind
}

/** Yeni webhook oluşturma girdisi. */
export interface CreateWebhookInput {
  readonly url: string
  readonly events: readonly WebhookEvent[]
}

/** Yeni sağlayıcı girdisi. */
export interface CreateProviderInput {
  readonly name: string
  readonly kind: ReviewKind
  readonly baseUrl: string
  readonly model: string
  readonly active?: boolean
}

/** Kural güncelleme girdisi. */
export interface UpdateRuleInput {
  readonly title?: string
  readonly severity?: Severity
  readonly weight?: number
  readonly enabled?: boolean
}

/** Studio API arayüzü. */
export interface StudioApi {
  /** Kayıtlı token var mı (oturum açık kabul edilir). */
  hasSession(): boolean
  /** 401 alındığında çağrılacak geri çağırımı ayarlar. */
  onUnauthorized(handler: () => void): void
  /** Giriş yapar; başarılıysa token'ı saklar ve kullanıcıyı döner. */
  login(email: string, password: string): Promise<User>
  /** Oturumu kapatır (token'ı siler). */
  logout(): void
  /** Mevcut kullanıcıyı doğrular. */
  me(): Promise<User>
  getDashboard(): Promise<DashboardSummary>
  listProjects(): Promise<readonly ProjectSummary[]>
  deleteProject(key: string): Promise<void>
  listProviders(): Promise<readonly ProviderConfig[]>
  createProvider(input: CreateProviderInput): Promise<ProviderConfig>
  activateProvider(id: string): Promise<void>
  deleteProvider(id: string): Promise<void>
  listRules(projectKey: string): Promise<readonly ManagementRule[]>
  updateRule(ruleId: string, patch: UpdateRuleInput): Promise<void>
  listAudits(ruleId: string): Promise<readonly AuditRecord[]>
  listReviews(projectKey: string): Promise<readonly ReviewRecord[]>
  upsertProject(key: string, name: string): Promise<ProjectSummary>
  listPacks(): Promise<readonly Pack[]>
  createPack(input: CreatePackInput): Promise<Pack>
  deletePack(id: string): Promise<void>
  listPackRules(packId: string): Promise<readonly ManagementRule[]>
  createPackRule(packId: string, input: CreateRuleInput): Promise<Rule>
  listProjectPacks(projectKey: string): Promise<readonly Pack[]>
  assignPack(projectKey: string, packId: string): Promise<void>
  removePack(projectKey: string, packId: string): Promise<void>
  listWebhooks(projectKey: string): Promise<readonly Webhook[]>
  createWebhook(projectKey: string, input: CreateWebhookInput): Promise<Webhook>
  setWebhookActive(id: string, active: boolean): Promise<void>
  deleteWebhook(id: string): Promise<void>
  getProjectConfig(projectKey: string): Promise<ProjectConfig>
  updateProjectConfig(projectKey: string, input: ProjectConfigInput): Promise<ProjectConfig>
}

const TOKEN_KEY = 'covora.token'

const readToken = (): string | null => {
  try {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null
  } catch {
    return null
  }
}

/**
 * Bir studio API client'ı oluşturur.
 *
 * @param config - API yapılandırması.
 * @returns {@link StudioApi}.
 */
export const createStudioApi = (config: StudioApiConfig): StudioApi => {
  const url = (path: string): string => `${config.baseUrl}${path}`
  const projectPath = (key: string): string => `/projects/${encodeURIComponent(key)}`

  let token: string | null = readToken()
  let unauthorizedHandler: () => void = () => {}

  const setToken = (value: string | null): void => {
    token = value
    try {
      if (value === null) {
        globalThis.localStorage?.removeItem(TOKEN_KEY)
      } else {
        globalThis.localStorage?.setItem(TOKEN_KEY, value)
      }
    } catch {
      // localStorage erişilemezse token yalnızca bellekte tutulur.
    }
  }

  /** Authorization başlığı ekleyen, 401'de oturum kapatan fetch sarmalayıcısı. */
  const authFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers)
    if (token !== null) {
      headers.set('authorization', `Bearer ${token}`)
    }
    const response = await fetch(url(path), { ...init, headers })
    if (response.status === 401) {
      setToken(null)
      unauthorizedHandler()
      throw new Error('Oturum sona erdi, tekrar giriş yapın')
    }
    return response
  }

  const json = async <T>(response: Response): Promise<T> => {
    if (!response.ok) {
      throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }

  const ok = (response: Response): void => {
    if (!response.ok) {
      throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
    }
  }

  const postJson = (path: string, body: unknown, method = 'POST'): Promise<Response> =>
    authFetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })

  return {
    hasSession() {
      return token !== null
    },

    onUnauthorized(handler) {
      unauthorizedHandler = handler
    },

    async login(email, password) {
      const response = await fetch(url('/auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'E-posta ya da parola hatalı' : 'Giriş başarısız')
      }
      const data = (await response.json()) as { token: string; user: User }
      setToken(data.token)
      return data.user
    },

    logout() {
      setToken(null)
    },

    async me() {
      const data = await json<{ user: User }>(await authFetch('/auth/me'))
      return data.user
    },

    async getDashboard() {
      return json<DashboardSummary>(await authFetch('/dashboard'))
    },

    async listProjects() {
      const data = await json<{ projects: ProjectSummary[] }>(await authFetch('/projects'))
      return data.projects
    },

    async deleteProject(key) {
      ok(await authFetch(projectPath(key), { method: 'DELETE' }))
    },

    async listProviders() {
      const data = await json<{ providers: ProviderConfig[] }>(await authFetch('/providers'))
      return data.providers
    },

    async createProvider(input) {
      return json<ProviderConfig>(await postJson('/providers', input))
    },

    async activateProvider(id) {
      ok(await authFetch(`/providers/${encodeURIComponent(id)}/activate`, { method: 'POST' }))
    },

    async deleteProvider(id) {
      ok(await authFetch(`/providers/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    },

    async listRules(projectKey) {
      const data = await json<{ rules: ManagementRule[] }>(
        await authFetch(`${projectPath(projectKey)}/rules`)
      )
      return data.rules
    },

    async updateRule(ruleId, patch) {
      ok(await postJson(`/rules/${encodeURIComponent(ruleId)}`, patch, 'PATCH'))
    },

    async listAudits(ruleId) {
      const data = await json<{ audits: AuditRecord[] }>(
        await authFetch(`/rules/${encodeURIComponent(ruleId)}/audits`)
      )
      return data.audits
    },

    async listReviews(projectKey) {
      const data = await json<{ reviews: ReviewRecord[] }>(
        await authFetch(`${projectPath(projectKey)}/reviews`)
      )
      return data.reviews
    },

    async upsertProject(key, name) {
      return json<ProjectSummary>(await postJson('/projects', { key, name }))
    },

    async listPacks() {
      const data = await json<{ packs: Pack[] }>(await authFetch('/packs'))
      return data.packs
    },

    async createPack(input) {
      return json<Pack>(await postJson('/packs', input))
    },

    async deletePack(id) {
      ok(await authFetch(`/packs/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    },

    async listPackRules(packId) {
      const data = await json<{ rules: ManagementRule[] }>(
        await authFetch(`/packs/${encodeURIComponent(packId)}/rules`)
      )
      return data.rules
    },

    async createPackRule(packId, input) {
      return json<Rule>(await postJson(`/packs/${encodeURIComponent(packId)}/rules`, input))
    },

    async listProjectPacks(projectKey) {
      const data = await json<{ packs: Pack[] }>(await authFetch(`${projectPath(projectKey)}/packs`))
      return data.packs
    },

    async assignPack(projectKey, packId) {
      ok(await postJson(`${projectPath(projectKey)}/packs`, { packId }))
    },

    async removePack(projectKey, packId) {
      ok(
        await authFetch(`${projectPath(projectKey)}/packs/${encodeURIComponent(packId)}`, {
          method: 'DELETE'
        })
      )
    },

    async listWebhooks(projectKey) {
      const data = await json<{ webhooks: Webhook[] }>(
        await authFetch(`${projectPath(projectKey)}/webhooks`)
      )
      return data.webhooks
    },

    async createWebhook(projectKey, input) {
      return json<Webhook>(await postJson(`${projectPath(projectKey)}/webhooks`, input))
    },

    async setWebhookActive(id, active) {
      ok(await postJson(`/webhooks/${encodeURIComponent(id)}`, { active }, 'PATCH'))
    },

    async deleteWebhook(id) {
      ok(await authFetch(`/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' }))
    },

    async getProjectConfig(projectKey) {
      return json<ProjectConfig>(await authFetch(`${projectPath(projectKey)}/config`))
    },

    async updateProjectConfig(projectKey, input) {
      return json<ProjectConfig>(
        await postJson(`${projectPath(projectKey)}/config`, input, 'PUT')
      )
    }
  }
}
