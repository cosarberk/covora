/**
 * @module studio/components/builder/context
 *
 * Builder node'ları React Flow tarafından render edildiğinden prop geçemiyoruz;
 * ihtiyaç duydukları defter (node türü metadata'sı), bağlı giriş bilgisi, canlı
 * çalışma durumu ve aksiyonlar bu context'ten gelir. Node'lar backend grafının
 * parçasıdır: parametreleri gövdede düzenlenir (grafta saklanır), portları
 * defterden çizilir, çalıştırınca gerçek durumla yanar.
 */

import { createContext, useContext } from 'react'
import type { IsValidConnection } from '@xyflow/react'

import type { StepStatus } from '@covora/types'

import type { InterfaceIndex, NodeTypeIndex } from './catalog.js'

/** Alt-blueprint seçicide listelenen bir blueprint (subflow node'u için). */
export interface BlueprintOption {
  readonly key: string
  readonly name: string
}

/** Bir node'un canlı çalışma durumu (SSE ile güncellenir). */
export interface NodeRunState {
  readonly status: StepStatus
  readonly output?: unknown
  readonly error?: string | null
}

export interface BuilderContextValue {
  /** Node türü defteri (palet + gövde çizimi bundan). */
  readonly index: NodeTypeIndex
  /** blueprint anahtarı → dış arayüz (subflow node portlarını çizmek/kontrol için). */
  readonly interfaces: InterfaceIndex
  /** Alt-blueprint seçicide gösterilecek blueprint'ler (kendisi hariç). */
  readonly blueprintOptions: readonly BlueprintOption[]
  /** nodeId → o node'un bağlı (kablo gelmiş) giriş handle id'leri. */
  readonly connectedInputs: Readonly<Record<string, readonly string[]>>
  /** nodeId → canlı çalışma durumu (boşsa henüz koşmadı). */
  readonly runState: Readonly<Record<string, NodeRunState>>
  /** Bir node parametresini günceller (grafı değiştirir, kaydedilmemiş sayar). */
  readonly updateParam: (nodeId: string, name: string, value: unknown) => void
  /** Node'u canvas'tan siler. */
  readonly removeNode: (id: string) => void
  /** Node'u (parametreleriyle) çoğaltır. */
  readonly duplicateNode: (id: string) => void
  /** Bir bağlantının tip-uyumlu olup olmadığını söyler (handle vurgusu + onConnect). */
  readonly isValidConnection: IsValidConnection
}

export const BuilderContext = createContext<BuilderContextValue | null>(null)

export const useBuilder = (): BuilderContextValue => {
  const ctx = useContext(BuilderContext)
  if (ctx === null) throw new Error('useBuilder yalnızca BuilderContext içinde kullanılır')
  return ctx
}
