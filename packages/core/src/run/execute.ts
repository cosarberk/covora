/**
 * @module @covora/core/run/execute
 *
 * Review run yürütücüsü. Bir review'ı gözlemlenebilir adımlara bölerek koşar:
 * her adımın durumunu ve loglarını `sink` üzerinden yayınlar, coverage ve gate
 * kararını üretir, sonucu kalıcılaştırır ve bildirimleri tetikler.
 *
 * Dayanıklılık ilkesi: AI (LLM) adımı başarısız olsa bile run tamamen çökmez.
 * O adım `failed` işaretlenir, ilgili LLM kuralları `fail` sayılır ve run
 * `degraded` olarak tamamlanır — deterministik kısım yine de sonuç üretir.
 */

import type {
  ChecklistItem,
  CoverageConfig,
  GatePolicy,
  ReviewInput,
  ReviewKind,
  ReviewOutcome,
  Rule,
  RuleResult,
  RunStatus
} from '@covora/types'

import { computeCoverage } from '../coverage/compute.js'
import { evaluateGate } from '../coverage/gate.js'
import type { CheckerRegistry, LlmProvider } from '../engine/index.js'
import type { RunSink } from './sink.js'

/** Bir review sonrası bildirim için gereken (sonuç) bilgiler. */
export interface RunNotifyArgs {
  readonly outcome: ReviewOutcome
  readonly reviewId: string
  readonly delta: number | null
  readonly regressed: boolean
}

/** {@link executeReviewRun} bağımlılıkları. */
export interface ReviewRunExecutionDeps {
  /** Değerlendirilecek kural kümesi (proje için etkin kurallar). */
  readonly rules: readonly Rule[]
  /** Review girdisi. */
  readonly input: ReviewInput
  /** LLM-yargı kuralları için sağlayıcı. */
  readonly provider: LlmProvider
  /** Coverage yapılandırması. */
  readonly config: CoverageConfig
  /** Merge gate politikası. */
  readonly policy: GatePolicy
  /** Önceki aynı tür review'ın skoru (regresyon için; yoksa null). */
  readonly previousScore: number | null
  /** Deterministik kurallar için checker kaydı (opsiyonel). */
  readonly checkers?: CheckerRegistry
  /** Olay/log/durum kanalı. */
  readonly sink: RunSink
  /** Sonucu kalıcılaştırır ve kaydedilen review kimliğini döner. */
  readonly persistReview: (outcome: ReviewOutcome, delta: number | null) => Promise<string>
  /** Review tamamlandığında bildirim tetikler (ateşle-unut; opsiyonel). */
  readonly notify?: (args: RunNotifyArgs) => void
}

/** Run yürütmesinin sonucu. */
export interface ReviewRunExecutionResult {
  /** Terminal run durumu. */
  readonly status: RunStatus
  /** Üretilen coverage + gate sonucu (üretildiyse). */
  readonly outcome?: ReviewOutcome
  /** Kaydedilen review kimliği (kalıcılaştırıldıysa). */
  readonly reviewId?: string
  /** Önceki review'a göre skor farkı (ilk review'da null). */
  readonly delta: number | null
  /** Run `failed` olduğunda kök hata özeti. */
  readonly error?: string
}

/** Bir kuralı LLM'e sunulacak sade checklist maddesine dönüştürür. */
const toChecklistItem = (rule: Rule): ChecklistItem => ({
  ruleId: rule.id,
  title: rule.title,
  description: rule.description
})

/** Bir hatadan kısa, okunur bir mesaj çıkarır. */
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Deterministik kuralları checker/client sonuçlarıyla çözer. */
const resolveDeterministic = async (
  rules: readonly Rule[],
  input: ReviewInput,
  checkers: CheckerRegistry,
  sink: RunSink
): Promise<RuleResult[]> => {
  const clientResultsById = new Map(
    (input.kind === 'ui' && input.clientResults !== undefined ? input.clientResults : []).map(
      (result) => [result.ruleId, result]
    )
  )

  // Checker'ları paralel çöz (hız) ama LOG'ları sırayla yaz: log satırı sırası
  // (seq) tek tek üretildiği için eşzamanlı yazım unique çakışmasına yol açar.
  const resolved = await Promise.all(
    rules.map(
      async (
        rule
      ): Promise<{ result: RuleResult; level: 'info' | 'warn'; message: string }> => {
        const checker = checkers[rule.id]
        if (checker !== undefined) {
          const result = await checker(rule, input)
          return { result, level: 'info', message: `${rule.id}: ${result.outcome}` }
        }
        const clientResult = clientResultsById.get(rule.id)
        if (clientResult !== undefined) {
          return {
            result: clientResult,
            level: 'info',
            message: `${rule.id}: ${clientResult.outcome} (client)`
          }
        }
        return {
          result: { ruleId: rule.id, outcome: 'fail', note: 'Deterministik kontrol tanımlı değil' },
          level: 'warn',
          message: `${rule.id}: checker tanımlı değil → fail`
        }
      }
    )
  )

  for (const entry of resolved) {
    await sink.log(entry.level, entry.message, 'deterministic')
  }
  return resolved.map((entry) => entry.result)
}

/**
 * LLM kurallarını sağlayıcıyla değerlendirir. Sağlayıcı patlarsa hata
 * fırlatmak yerine tüm maddeleri `fail` sayar ve `degraded=true` döner; böylece
 * run çökmez.
 */
