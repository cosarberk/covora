/**
 * @module @covora/types
 *
 * Covora genelinde paylaşılan tip sözleşmeleri ve zod şemaları.
 * Kural tanımları, review girdisi, değerlendirme sonuçları, coverage
 * yapılandırması ve çıktıları burada tek kaynaktan tanımlanır; motor, client
 * ve studio bu paketi kullanır.
 */

export * from './severity.js'
export * from './rule.js'
export * from './pack.js'
export * from './management-rule.js'
export * from './checklist.js'
export * from './coverage.js'
export * from './coverage-config.js'
export * from './review-input.js'
export * from './review.js'
export * from './chat.js'
export * from './audit.js'
export * from './provider.js'
export * from './user.js'
export * from './dashboard.js'
export * from './webhook.js'
