/**
 * @module @covora/core/coverage/compute.test
 *
 * `computeCoverage` için birim testleri. Coverage algoritmasının deterministik
 * ve yapılandırmaya bağlı olduğunu doğrular.
 */

import type { CoverageConfig, Rule, RuleResult } from '@covora/types'
import { describe, expect, it } from 'vitest'

import { computeCoverage } from './compute.js'
import { defaultCoverageConfig } from './config.js'

/**
 * Test için varsayılanları olan bir kural üretir.
 *
 * @param overrides - Üzerine yazılacak alanlar.
 * @returns Tam bir {@link Rule} nesnesi.
 */
const makeRule = (overrides: Partial<Rule> & Pick<Rule, 'id'>): Rule => ({
  title: overrides.id,
  description: '',
  kind: 'ui',
  evaluation: 'llm',
  severity: 'warning',
  weight: 1,
  ...overrides
})

const config: CoverageConfig = defaultCoverageConfig

describe('computeCoverage', () => {
  it('tüm kurallar pass ise 100 puan ve en üst seviye döner', () => {
    const rules = [makeRule({ id: 'a', weight: 2 }), makeRule({ id: 'b', weight: 3 })]
    const results: RuleResult[] = [
      { ruleId: 'a', outcome: 'pass' },
      { ruleId: 'b', outcome: 'pass' }
    ]

    const coverage = computeCoverage(rules, results, config)

    expect(coverage.score).toBe(100)
    expect(coverage.level).toBe('excellent')
    expect(coverage.earnedWeight).toBe(5)
    expect(coverage.totalWeight).toBe(5)
    expect(coverage.failedBlockers).toEqual([])
  })

  it('ağırlıklı ortalamayı doğru hesaplar', () => {
    const rules = [makeRule({ id: 'a', weight: 1 }), makeRule({ id: 'b', weight: 3 })]
    const results: RuleResult[] = [
      { ruleId: 'a', outcome: 'pass' },
      { ruleId: 'b', outcome: 'fail' }
    ]

    const coverage = computeCoverage(rules, results, config)

    // Kazanılan 1 / toplam 4 = %25
    expect(coverage.score).toBe(25)
    expect(coverage.level).toBe('poor')
  })

  it('partial sonucuna yapılandırmadaki krediyi uygular', () => {
    const rules = [makeRule({ id: 'a', weight: 1 })]
    const results: RuleResult[] = [{ ruleId: 'a', outcome: 'partial' }]

    const coverage = computeCoverage(rules, results, { ...config, partialCredit: 0.5 })

    expect(coverage.score).toBe(50)
  })

  it('sonucu verilmeyen kuralı fail sayar', () => {
    const rules = [makeRule({ id: 'a', weight: 1 }), makeRule({ id: 'b', weight: 1 })]
    const results: RuleResult[] = [{ ruleId: 'a', outcome: 'pass' }]

    const coverage = computeCoverage(rules, results, config)

    expect(coverage.score).toBe(50)
    expect(coverage.ruleResults).toHaveLength(2)
    expect(coverage.ruleResults.find((r) => r.ruleId === 'b')?.outcome).toBe('fail')
  })

  it('fail olan blocker kuralı failedBlockers listesine ekler', () => {
    const rules = [
      makeRule({ id: 'a', severity: 'blocker' }),
      makeRule({ id: 'b', severity: 'warning' })
    ]
    const results: RuleResult[] = [
      { ruleId: 'a', outcome: 'fail' },
      { ruleId: 'b', outcome: 'fail' }
    ]

    const coverage = computeCoverage(rules, results, config)

    expect(coverage.failedBlockers).toEqual(['a'])
  })

  it('kural yoksa 0 puan döner ve çökmez', () => {
    const coverage = computeCoverage([], [], config)

    expect(coverage.score).toBe(0)
    expect(coverage.totalWeight).toBe(0)
    expect(coverage.failedBlockers).toEqual([])
  })
})