const resolveLlm = async (
  rules: readonly Rule[],
  input: ReviewInput,
  provider: LlmProvider,
  sink: RunSink
): Promise<{ readonly results: RuleResult[]; readonly degraded: boolean }> => {
  if (rules.length === 0) {
    await sink.log('info', 'Bu türde LLM kuralı yok; adım atlandı', 'llm')
    return { results: [], degraded: false }
  }

  await sink.log('info', `${rules.length} LLM kuralı AI'ya gönderiliyor…`, 'llm')
  try {
    const results = await provider.fillChecklist(input, rules.map(toChecklistItem))
    await sink.log('info', `AI ${results.length} sonuç döndürdü`, 'llm')
    return { results: [...results], degraded: false }
  } catch (error) {
    const message = errorMessage(error)
    await sink.log('error', `AI değerlendirmesi başarısız: ${message}`, 'llm')
    const results = rules.map(
      (rule): RuleResult => ({
        ruleId: rule.id,
        outcome: 'fail',
        note: `AI değerlendirilemedi: ${message}`
      })
    )
    return { results, degraded: true }
  }
}

/**
 * Bir review run'ını uçtan uca yürütür.
 *
 * @param deps - Yürütme bağımlılıkları.
 * @returns Terminal durum, üretilen sonuç ve delta.
 */
export const executeReviewRun = async (
  deps: ReviewRunExecutionDeps
): Promise<ReviewRunExecutionResult> => {
  const { input, provider, config, policy, previousScore, sink } = deps
  const checkers = deps.checkers ?? {}
  const kind: ReviewKind = input.kind

  await sink.runStarted()

  const relevantRules = deps.rules.filter((rule) => rule.kind === kind)
  const deterministicRules = relevantRules.filter((rule) => rule.evaluation === 'deterministic')
  const llmRules = relevantRules.filter((rule) => rule.evaluation === 'llm')

  // 1) ingest
  await sink.stepStarted('ingest')
  await sink.log(
    'info',
    `${kind} review · ${relevantRules.length} kural (${deterministicRules.length} deterministik, ${llmRules.length} AI)`,
    'ingest'
  )
  if (relevantRules.length === 0) {
    await sink.log(
      'warn',
      'Bu proje/tür için etkin kural yok. Projeyi bir kural paketine abone edin; aksi halde coverage 0 ve gate KALDI olur.',
      'ingest'
    )
  }
  await sink.stepFinished('ingest', 'succeeded')

  // 2) deterministic
  await sink.stepStarted('deterministic')
  const deterministicResults = await resolveDeterministic(deterministicRules, input, checkers, sink)
  await sink.stepFinished(
    'deterministic',
    deterministicRules.length === 0 ? 'skipped' : 'succeeded'
  )

  // 3) llm (dayanıklı: patlarsa degraded)
  if (llmRules.length === 0) {
    await sink.stepStarted('llm')
    await sink.log('info', 'Bu türde LLM kuralı yok; adım atlandı', 'llm')
    await sink.stepFinished('llm', 'skipped')
  } else {
    await sink.stepStarted('llm')
  }
  const llm =
    llmRules.length === 0
      ? { results: [] as RuleResult[], degraded: false }
      : await resolveLlm(llmRules, input, provider, sink)
  if (llmRules.length > 0) {
    await sink.stepFinished('llm', llm.degraded ? 'failed' : 'succeeded', llm.degraded ? 'AI değerlendirmesi başarısız' : undefined)
  }

  const results: RuleResult[] = [...deterministicResults, ...llm.results]

  // 4) coverage
  await sink.stepStarted('coverage')
  const coverage = computeCoverage(relevantRules, results, config)
  await sink.log(
    'info',
    `Coverage ${coverage.score.toFixed(1)} · seviye ${coverage.level}`,
    'coverage'
  )
  await sink.stepFinished('coverage', 'succeeded')

  // 5) gate (+ regresyon)
  await sink.stepStarted('gate')
  const rawGate = evaluateGate(coverage, policy)
  const baseGate =
    relevantRules.length === 0
      ? { passed: false, reasons: ['Değerlendirilecek kural yok (proje bir pakete abone değil)'] }
      : rawGate
  const delta = previousScore === null ? null : coverage.score - previousScore
  const regressed = delta !== null && delta <= -policy.regressionThreshold
  const gate =
    regressed && policy.blockOnRegression
      ? {
          passed: false,
          reasons: [
            ...baseGate.reasons,
            `Coverage regresyonu: skor ${(delta as number).toFixed(1)} puan düştü (eşik ${policy.regressionThreshold})`
          ]
        }
      : baseGate
  await sink.log('info', gate.passed ? 'Gate: GEÇTİ' : `Gate: KALDI — ${gate.reasons.join('; ')}`, 'gate')
  await sink.stepFinished('gate', 'succeeded')

  const outcome: ReviewOutcome = { coverage, gate }

  // 6) persist
  await sink.stepStarted('persist')
  let reviewId: string
  try {
    reviewId = await deps.persistReview(outcome, delta)
    await sink.log('info', `Review kaydedildi: ${reviewId}`, 'persist')
    await sink.stepFinished('persist', 'succeeded')
  } catch (error) {
    const message = errorMessage(error)
    await sink.log('error', `Sonuç kaydedilemedi: ${message}`, 'persist')
    await sink.stepFinished('persist', 'failed', message)
    await sink.runFinished('failed', { delta, error: message })
    return { status: 'failed', outcome, delta, error: message }
  }

  // 7) notify (ateşle-unut)
  await sink.stepStarted('notify')
  try {
    deps.notify?.({ outcome, reviewId, delta, regressed })
    await sink.stepFinished('notify', 'succeeded')
  } catch (error) {
    // Bildirim hatası run'ı etkilemez.
    await sink.log('warn', `Bildirim gönderilemedi: ${errorMessage(error)}`, 'notify')
    await sink.stepFinished('notify', 'failed', errorMessage(error))
  }

  const status: RunStatus = llm.degraded ? 'degraded' : 'succeeded'
  await sink.runFinished(status, { delta })

  return { status, outcome, reviewId, delta }
}
