/**
 * @module @covora/server/services/events
 *
 * Run olayları için süreç-içi yayın/abone (pub/sub) veri yolu. Worker ve sink
 * olayları buraya yayınlar; SSE bağlantıları ilgili run'a abone olup canlı
 * akıtır. Tek sunucu örneği için yeterlidir; yatay ölçekte buraya bir Redis
 * pub/sub köprüsü takılabilir (arayüz değişmez).
 */

import type { RunEvent } from '@covora/types'

/** Bir run olayına abone olunduğunda dönen, aboneliği sonlandıran fonksiyon. */
export type Unsubscribe = () => void

/** Run olay veri yolu. */
export interface RunEventBus {
  /** Bir olayı ilgili run'ın abonelerine yayınlar. */
  publish(event: RunEvent): void
  /** Belirli bir run'ın olaylarına abone olur. */
  subscribe(runId: string, listener: (event: RunEvent) => void): Unsubscribe
}

/** Bir olayın ait olduğu run kimliğini çıkarır. */
const runIdOf = (event: RunEvent): string =>
  event.type === 'run.created' || event.type === 'run.finished' ? event.run.id : event.runId

/**
 * Süreç-içi bir {@link RunEventBus} oluşturur.
 *
 * @returns Yeni veri yolu.
 */
export const createRunEventBus = (): RunEventBus => {
  const listeners = new Map<string, Set<(event: RunEvent) => void>>()

  return {
    publish(event) {
      const set = listeners.get(runIdOf(event))
      if (set === undefined) {
        return
      }
      for (const listener of [...set]) {
        try {
          listener(event)
        } catch {
          // Tek bir abonenin hatası diğerlerini ve yayını etkilemez.
        }
      }
    },

    subscribe(runId, listener) {
      const set = listeners.get(runId) ?? new Set()
      set.add(listener)
      listeners.set(runId, set)
      return () => {
        const current = listeners.get(runId)
        if (current === undefined) {
          return
        }
        current.delete(listener)
        if (current.size === 0) {
          listeners.delete(runId)
        }
      }
    }
  }
}
