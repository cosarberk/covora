/**
 * @module studio/api/client
 *
 * Covora sunucusunun yönetim uç noktalarını çağıran client.
 */

import type {
  AuditRecord,
  ManagementRule,
  Pack,
  ProviderConfig,
  ReviewKind,
  Rule,
  RuleEvaluationType,
  Severity
} from '@covora/types'

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
}

/** Review geçmişi kaydı. */
export interface ReviewRecord {
  readonly id: string
  readonly kind: ReviewKind
  readonly codeHash: string
  readonly score: number
  readonly level: string
  readonly gatePassed: boolean
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
}

/**
 * Yanıtı kontrol edip JSON gövdesini döndürür.
 *
 * @param response - Fetch yanıtı.
 * @returns Ayrıştırılmış gövde.
 * @throws Yanıt başarısızsa.
 */
const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
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

  return {
    async listProjects() {
      const data = await parseJson<{ projects: ProjectSummary[] }>(await fetch(url('/projects')))
      return data.projects
    },

    async deleteProject(key) {
      const response = await fetch(url(`/projects/${encodeURIComponent(key)}`), { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
      }
    },

    async listProviders() {
      const data = await parseJson<{ providers: ProviderConfig[] }>(await fetch(url('/providers')))
      return data.providers
    },

    async createProvider(input) {
      return parseJson<ProviderConfig>(
        await fetch(url('/providers'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input)
        })
      )
    },

    async activateProvider(id) {
      const response = await fetch(url(`/providers/${encodeURIComponent(id)}/activate`), {
        method: 'POST'
      })
      if (!response.ok) {
        throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
      }
    },

    async deleteProvider(id) {
      const response = await fetch(url(`/providers/${encodeURIComponent(id)}`), { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
      }
    },

    async listRules(projectKey) {
      const data = await parseJson<{ rules: ManagementRule[] }>(
        await fetch(url(`${projectPath(projectKey)}/rules`))
      )
      return data.rules
    },

    async updateRule(ruleId, patch) {
      const response = await fetch(url(`/rules/${encodeURIComponent(ruleId)}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch)
      })
      if (!response.ok) {
        throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
      }
    },

    async listAudits(ruleId) {
      const data = await parseJson<{ audits: AuditRecord[] }>(
        await fetch(url(`/rules/${encodeURIComponent(ruleId)}/audits`))
      )
      return data.audits
    },

    async listReviews(projectKey) {
      const data = await parseJson<{ reviews: ReviewRecord[] }>(
        await fetch(url(`${projectPath(projectKey)}/reviews`))
      )
      return data.reviews
    },

    async upsertProject(key, name) {
      return parseJson<ProjectSummary>(
        await fetch(url('/projects'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, name })
        })
      )
    },

    async listPacks() {
      const data = await parseJson<{ packs: Pack[] }>(await fetch(url('/packs')))
      return data.packs
    },

    async createPack(input) {
      return parseJson<Pack>(
        await fetch(url('/packs'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input)
        })
      )
    },

    async deletePack(id) {
      const response = await fetch(url(`/packs/${encodeURIComponent(id)}`), { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
      }
    },

    async listPackRules(packId) {
      const data = await parseJson<{ rules: ManagementRule[] }>(
        await fetch(url(`/packs/${encodeURIComponent(packId)}/rules`))
      )
      return data.rules
    },

    async createPackRule(packId, input) {
      return parseJson<Rule>(
        await fetch(url(`/packs/${encodeURIComponent(packId)}/rules`), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input)
        })
      )
    },

    async listProjectPacks(projectKey) {
      const data = await parseJson<{ packs: Pack[] }>(
        await fetch(url(`${projectPath(projectKey)}/packs`))
      )
      return data.packs
    },

    async assignPack(projectKey, packId) {
      const response = await fetch(url(`${projectPath(projectKey)}/packs`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId })
      })
      if (!response.ok) {
        throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
      }
    },

    async removePack(projectKey, packId) {
      const response = await fetch(
        url(`${projectPath(projectKey)}/packs/${encodeURIComponent(packId)}`),
        { method: 'DELETE' }
      )
      if (!response.ok) {
        throw new Error(`İstek başarısız: ${response.status} ${response.statusText}`)
      }
    }
  }
}
