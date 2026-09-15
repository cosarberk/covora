/**
 * @module @covora/core/coverage/compute
 *
 * Deterministik coverage hesaplama. LLM bu hesaba dahil değildir; yalnızca
 * kural sonuçları (pass/partial/fail) girdi olarak kullanılır.
 */

import type {
  ChecklistOutcome,
  CoverageConfig,
  CoverageResult,
  Rule,
  RuleResult
} from '@covora/types'

/**
 * Bir değerlendirme sonucunun kredi katsayısını döndürür.
 *
 * @param outcome - Kural sonucu.
 * @param partialCredit - `partial` sonucuna verilecek kredi (0-1).
 * @returns pass için 1, partial için `partialCredit`, fail için 0.
 */
const creditFor = (outcome: ChecklistOutcome, partialCredit: number): number => {
  switch (outcome) {
    case 'pass':
      return 1
    case 'partial':
      return partialCredit
    case 'fail':
      return 0
  }
}

/**
 * Skora karşılık gelen seviye kimliğini, eşikleri azalan sırada değerlendirerek
 * bulur.
 *
 * @param score - Hesaplanan yüzdelik skor.
 * @param config - Coverage yapılandırması.
 * @returns Eşleşen seviyenin kimliği.
 */
const resolveLevel = (score: number, config: CoverageConfig): string => {
  const sorted = [...config.levels].sort((a, b) => b.minScore - a.minScore)
  const match = sorted.find((level) => score >= level.minScore)
  // Eşikler arasında tabanı en düşük olan son çare olarak kullanılır.
  return (match ?? sorted[sorted.length - 1]!).id
}

/**
 * Kural ağırlıkları ve değerlendirme sonuçlarından deterministik coverage
 * hesaplar. Bir kural için sonuç bulunmuyorsa `fail` kabul edilir.
 *
 * @param rules - Değerlendirilen kural kümesi.
 * @param results - Her kural için değerlendirme sonucu.
 * @param config - Coverage yapılandırması (kısmi kredi + seviye eşikleri).
 * @returns Skor, seviye ve ağırlık dökümünü içeren coverage sonucu.
 */
export const computeCoverage = (
  rules: readonly Rule[],
  results: readonly RuleResult[],
  config: CoverageConfig
): CoverageResult => {
  const resultByRuleId = new Map(results.map((result) => [result.ruleId, result]))

  let totalWeight = 0
  let earnedWeight = 0
  const failedBlockers: string[] = []
  const ruleResults: RuleResult[] = []

  for (const rule of rules) {
    const result = resultByRuleId.get(rule.id)
    const outcome: ChecklistOutcome = result?.outcome ?? 'fail'

    totalWeight += rule.weight
    earnedWeight += rule.weight * creditFor(outcome, config.partialCredit)

    if (rule.severity === 'blocker' && outcome === 'fail') {
      failedBlockers.push(rule.id)
    }

    ruleResults.push(
      result?.note !== undefined
        ? { ruleId: rule.id, outcome, note: result.note }
        : { ruleId: rule.id, outcome }
    )
  }

  const score = totalWeight === 0 ? 0 : (earnedWeight / totalWeight) * 100

  return {
    score,
    level: resolveLevel(score, config),
    totalWeight,
    earnedWeight,
    ruleResults,
    failedBlockers
  }
}
