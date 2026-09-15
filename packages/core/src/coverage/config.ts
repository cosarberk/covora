/**
 * @module @covora/core/coverage/config
 *
 * Varsayılan coverage yapılandırması preset'i. Şema sözleşmeleri
 * `@covora/types` içinde tanımlıdır; burası yalnızca makul bir başlangıç
 * değeri sağlar. Üretimde studio/DB'den gelen yapılandırmayla değiştirilir.
 */

import type { CoverageConfig, GatePolicy } from '@covora/types'

/**
 * Makul bir başlangıç yapılandırması. Bir varsayılan preset'tir; çağıran
 * taraf override edebilir.
 */
export const defaultCoverageConfig: CoverageConfig = {
  partialCredit: 0.5,
  levels: [
    { id: 'excellent', minScore: 90 },
    { id: 'good', minScore: 75 },
    { id: 'fair', minScore: 60 },
    { id: 'poor', minScore: 0 }
  ]
}

/**
 * Varsayılan merge gate politikası. Proje kendi politikasını tanımlamadığında
 * kullanılır.
 */
export const defaultGatePolicy: GatePolicy = {
  minScore: 60,
  blockOnFailedBlockers: true
}
