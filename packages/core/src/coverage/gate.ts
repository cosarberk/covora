/**
 * @module @covora/core/coverage/gate
 *
 * Coverage sonucundan merge gate kararı üretir. Karar deterministiktir ve
 * yalnızca coverage sonucu ile politikaya bağlıdır.
 */

import type { CoverageResult, GateDecision, GatePolicy } from '@covora/types'

/**
 * Coverage sonucunu gate politikasına göre değerlendirir.
 *
 * @param coverage - Hesaplanmış coverage sonucu.
 * @param policy - Uygulanacak gate politikası.
 * @returns Merge'e izin verilip verilmediği ve varsa gerekçeler.
 */
export const evaluateGate = (coverage: CoverageResult, policy: GatePolicy): GateDecision => {
  const reasons: string[] = []

  if (coverage.score < policy.minScore) {
    reasons.push(
      `Coverage skoru (${coverage.score.toFixed(1)}) asgari eşiğin (${policy.minScore}) altında`
    )
  }

  if (policy.blockOnFailedBlockers && coverage.failedBlockers.length > 0) {
    reasons.push(`Uyumsuz blocker kural(lar): ${coverage.failedBlockers.join(', ')}`)
  }

  return {
    passed: reasons.length === 0,
    reasons
  }
}
