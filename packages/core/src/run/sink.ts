/**
 * @module @covora/core/run/sink
 *
 * Run yürütücüsünün dış dünyaya (persistence + canlı yayın) bağlandığı arayüz.
 * Çekirdek saf kalır: yürütücü yalnızca bu sink'i çağırır; satırları DB'ye
 * yazmak ve SSE ile akıtmak host'un (server) sorumluluğudur. Bu sayede motor
 * test edilebilir ve altyapıdan bağımsızdır.
 */

import type { LogLevel, RunStatus, StepStatus } from '@covora/types'

/** Run tamamlanırken sink'e geçilen terminal bilgiler. */
export interface RunFinishPatch {
  /** Önceki aynı tür review'a göre skor farkı. */
  readonly delta: number | null
  /** Run `failed` olduğunda kök hata özeti. */
  readonly error?: string
}

/**
 * Run yürütücüsünün olay/çıktı kanalı. Her çağrı kalıcılaştırılmalı ve (varsa)
 * canlı dinleyicilere yayınlanmalıdır. Uygulama (server) sıralamayı korur.
 */
export interface RunSink {
  /** Run'ı `running` durumuna alır (başlangıç zamanını damgalar). */
  runStarted(): Promise<void>
  /** Bir adımı `running` yapar. */
  stepStarted(key: string): Promise<void>
  /** Bir adımı terminal duruma getirir; hata varsa özeti taşır. */
  stepFinished(key: string, status: StepStatus, error?: string): Promise<void>
  /** Run'a (ve opsiyonel bir adıma) tek bir log satırı ekler. */
  log(level: LogLevel, message: string, stepKey?: string): Promise<void>
  /** Run'ı terminal duruma getirir (bitiş zamanını damgalar). */
  runFinished(status: RunStatus, patch: RunFinishPatch): Promise<void>
}
