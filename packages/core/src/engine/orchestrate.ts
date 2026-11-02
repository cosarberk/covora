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

/** {@link evaluateRules} girdileri (coverage/gate hariç değerlendirme adımı). */
export interface EvaluateRulesOptions {
  /** Değerlendirilecek kural kümesi. */
  readonly rules: readonly Rule[]
  /** Review girdisi. */
  readonly input: ReviewInput
  /** LLM-yargı kuralları için sağlayıcı. */
  readonly provider: LlmProvider
  /** Deterministik kurallar için checker kaydı (opsiyonel). */
  readonly checkers?: CheckerRegistry
}

/** Değerlendirme adımının çıktısı: sonuçlar + ilgili (skorlamaya giren) kurallar. */
export interface RuleEvaluation {
  /** Her değerlendirilen kuralın sonucu. */
  readonly results: readonly RuleResult[]
  /** Girdinin `kind`'ıyla eşleşen (coverage ağırlıklandırmasına giren) kurallar. */
  readonly relevantRules: readonly Rule[]
}

/**
 * Review kurallarını değerlendirir (coverage/gate'ten bağımsız adım). Yalnızca
 * girdinin `kind`'ıyla eşleşen kurallar değerlendirilir; deterministik kurallar
 * checker'larla ya da istemci sonucuyla, LLM-yargı kuralları sağlayıcıyla.
 * Blueprint motoru bu adımı ayrı bir node olarak çalıştırır; `runReview` da bunu
 * kullanır (tek kaynak).
 *
 * @param options - Kurallar, girdi, sağlayıcı ve checker kaydı.
 * @returns Kural sonuçları ve skorlamaya giren ilgili kurallar.
 */
export const evaluateRules = async (options: EvaluateRulesOptions): Promise<RuleEvaluation> => {
  const { rules, input, provider, checkers = {} } = options

  // UI review'da ekran tipine göre filtre: `genel` her zaman, diğer surface'ler
  // yalnızca review'ın bildirdiği ekran tipiyle eşleşirse. Ayrıca statik
  // görüntüden doğrulanamayan davranışsal kurallar (visual=false) hiç
  // değerlendirmeye alınmaz — görsel modele gönderilmez, skorlamaya da girmez.
  const surface = input.kind === 'ui' ? (input.surface ?? 'genel') : 'genel'
  const relevantRules = rules.filter((rule) => {
    if (rule.kind !== input.kind) return false
    if (input.kind === 'ui') {
      if (!rule.visual) return false
      if (rule.surface !== 'genel' && rule.surface !== surface) return false
    }
    return true
  })
  const deterministicRules = relevantRules.filter((rule) => rule.evaluation === 'deterministic')
  const llmRules = relevantRules.filter((rule) => rule.evaluation === 'llm')

  const clientResultsById = new Map(
    (input.kind === 'ui' && input.clientResults !== undefined ? input.clientResults : []).map(
      (result) => [result.ruleId, result]
    )
  )

  const deterministicResults = await Promise.all(
    deterministicRules.map(async (rule): Promise<RuleResult> => {
      const checker = checkers[rule.id]
      if (checker !== undefined) {
        return checker(rule, input)
      }
      const clientResult = clientResultsById.get(rule.id)
      if (clientResult !== undefined) {
        return clientResult
      }
      return {
        ruleId: rule.id,
        outcome: 'fail',
        note: 'Deterministik kontrol tanımlı değil'
      }
    })
  )

  const llmResults =
    llmRules.length > 0
      ? (await provider.fillChecklist(input, llmRules.map(toChecklistItem))).results
      : []

  return { results: [...deterministicResults, ...llmResults], relevantRules }
}

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

  const { results, relevantRules } = await evaluateRules({ rules, input, provider, checkers })
  const coverage = computeCoverage(relevantRules, results, config)
  const gate = evaluateGate(coverage, policy)

  return { coverage, gate }
}
