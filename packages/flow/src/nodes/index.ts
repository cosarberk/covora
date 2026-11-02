/**
 * @module @covora/flow/nodes
 *
 * Yerleşik node türleri. Converter (saf) node'lar servis kullanmaz; domain
 * node'ları metadata'yı burada taşır ama `ctx.services` üzerinden server'ın
 * enjekte ettiği gerçek servisi çağırır. İkisi de aynı defterden (frontend
 * paleti + backend motoru) okunur.
 */

export * from './converters.js'
export * from './domain.js'
export * from './interface.js'
