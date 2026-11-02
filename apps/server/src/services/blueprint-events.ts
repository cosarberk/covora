/**
 * @module @covora/server/services/blueprint-events
 *
 * Blueprint run olayları için süreç-içi yayın/abone veri yolu. Motor node
 * ilerledikçe olayları buraya yayınlar; SSE bağlantıları ilgili run'a abone olup
 * canlı akıtır (node yanması gerçek). Review olay yolundan ayrıdır çünkü olaylar
 * node-granülerdir. Tek sunucu için yeterli; yatay ölçekte Redis köprüsü takılır.
 */

import type {
  BlueprintNodeRunDTO,
  BlueprintRunDetail,
  BlueprintRunLogLine
} from '@covora/db'
import type { RunStatus } from '@covora/types'

/** Blueprint run canlı olayı (SSE ile akıtılır). */
export type BlueprintRunEvent =
  | { readonly type: 'bp.run.snapshot'; readonly run: BlueprintRunDetail; readonly logs: readonly BlueprintRunLogLine[] }
  | { readonly type: 'bp.run.updated'; readonly runId: string; readonly status: RunStatus; readonly at: string }
  | { readonly type: 'bp.node.updated'; readonly runId: string; readonly node: BlueprintNodeRunDTO }
  | { readonly type: 'bp.log.appended'; readonly runId: string; readonly line: BlueprintRunLogLine }
  | {
      readonly type: 'bp.run.finished'
      readonly runId: string
      readonly status: RunStatus
      readonly at: string
      readonly error?: string
    }

/** Aboneliği sonlandıran fonksiyon. */
export type Unsubscribe = () => void

/** Blueprint run olay veri yolu. */
export interface BlueprintEventBus {
  publish(event: BlueprintRunEvent): void
  subscribe(runId: string, listener: (event: BlueprintRunEvent) => void): Unsubscribe
}

/** Olayın ait olduğu run kimliğini çıkarır. */
const runIdOf = (event: BlueprintRunEvent): string =>
  event.type === 'bp.run.snapshot' ? event.run.id : event.runId

/**
 * Süreç-içi bir {@link BlueprintEventBus} oluşturur.
 *
 * @returns Yeni veri yolu.
 */
export const createBlueprintEventBus = (): BlueprintEventBus => {
  const listeners = new Map<string, Set<(event: BlueprintRunEvent) => void>>()

  return {
    publish(event) {
      const set = listeners.get(runIdOf(event))
      if (set === undefined) return
      for (const listener of [...set]) {
        try {
          listener(event)
        } catch {
          // Tek abonenin hatası diğerlerini etkilemez.
        }
      }
    },

    subscribe(runId, listener) {
      const set = listeners.get(runId) ?? new Set()
      set.add(listener)
      listeners.set(runId, set)
      return () => {
        const current = listeners.get(runId)
        if (current === undefined) return
        current.delete(listener)
        if (current.size === 0) listeners.delete(runId)
      }
    }
  }
}
