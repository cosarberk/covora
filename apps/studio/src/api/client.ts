/**
 * @module studio/api/client
 *
 * Covora sunucusunun yönetim uç noktalarını çağıran client.
 */

import type {
  AuditRecord,
  ManagementRule,
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
  listRules(projectKey: string): Promise<readonly ManagementRule[]>
  createRule(projectKey: string, input: CreateRuleInput): Promise<Rule>
  updateRule(ruleId: string, patch: UpdateRuleInput): Promise<void>
  listAudits(ruleId: string): Promise<readonly AuditRecord[]>
  listReviews(projectKey: string): Promise<readonly ReviewRecord[]>
  upsertProject(key: string, name: string): Promise<ProjectSummary>
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

    async listRules(projectKey) {
      const data = await parseJson<{ rules: ManagementRule[] }>(
        await fetch(url(`${projectPath(projectKey)}/rules`))
      )
      return data.rules
    },

    async createRule(projectKey, input) {
      return parseJson<Rule>(
        await fetch(url(`${projectPath(projectKey)}/rules`), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input)
        })
      )
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
    }
  }
}
