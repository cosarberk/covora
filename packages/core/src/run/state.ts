/**
 * @module @covora/core/run/state
 *
 * Run ve adım durum makinesinin saf yardımcıları. Hiçbir I/O içermez; yalnızca
 * geçerli durum geçişlerini ve pipeline iskeletini tanımlar. Persistence ve
 * yayın host (server) tarafındadır.
 */

import {
  TERMINAL_RUN_STATUSES,
  TERMINAL_STEP_STATUSES,
  type RunStatus,
  type RunStepKey,
  type StepStatus
} from '@covora/types'

/** Bir run durumu terminal (artık değişmez) mi. */
export const isTerminalRunStatus = (status: RunStatus): boolean =>
  TERMINAL_RUN_STATUSES.includes(status)

/** Bir adım durumu terminal (artık değişmez) mi. */
export const isTerminalStepStatus = (status: StepStatus): boolean =>
  TERMINAL_STEP_STATUSES.includes(status)

/** Run durumları arasındaki izinli geçişler. */
const RUN_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'degraded', 'failed', 'cancelled'],
  succeeded: [],
  degraded: [],
  failed: [],
  cancelled: []
}

/**
 * Bir run durum geçişinin geçerli olup olmadığını söyler.
 *
 * @param from - Mevcut durum.
 * @param to - Hedef durum.
 * @returns Geçiş izinliyse `true`.
 */
export const canTransitionRun = (from: RunStatus, to: RunStatus): boolean =>
  RUN_TRANSITIONS[from].includes(to)

/**
 * Review pipeline'ının yerleşik adım iskeleti (sıralı). Her review run'ı bu
 * adımlardan geçer; "Süreçler" ekranı ve loglar bu sırayı yansıtır.
 */
export const REVIEW_PIPELINE_STEPS: readonly { readonly key: RunStepKey; readonly name: string }[] =
  [
    { key: 'ingest', name: 'Girdi alındı' },
    { key: 'deterministic', name: 'Deterministik kontroller' },
    { key: 'llm', name: 'AI değerlendirmesi' },
    { key: 'coverage', name: 'Coverage hesabı' },
    { key: 'gate', name: 'Gate kararı' },
    { key: 'persist', name: 'Sonuç kaydı' },
    { key: 'notify', name: 'Bildirimler' }
  ]
