/**
 * @module @covora/server/services/review.test
 *
 * `createReview` için birim testleri. Tüm bağımlılıklar mock'lanır.
 */

import { defaultCoverageConfig, defaultGatePolicy, type LlmProvider } from '@covora/core'
import type { ChecklistItem, ReviewInput } from '@covora/types'
import { describe, expect, it, vi } from 'vitest'

import { createReview, ProjectNotFoundError, type CreateReviewDeps } from './review.service.js'

const uiInput: ReviewInput = { kind: 'ui', screenshot: 'base64' }

const passingProvider: LlmProvider = {
  kind: 'ui',
  fillChecklist: async (_input, items: readonly ChecklistItem[]) =>
    items.map((item) => ({ ruleId: item.ruleId, outcome: 'pass' as const }))
}

const buildDeps = (): CreateReviewDeps => ({
  findProjectByKey: vi.fn(async () => ({ id: 'p1' })),
  listEnabledRules: vi.fn(async () => [
    {
      id: 'r1',
      title: 'Kural 1',
      description: '',
      kind: 'ui' as const,
      evaluation: 'llm' as const,
      severity: 'warning' as const,
      weight: 1
    }
  ]),
  getEffectiveConfig: vi.fn(async () => ({
    coverageConfig: defaultCoverageConfig,
    gatePolicy: defaultGatePolicy
  })),
  createProvider: vi.fn(async () => passingProvider),
  saveReview: vi.fn(async () => 'review-1')
})

describe('createReview', () => {
  it('uçtan uca review çalıştırır, coverage üretir ve kaydeder', async () => {
    const deps = buildDeps()

    const result = await createReview(deps, {
      projectKey: 'my-plugin',
      input: uiInput,
      codeHash: 'abc123'
    })

    expect(result.reviewId).toBe('review-1')
    expect(result.coverage.score).toBe(100)
    expect(result.gate.passed).toBe(true)
    expect(deps.saveReview).toHaveBeenCalledOnce()
  })

  it('proje bulunamazsa ProjectNotFoundError fırlatır', async () => {
    const deps: CreateReviewDeps = { ...buildDeps(), findProjectByKey: vi.fn(async () => null) }

    await expect(
      createReview(deps, { projectKey: 'yok', input: uiInput, codeHash: 'x' })
    ).rejects.toBeInstanceOf(ProjectNotFoundError)
  })
})
