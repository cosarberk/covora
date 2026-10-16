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
  ReviewScope,
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

/** Bir sonucu okunur bir etikete çevirir (log için). */
const outcomeLabel = (outcome: RuleResult['outcome']): string =>
  outcome === 'pass' ? 'GEÇTİ' : outcome === 'partial' ? 'KISMİ' : 'KALDI'

/** Bir sonucun log seviyesini belirler: pass→info, partial→warn, fail→warn. */
const outcomeLevel = (outcome: RuleResult['outcome']): 'info' | 'warn' =>
  outcome === 'pass' ? 'info' : 'warn'

/**
 * Deterministik kuralları checker/client sonuçlarıyla çözer. Her kuralın hangi
 * yöntemle (checker / client / tanımsız) ve ne kadar sürede çözüldüğünü, sonucu
 * ve gerekçesini tek tek loglar.
 */
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
      ): Promise<{
        readonly rule: Rule
        readonly result: RuleResult
        readonly method: string
        readonly ms: number
      }> => {
        const startedAt = Date.now()
        const checker = checkers[rule.id]
        if (checker !== undefined) {
          const result = await checker(rule, input)
          return { rule, result, method: 'checker', ms: Date.now() - startedAt }
        }
        const clientResult = clientResultsById.get(rule.id)
        if (clientResult !== undefined) {
          return { rule, result: clientResult, method: 'client (DOM)', ms: Date.now() - startedAt }
        }
        return {
          rule,
          result: { ruleId: rule.id, outcome: 'fail', note: 'Deterministik checker tanımlı değil' },
          method: 'tanımsız',
          ms: Date.now() - startedAt
        }
      }
    )
  )

  for (const entry of resolved) {
    const { rule, result, method, ms } = entry
    await sink.log('debug', `↳ ${rule.title} · yöntem: ${method}`, 'deterministic')
    const reason = result.note !== undefined && result.note.length > 0 ? ` · ${result.note}` : ''
    await sink.log(
      outcomeLevel(result.outcome),
      `${rule.title}: ${outcomeLabel(result.outcome)}${reason} (${ms} ms)`,
      'deterministic'
    )
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
    await sink.log('info', 'Bu türde AI kuralı yok; adım atlandı', 'llm')
    return { results: [], degraded: false }
  }

  const ruleById = new Map(rules.map((rule) => [rule.id, rule]))
  const inputSummary =
    input.kind === 'ui'
      ? `ekran görüntüsü (~${Math.round((input.screenshot.length * 3) / 4 / 1024)} KB)`
      : `${input.files.length} kaynak dosya`
  await sink.log(
    'info',
    `${rules.length} AI kuralı '${provider.kind}' sağlayıcısına checklist olarak gönderiliyor · girdi: ${inputSummary}`,
    'llm'
  )
  for (const rule of rules) {
    await sink.log('debug', `↳ soru: "${rule.title}" — ${rule.description || 'açıklama yok'}`, 'llm')
  }

  const startedAt = Date.now()
  try {
    const { results, trace } = await provider.fillChecklist(input, rules.map(toChecklistItem))
    const ms = Date.now() - startedAt
    // Ham iz (şeffaflık): modele giden tam istem ve modelin döndürdüğü ham yanıt
    // birebir loglanır. "sonuç döndürmedi" gibi durumların gerçek sebebi burada
    // görülür (örn. model ruleId'yi yanlış döndürmüş ya da geçersiz JSON).
    if (trace !== undefined) {
      await sink.log('debug', `Modele gönderilen istem:\n${trace.prompt}`, 'llm')
      await sink.log('debug', `Model ham yanıtı:\n${trace.rawResponse}`, 'llm')
    }
    await sink.log('info', `AI yanıt verdi: ${results.length} sonuç (${(ms / 1000).toFixed(1)} sn)`, 'llm')
    // Ham yanıtın "toparlanmış" (ayrıştırılmış) hali: her maddenin okunur sonucu.
    const summary = results
      .map((result) => {
        const label = ruleById.get(result.ruleId)?.title ?? result.ruleId
        const note = result.note !== undefined && result.note.length > 0 ? ` — ${result.note}` : ''
        return `  • ${label} [${result.ruleId}]: ${outcomeLabel(result.outcome)}${note}`
      })
      .join('\n')
    await sink.log('info', `Ayrıştırılmış sonuç:\n${summary}`, 'llm')
    for (const result of results) {
      const rule = ruleById.get(result.ruleId)
      const label = rule?.title ?? result.ruleId
      const reason = result.note !== undefined && result.note.length > 0 ? ` · ${result.note}` : ''
      await sink.log(
        outcomeLevel(result.outcome),
        `${label}: ${outcomeLabel(result.outcome)}${reason}`,
        'llm'
      )
    }
    return { results: [...results], degraded: false }
  } catch (error) {
    const message = errorMessage(error)
    const ms = Date.now() - startedAt
    await sink.log(
      'error',
      `AI değerlendirmesi başarısız (${(ms / 1000).toFixed(1)} sn): ${message}`,
      'llm'
    )
    await sink.log(
      'warn',
      `Dayanıklılık: ${rules.length} AI kuralı 'KALDI' sayılıyor, run 'degraded' olarak sürüyor`,
      'llm'
    )
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

  // İnceleme kapsamı: tüm depo çekildiyse 'project' (ArchUnit kuralları da koşar),
  // diff/kısmi dosyada 'changes' (proje-geneli kurallar eksik grafikle koşmaz).
  const mode: ReviewScope = input.kind === 'code' ? input.mode ?? 'changes' : 'changes'
  // project modda tüm kurallar; changes modda proje-geneli (ArchUnit) hariç.
  // scope tanımsızsa (eski/dışarıdan kural) güvenli varsayılan: changes.
  const inScope = (rule: Rule): boolean => (mode === 'project' ? true : rule.scope !== 'project')
  const relevantRules = deps.rules.filter((rule) => rule.kind === kind && inScope(rule))
  const skippedProjectRules =
    mode === 'project' ? 0 : deps.rules.filter((rule) => rule.kind === kind && rule.scope === 'project').length
  const deterministicRules = relevantRules.filter((rule) => rule.evaluation === 'deterministic')
  const llmRules = relevantRules.filter((rule) => rule.evaluation === 'llm')

  // 1) ingest
  await sink.stepStarted('ingest')
  const inputDesc =
    input.kind === 'ui'
      ? `UI review · ekran görüntüsü (~${Math.round((input.screenshot.length * 3) / 4 / 1024)} KB)${
          input.clientResults !== undefined ? ` · ${input.clientResults.length} client (DOM) sonucu` : ''
        }`
      : `Code review · ${input.files.length} dosya`
  await sink.log('info', inputDesc, 'ingest')
  await sink.log(
    'info',
    `Kapsam: ${mode === 'project' ? 'proje-geneli (ArchUnit dahil)' : 'değişiklik (changes)'}`,
    'ingest'
  )
  await sink.log(
    'info',
    `${relevantRules.length} kural değerlendirilecek — ${deterministicRules.length} deterministik, ${llmRules.length} AI-yargı`,
    'ingest'
  )
  if (skippedProjectRules > 0) {
    await sink.log(
      'info',
      `${skippedProjectRules} proje-geneli (ArchUnit) kural, changes kapsamında atlandı (tam depo gerekli)`,
      'ingest'
    )
  }
  const totalWeightAll = relevantRules.reduce((sum, rule) => sum + rule.weight, 0)
  for (const rule of relevantRules) {
    await sink.log(
      'debug',
      `• ${rule.title} [${rule.evaluation === 'llm' ? 'AI' : 'deterministik'}] · ağırlık ${rule.weight}${
        rule.severity === 'blocker' ? ' · BLOCKER' : ` · ${rule.severity}`
      }`,
      'ingest'
    )
  }
  await sink.log('info', `Toplam ağırlık: ${totalWeightAll}`, 'ingest')
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
    `Formül: skor = (kazanılan ağırlık / toplam ağırlık) × 100 · kısmi kredi = ${config.partialCredit}`,
    'coverage'
  )
  const ruleWeightById = new Map(relevantRules.map((rule) => [rule.id, rule]))
  for (const rr of coverage.ruleResults) {
    const rule = ruleWeightById.get(rr.ruleId)
    if (rule === undefined) {
      continue
    }
    const credit = rr.outcome === 'pass' ? 1 : rr.outcome === 'partial' ? config.partialCredit : 0
    await sink.log(
      'debug',
      `• ${rule.title}: ${outcomeLabel(rr.outcome)} → ${credit} × ${rule.weight} = ${(credit * rule.weight).toFixed(2)} puan`,
      'coverage'
    )
  }
  await sink.log(
    'info',
    `Kazanılan ${coverage.earnedWeight.toFixed(2)} / Toplam ${coverage.totalWeight.toFixed(2)} → Skor ${coverage.score.toFixed(1)} · seviye ${coverage.level}`,
    'coverage'
  )
  if (coverage.failedBlockers.length > 0) {
    await sink.log(
      'warn',
      `Uyumsuz blocker kural(lar): ${coverage.failedBlockers.join(', ')}`,
      'coverage'
    )
  }
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

  // Gate kararını oluşturan her kontrolü tek tek logla.
  const scoreOk = coverage.score >= policy.minScore
  await sink.log(
    scoreOk ? 'info' : 'warn',
    `1/3 Asgari skor eşiği: ${coverage.score.toFixed(1)} ${scoreOk ? '≥' : '<'} ${policy.minScore} → ${scoreOk ? 'geçti' : 'KALDI'}`,
    'gate'
  )
  if (policy.blockOnFailedBlockers) {
    const blockersOk = coverage.failedBlockers.length === 0
    await sink.log(
      blockersOk ? 'info' : 'warn',
      `2/3 Blocker kontrolü: ${blockersOk ? 'tüm blocker kurallar uyumlu' : `uyumsuz → ${coverage.failedBlockers.join(', ')}`} → ${blockersOk ? 'geçti' : 'KALDI'}`,
      'gate'
    )
  } else {
    await sink.log('debug', '2/3 Blocker kontrolü politikada kapalı → atlandı', 'gate')
  }
  if (delta === null) {
    await sink.log('debug', '3/3 Regresyon kontrolü: ilk run, karşılaştırılacak önceki skor yok → atlandı', 'gate')
  } else if (!policy.blockOnRegression) {
    await sink.log('debug', `3/3 Regresyon kontrolü politikada kapalı · delta ${delta.toFixed(1)} → atlandı`, 'gate')
  } else {
    await sink.log(
      regressed ? 'warn' : 'info',
      `3/3 Regresyon kontrolü: delta ${delta.toFixed(1)} puan (eşik -${policy.regressionThreshold}) → ${regressed ? 'KALDI' : 'geçti'}`,
      'gate'
    )
  }

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
  await sink.log(
    gate.passed ? 'info' : 'warn',
    gate.passed ? 'Gate kararı: GEÇTİ — merge serbest' : `Gate kararı: KALDI — ${gate.reasons.join('; ')}`,
    'gate'
  )
  await sink.stepFinished('gate', 'succeeded')

  const outcome: ReviewOutcome = { coverage, gate }

  // 6) persist
  await sink.stepStarted('persist')
  let reviewId: string
  try {
    reviewId = await deps.persistReview(outcome, delta)
    await sink.log(
      'info',
      `Review kaydedildi: ${reviewId} · ${results.length} kural sonucu, skor ${coverage.score.toFixed(1)}, gate ${gate.passed ? 'GEÇTİ' : 'KALDI'}`,
      'persist'
    )
    if (delta !== null) {
      await sink.log(
        'info',
        `Önceki aynı tür review'a göre skor farkı: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} puan`,
        'persist'
      )
    }
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
    if (deps.notify === undefined) {
      await sink.log('debug', 'Bildirim tetikleyici tanımlı değil; adım boş geçildi', 'notify')
    } else {
      await sink.log(
        'info',
        `Bildirim tetikleniyor${regressed ? ' · REGRESYON işaretli' : ''} (abone webhook'lara ateşle-unut)`,
        'notify'
      )
      deps.notify({ outcome, reviewId, delta, regressed })
    }
    await sink.stepFinished('notify', 'succeeded')
  } catch (error) {
    // Bildirim hatası run'ı etkilemez.
    await sink.log('warn', `Bildirim gönderilemedi: ${errorMessage(error)}`, 'notify')
    await sink.stepFinished('notify', 'failed', errorMessage(error))
  }

  const status: RunStatus = llm.degraded ? 'degraded' : 'succeeded'
  await sink.log(
    status === 'degraded' ? 'warn' : 'info',
    `Pipeline tamamlandı — durum: ${status === 'degraded' ? 'KISMİ (AI adımı başarısız, deterministik sonuç üretildi)' : 'BAŞARILI'} · skor ${coverage.score.toFixed(1)} · gate ${gate.passed ? 'GEÇTİ' : 'KALDI'}`,
    'notify'
  )
  await sink.runFinished(status, { delta })

  return { status, outcome, reviewId, delta }
}
