/**
 * @module @covora/server/services/flow-services
 *
 * Blueprint motorunun domain node'larına enjekte edilen {@link FlowServices}
 * implementasyonu: her metot GERÇEK covora servisini çağırır (git kaynağı, kural
 * değerlendirme, coverage, gate, bildirim). Böylece bir blueprint çalıştırmak,
 * review hattını node-granüler koşturmakla aynı sonuçları üretir — dekoratif
 * değil, tek kaynak.
 */

import { computeCoverage, evaluateGate, evaluateRules } from '@covora/core'
import type { CheckerRegistry, LlmProvider } from '@covora/core'
import { findProjectByKey, getEffectiveConfig, listActiveWebhooks, listEnabledRules } from '@covora/db'
import type { PrismaClient } from '@covora/db'
import { gitProviderSchema, type CoverageResult, type ReviewInput, type ReviewKind, type RuleResult } from '@covora/types'
import type { FlowServices } from '@covora/flow'

import { cloneAndCollect, cloneAndCollectDiff, type GitSource } from './git-source.js'

/** {@link createFlowServices} bağımlılıkları. */
export interface FlowServicesDeps {
  readonly prisma: PrismaClient
  /** Review türüne göre LLM sağlayıcı çözer (evaluate node'u için). */
  readonly resolveProvider: (kind: ReviewKind) => Promise<LlmProvider>
  /** Deterministik kurallar için checker kaydı. */
  readonly checkers?: CheckerRegistry
}

const WEBHOOK_TIMEOUT_MS = 5000

/** Review kind param'ını doğrular (yalnızca bilinen türler). */
const asReviewKind = (value: string): ReviewKind => {
  if (value === 'code' || value === 'ui') return value
  throw new Error(`Geçersiz review türü: ${value}`)
}

/** Tek bir webhook'a POST atar; başarıysa true. */
const postWebhook = async (url: string, body: unknown): Promise<boolean> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Projeyi (id + git bağlamı) getirir ya da net hata verir.
 */
const loadProject = async (
  prisma: PrismaClient,
  key: string
): Promise<{
  readonly id: string
  readonly key: string
  readonly name: string
  readonly gitProvider: string | null
  readonly gitRepoUrl: string | null
  readonly gitToken: string | null
}> => {
  const project = await findProjectByKey(prisma, key)
  if (project === null) throw new Error(`Proje bulunamadı: ${key}`)
  return project
}

/**
 * Gerçek covora servislerini saran bir {@link FlowServices} üretir.
 *
 * @param deps - Prisma, sağlayıcı çözücü ve checker kaydı.
 * @returns Blueprint motoruna enjekte edilecek servisler.
 */
export const createFlowServices = (deps: FlowServicesDeps): FlowServices => {
  const { prisma, resolveProvider, checkers } = deps

  return {
    async resolveProject(key) {
      const project = await findProjectByKey(prisma, key)
      return project === null ? null : { key: project.key, name: project.name }
    },

    async pullFiles(key, opts) {
      const project = await loadProject(prisma, key)
      if (project.gitRepoUrl === null || project.gitRepoUrl.length === 0) {
        throw new Error(`Projenin git deposu tanımlı değil: ${key}`)
      }
      const providerParsed = gitProviderSchema.safeParse(project.gitProvider)
      const gitSource: GitSource = {
        provider: providerParsed.success ? providerParsed.data : null,
        repoUrl: project.gitRepoUrl,
        token: project.gitToken
      }
      if (opts.mode === 'changes') {
        if (opts.base === undefined || opts.head === undefined) {
          throw new Error('changes kapsamı için base ve head gerekli')
        }
        const result = await cloneAndCollectDiff(gitSource, { base: opts.base, head: opts.head })
        return {
          mode: 'changes',
          base: result.baseSha,
          head: result.headSha,
          ref: result.branch,
          count: result.files.length,
          files: result.files
        }
      }
      const result = await cloneAndCollect(gitSource, opts.ref !== undefined ? { ref: opts.ref } : {})
      return {
        mode: 'project',
        base: '',
        head: result.commitSha,
        ref: result.branch,
        count: result.files.length,
        files: result.files
      }
    },

    async evaluate(key, opts) {
      const kind = asReviewKind(opts.kind)
      if (kind !== 'code') {
        throw new Error('Blueprint değerlendirmesi şimdilik yalnızca "code" türünü destekler')
      }
      const project = await loadProject(prisma, key)
      const files = Array.isArray(opts.files) ? opts.files : []
      const input = { kind: 'code', files, mode: 'project' } as unknown as ReviewInput
      const [rules, provider] = await Promise.all([
        listEnabledRules(prisma, project.id, kind),
        resolveProvider(kind)
      ])
      const { results } = await evaluateRules({
        rules,
        input,
        provider,
        ...(checkers !== undefined ? { checkers } : {})
      })
      const normalized = results.map((r) => ({ ruleId: r.ruleId, outcome: r.outcome, note: r.note ?? '' }))
      return { results: normalized, total: normalized.length }
    },

    async scoreCoverage(key, opts) {
      const kind = asReviewKind(opts.kind)
      const project = await loadProject(prisma, key)
      const [rules, config] = await Promise.all([
        listEnabledRules(prisma, project.id, kind),
        getEffectiveConfig(prisma, project.id)
      ])
      const results = ((opts.ruleResults as { results?: unknown } | null)?.results ?? []) as RuleResult[]
      const coverage = computeCoverage(rules, results, config.coverageConfig)
      // Tam CoverageResult döner (failedBlockers dahil); gate node'u bunu kullanır.
      return coverage
    },

    async evaluateGate(key, coverage) {
      const project = await loadProject(prisma, key)
      const config = await getEffectiveConfig(prisma, project.id)
      const gate = evaluateGate(coverage as CoverageResult, config.gatePolicy)
      return { passed: gate.passed, reasons: gate.reasons }
    },

    async notify(key, gate) {
      const project = await loadProject(prisma, key)
      const decision = gate as { passed: boolean; reasons: readonly string[] }
      const webhooks = await listActiveWebhooks(prisma, project.id)
      const wanted = decision.passed ? 'review_completed' : 'gate_failed'
      const targets = webhooks.filter(
        (w) => w.events.includes(wanted) || w.events.includes('review_completed')
      )
      const summary = `[Covora Blueprint] ${project.key}: Gate ${decision.passed ? 'GEÇTİ ✅' : 'KALDI ❌'}${
        decision.reasons.length > 0 ? ` — ${decision.reasons.join('; ')}` : ''
      }`
      const body = {
        text: summary,
        content: summary,
        event: 'blueprint_gate',
        projectKey: project.key,
        gatePassed: decision.passed,
        reasons: decision.reasons,
        timestamp: new Date().toISOString()
      }
      const outcomes = await Promise.all(targets.map((t) => postWebhook(t.url, body)))
      const delivered = outcomes.filter((ok) => ok).length
      return { delivered, failed: outcomes.length - delivered }
    }
  }
}
