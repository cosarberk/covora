/**
 * @module @covora/core/engine/orchestrate
 *
 * Review orkestrasyonu. Kuralları değerlendirme tipine göre ayırır:
 * deterministik kurallar kayıtlı checker'larla, LLM-yargı kuralları sağlayıcı
 * üzerinden değerlendirilir. Sonuçlar birleştirilip coverage ve gate
 * hesaplanır.
 */

import type {
  ChecklistItem,
  CoverageConfig,
  GatePolicy,
  ReviewInput,
  ReviewOutcome,
  Rule,
  RuleResult
} from '@covora/types'

import { computeCoverage } from '../coverage/compute.js'
import { evaluateGate } from '../coverage/gate.js'
import type { LlmProvider } from './provider.js'

/**
 * Deterministik bir kuralı review girdisine göre değerlendiren fonksiyon.
 */
export type DeterministicChecker = (
  rule: Rule,
  input: ReviewInput
) => RuleResult | Promise<RuleResult>

/** Kural kimliğinden deterministik checker'a eşleme. */
export type CheckerRegistry = Readonly<Record<string, DeterministicChecker>>

/** {@link runReview} girdileri. */
export interface RunReviewOptions {
  /** Değerlendirilecek kural kümesi. */
  readonly rules: readonly Rule[]
  /** Review girdisi. */
  readonly input: ReviewInput
  /** LLM-yargı kuralları için sağlayıcı. */
  readonly provider: LlmProvider
  /** Coverage yapılandırması. */
  readonly config: CoverageConfig
  /** Merge gate politikası. */
  readonly policy: GatePolicy
  /** Deterministik kurallar için checker kaydı (opsiyonel). */
  readonly checkers?: CheckerRegistry
}

/**
 * Bir kuralı LLM'e sunulacak sade checklist maddesine dönüştürür.
 */
const toChecklistItem = (rule: Rule): ChecklistItem => ({
  ruleId: rule.id,
  title: rule.title,
  description: rule.description
})

/**
 * Review'ı uçtan uca çalıştırır: kuralları değerlendirir, coverage hesaplar ve
 * merge gate kararını üretir. Yalnızca girdinin `kind`'ıyla eşleşen kurallar
 * değerlendirilir.
 *
 * @param options - Kurallar, girdi, sağlayıcı, yapılandırma ve politika.
 * @returns Coverage ve gate kararını içeren review sonucu.
 */
export const runReview = async (options: RunReviewOptions): Promise<ReviewOutcome> => {
  const { rules, input, provider, config, policy, checkers = {} } = options

  const relevantRules = rules.filter((rule) => rule.kind === input.kind)
  const deterministicRules = relevantRules.filter((rule) => rule.evaluation === 'deterministic')
  const llmRules = relevantRules.filter((rule) => rule.evaluation === 'llm')

  const deterministicResults = await Promise.all(
    deterministicRules.map(async (rule): Promise<RuleResult> => {
      const checker = checkers[rule.id]
      if (checker === undefined) {
        return {
          ruleId: rule.id,
          outcome: 'fail',
          note: 'Deterministik kontrol tanımlı değil'
        }
      }
      return checker(rule, input)
    })
  )

  const llmResults =
    llmRules.length > 0 ? await provider.fillChecklist(input, llmRules.map(toChecklistItem)) : []

  const results: RuleResult[] = [...deterministicResults, ...llmResults]
  const coverage = computeCoverage(relevantRules, results, config)
  const gate = evaluateGate(coverage, policy)

  return { coverage, gate }
}
