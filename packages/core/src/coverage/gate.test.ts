/**
 * @module @covora/core/coverage/gate.test
 *
 * `evaluateGate` için birim testleri.
 */

import type { CoverageResult, GatePolicy } from '@covora/types'
import { describe, expect, it } from 'vitest'

import { evaluateGate } from './gate.js'

/**
 * Test için varsayılanları olan bir coverage sonucu üretir.
 *
 * @param overrides - Üzerine yazılacak alanlar.
 * @returns Tam bir {@link CoverageResult} nesnesi.
 */
const makeCoverage = (overrides: Partial<CoverageResult> = {}): CoverageResult => ({
  score: 100,
  level: 'excellent',
  totalWeight: 1,
  earnedWeight: 1,
  ruleResults: [],
  failedBlockers: [],
  ...overrides
})

const policy: GatePolicy = {
  minScore: 60,
  blockOnFailedBlockers: true,
  blockOnRegression: false,
  regressionThreshold: 5
}

describe('evaluateGate', () => {
  it('skor eşiğin üstünde ve blocker yoksa geçer', () => {
    const decision = evaluateGate(makeCoverage({ score: 80 }), policy)

    expect(decision.passed).toBe(true)
    expect(decision.reasons).toEqual([])
  })

  it('skor eşiğin altındaysa geçmez ve gerekçe verir', () => {
    const decision = evaluateGate(makeCoverage({ score: 40 }), policy)

    expect(decision.passed).toBe(false)
    expect(decision.reasons).toHaveLength(1)
    expect(decision.reasons[0]).toContain('40')
  })

  it('uyumsuz blocker varsa ve politika blokluyorsa geçmez', () => {
    const decision = evaluateGate(
      makeCoverage({ score: 95, failedBlockers: ['a'] }),
      policy
    )

    expect(decision.passed).toBe(false)
    expect(decision.reasons[0]).toContain('a')
  })

  it('blockOnFailedBlockers false ise blocker varsa bile skor yeterse geçer', () => {
    const decision = evaluateGate(makeCoverage({ score: 95, failedBlockers: ['a'] }), {
      minScore: 60,
      blockOnFailedBlockers: false,
      blockOnRegression: false,
      regressionThreshold: 5
    })

    expect(decision.passed).toBe(true)
  })

  it('hem skor düşük hem blocker fail ise iki gerekçe döner', () => {
    const decision = evaluateGate(
      makeCoverage({ score: 30, failedBlockers: ['a', 'b'] }),
      policy
    )

    expect(decision.passed).toBe(false)
    expect(decision.reasons).toHaveLength(2)
  })
})
