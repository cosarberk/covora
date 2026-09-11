/**
 * @module @covora/core/engine/orchestrate.test
 *
 * `runReview` için birim testleri. Deterministik ve LLM kurallarının doğru
 * ayrıldığını, sonuçların birleşip coverage/gate ürettiğini doğrular.
 */

import type { ChecklistItem, ReviewInput, Rule, RuleResult } from '@covora/types'
import { describe, expect, it, vi } from 'vitest'

import { defaultCoverageConfig } from '../coverage/config.js'
import { runReview, type CheckerRegistry } from './orchestrate.js'
import type { LlmProvider } from './provider.js'

/**
 * Tüm maddeleri `pass` olarak dolduran sahte bir sağlayıcı üretir.
 *
 * @param kind - Sağlayıcının review türü.
 * @returns Sahte {@link LlmProvider}.
 */
const passingProvider = (kind: 'ui' | 'code'): LlmProvider => ({
  kind,
  fillChecklist: vi.fn(
    async (_input: ReviewInput, items: readonly ChecklistItem[]): Promise<readonly RuleResult[]> =>
      items.map((item) => ({ ruleId: item.ruleId, outcome: 'pass' }))
  )
})

const makeRule = (overrides: Partial<Rule> & Pick<Rule, 'id'>): Rule => ({
  title: overrides.id,
  description: '',
  kind: 'ui',
  evaluation: 'llm',
  severity: 'warning',
  weight: 1,
  ...overrides
})

const uiInput: ReviewInput = { kind: 'ui', screenshot: 'data' }

const policy = { minScore: 60, blockOnFailedBlockers: true }

describe('runReview', () => {
  it('LLM kurallarını sağlayıcıya sorar ve coverage üretir', async () => {
    const rules = [makeRule({ id: 'a' }), makeRule({ id: 'b' })]
    const provider = passingProvider('ui')

    const outcome = await runReview({
      rules,
      input: uiInput,
      provider,
      config: defaultCoverageConfig,
      policy
    })

    expect(provider.fillChecklist).toHaveBeenCalledOnce()
    expect(outcome.coverage.score).toBe(100)
    expect(outcome.gate.passed).toBe(true)
  })

  it("girdinin kind'ıyla eşleşmeyen kuralları eler", async () => {
    const rules = [makeRule({ id: 'ui-rule', kind: 'ui' }), makeRule({ id: 'code-rule', kind: 'code' })]
    const provider = passingProvider('ui')

    const outcome = await runReview({
      rules,
      input: uiInput,
      provider,
      config: defaultCoverageConfig,
      policy
    })

    expect(outcome.coverage.ruleResults).toHaveLength(1)
    expect(outcome.coverage.ruleResults[0]?.ruleId).toBe('ui-rule')
  })

  it('deterministik kuralı kayıtlı checker ile değerlendirir', async () => {
    const rules = [makeRule({ id: 'det', evaluation: 'deterministic' })]
    const checkers: CheckerRegistry = {
      det: (rule) => ({ ruleId: rule.id, outcome: 'pass' })
    }
    const provider = passingProvider('ui')

    const outcome = await runReview({
      rules,
      input: uiInput,
      provider,
      config: defaultCoverageConfig,
      policy,
      checkers
    })

    expect(provider.fillChecklist).not.toHaveBeenCalled()
    expect(outcome.coverage.score).toBe(100)
  })

  it('checker tanımsız deterministik kuralı fail sayar', async () => {
    const rules = [makeRule({ id: 'det', evaluation: 'deterministic', severity: 'blocker' })]
    const provider = passingProvider('ui')

    const outcome = await runReview({
      rules,
      input: uiInput,
      provider,
      config: defaultCoverageConfig,
      policy
    })

    expect(outcome.coverage.score).toBe(0)
    expect(outcome.gate.passed).toBe(false)
    expect(outcome.coverage.failedBlockers).toEqual(['det'])
  })
})
