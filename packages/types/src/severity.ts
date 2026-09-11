/**
 * @module @covora/types/severity
 *
 * Kural önem dereceleri.
 */

import { z } from 'zod'

/**
 * Bir kuralın önem derecesi. Yalnızca `blocker` ihlali merge'ü durdurabilir;
 * `warning` ve `info` coverage skorunu etkiler ama tek başına bloklamaz.
 */
export const severitySchema = z.enum(['blocker', 'warning', 'info'])

/** {@link severitySchema} tip çıkarımı. */
export type Severity = z.infer<typeof severitySchema>
