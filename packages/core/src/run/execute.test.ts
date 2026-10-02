/**
 * @module @covora/core/run/execute.test
 */

import type {
  ChecklistItem,
  LogLevel,
  ReviewInput,
  Rule,
  RuleResult,
  RunStatus,
  StepStatus
} from '@covora/types'
import { describe, expect, it, vi } from 'vitest'

import type { LlmProvider } from '../engine/index.js'
import { executeReviewRun, type ReviewRunExecutionDeps } from './execute.js'
import type { RunSink } from './sink.js'

/** Çağrıları kaydeden sahte sink. */
const makeRecordingSink = (): {
  readonly sink: RunSink
  readonly steps: { key: string; status: StepStatus; error?: string }[]
  readonly logs: { level: LogLevel; message: string; stepKey?: string }[]
  readonly finished: { status: RunStatus; delta: number | null; error?: string }[]
  started: boolean
} => {
  const steps: { key: string; status: StepStatus; error?: string }[] = []
  const logs: { level: LogLevel; message: string; stepKey?: string }[] = []
  const finished: { status: RunStatus; delta: number | null; error?: string }[] = []
  const state = { started: false }

  const sink: RunSink = {
    runStarted: async () => {
      state.started = true
    },
    stepStarted: async () => {},
    stepFinished: async (key, status, error) => {
      steps.push(error !== undefined ? { key, status, error } : { key, status })
    },
    log: async (level, message, stepKey) => {
      logs.push(stepKey !== undefined ? { level, message, stepKey } : { level, message })
    },
    runFinished: async (status, patch) => {
      finished.push(
        patch.error !== undefined
          ? { status, delta: patch.delta, error: patch.error }
          : { status, delta: patch.delta }
      )
    }
  }

  return {
    sink,
    steps,
    logs,
    finished,
    get started() {
      return state.started
    }
  }
}

const uiRule = (id: string, evaluation: 'deterministic' | 'llm'): Rule => ({
  id,
  title: id,
  description: '',
  kind: 'ui',
  evaluation,
  severity: 'warning',
  weight: 1
})

const uiInput: ReviewInput = { kind: 'ui', screenshot: 'data:image/png;base64,xx' }

const baseDeps = (
  overrides: Partial<ReviewRunExecutionDeps>
): ReviewRunExecutionDeps => ({
  rules: [],
  input: uiInput,
  provider: { kind: 'ui', fillChecklist: async () => [] },
  config: { partialCredit: 0.5, levels: [{ id: 'poor', minScore: 0 }] },
  policy: {
    minScore: 60,
    blockOnFailedBlockers: true,
    blockOnRegression: false,
    regressionThreshold: 5
  },
  previousScore: null,
  sink: makeRecordingSink().sink,
  persistReview: async () => 'review-1',
  ...overrides
})

describe('executeReviewRun', () => {
  it('mutlu yol: deterministik + AI başarılı → succeeded, kaydedilir, bildirilir', async () => {
    const rec = makeRecordingSink()
    const notify = vi.fn()
    const persistReview = vi.fn(async () => 'rev-42')
    const provider: LlmProvider = {
      kind: 'ui',
      fillChecklist: async (_input: ReviewInput, items: readonly ChecklistItem[]) =>
        items.map((item): RuleResult => ({ ruleId: item.ruleId, outcome: 'pass' }))
    }

    const result = await executeReviewRun(
      baseDeps({
        rules: [uiRule('det-1', 'deterministic'), uiRule('ai-1', 'llm')],
        provider,
        sink: rec.sink,
        persistReview,
        notify,
        checkers: {
          'det-1': (rule) => ({ ruleId: rule.id, outcome: 'pass' })
        }
      })
    )

    expect(result.status).toBe('succeeded')
    expect(result.reviewId).toBe('rev-42')
    expect(result.outcome?.coverage.score).toBe(100)
    expect(persistReview).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledOnce()
    expect(rec.started).toBe(true)
    expect(rec.finished).toEqual([{ status: 'succeeded', delta: null }])
    // Tüm adımlar başarıyla bitti.
    expect(rec.steps.map((s) => s.status)).toEqual([
      'succeeded', // ingest
      'succeeded', // deterministic
      'succeeded', // llm
      'succeeded', // coverage
      'succeeded', // gate
      'succeeded', // persist
      'succeeded' // notify
    ])
  })

  it('AI patlarsa → degraded; LLM kuralı fail sayılır ama run yine sonuç üretir', async () => {
    const rec = makeRecordingSink()
    const provider: LlmProvider = {
      kind: 'ui',
      fillChecklist: async () => {
        throw new Error('Connect Timeout')
      }
    }

    const result = await executeReviewRun(
      baseDeps({
        rules: [uiRule('det-1', 'deterministic'), uiRule('ai-1', 'llm')],
        provider,
        sink: rec.sink,
        checkers: { 'det-1': (rule) => ({ ruleId: rule.id, outcome: 'pass' }) }
      })
    )

    expect(result.status).toBe('degraded')
    expect(result.outcome).toBeDefined()
    // det-1 pass (ağırlık 1), ai-1 fail (ağırlık 1) → %50
    expect(result.outcome?.coverage.score).toBe(50)
    const llmStep = rec.steps.find((s) => s.key === 'llm')
    expect(llmStep?.status).toBe('failed')
    expect(rec.finished[0]?.status).toBe('degraded')
    expect(rec.logs.some((l) => l.level === 'error' && l.stepKey === 'llm')).toBe(true)
  })

  it('LLM kuralı yoksa → llm adımı skipped', async () => {
    const rec = makeRecordingSink()
    const result = await executeReviewRun(
      baseDeps({
        rules: [uiRule('det-1', 'deterministic')],
        sink: rec.sink,
        checkers: { 'det-1': (rule) => ({ ruleId: rule.id, outcome: 'pass' }) }
      })
    )

    expect(result.status).toBe('succeeded')
    expect(rec.steps.find((s) => s.key === 'llm')?.status).toBe('skipped')
  })

  it('persist patlarsa → failed ve hata taşınır', async () => {
    const rec = makeRecordingSink()
    const result = await executeReviewRun(
      baseDeps({
        rules: [uiRule('det-1', 'deterministic')],
        sink: rec.sink,
        checkers: { 'det-1': (rule) => ({ ruleId: rule.id, outcome: 'pass' }) },
        persistReview: async () => {
          throw new Error('DB down')
        }
      })
    )

    expect(result.status).toBe('failed')
    expect(result.error).toContain('DB down')
    expect(rec.finished[0]).toEqual({ status: 'failed', delta: null, error: 'DB down' })
  })

  it('regresyon eşiği aşılıp politika açıkken gate bloklanır', async () => {
    const rec = makeRecordingSink()
    const result = await executeReviewRun(
      baseDeps({
        rules: [uiRule('det-1', 'deterministic')],
        sink: rec.sink,
        checkers: { 'det-1': (rule) => ({ ruleId: rule.id, outcome: 'fail' }) },
        previousScore: 100,
        policy: {
          minScore: 0,
          blockOnFailedBlockers: false,
          blockOnRegression: true,
          regressionThreshold: 5
        }
      })
    )

    expect(result.delta).toBe(-100)
    expect(result.outcome?.gate.passed).toBe(false)
    expect(result.outcome?.gate.reasons.some((r) => r.includes('regresyon'))).toBe(true)
  })

  it('değerlendirilecek kural yoksa → gate "kural yok" gerekçesiyle kalır', async () => {
    const rec = makeRecordingSink()
    const result = await executeReviewRun(baseDeps({ rules: [], sink: rec.sink }))

    expect(result.status).toBe('succeeded')
    expect(result.outcome?.coverage.score).toBe(0)
    expect(result.outcome?.gate.passed).toBe(false)
    expect(result.outcome?.gate.reasons.some((r) => r.includes('kural yok'))).toBe(true)
    expect(rec.logs.some((l) => l.level === 'warn' && l.stepKey === 'ingest')).toBe(true)
  })
})
