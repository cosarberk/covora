/**
 * @module studio/components/overlays
 *
 * Uygulama geneli bildirim (toast) ve onay (confirm) katmanı. Tarayıcının
 * `alert`/`confirm` diyaloglarının yerini alır; modül seviyesinde basit bir
 * pub/sub ile çalışır, böylece bileşenler prop/context taşımadan `toast.*` ve
 * `confirmDialog(...)` çağırabilir. Host bileşenleri kök (App) içinde bir kez
 * monte edilir.
 */

import { useEffect, useState } from 'react'

/* ----------------------------- Toast ----------------------------- */

type ToastKind = 'info' | 'success' | 'warn' | 'error'

interface ToastItem {
  readonly id: number
  readonly kind: ToastKind
  readonly message: string
}

let toastItems: readonly ToastItem[] = []
const toastSubs = new Set<() => void>()
let seq = 0

const emitToasts = (): void => {
  for (const fn of toastSubs) {
    fn()
  }
}

const dismissToast = (id: number): void => {
  toastItems = toastItems.filter((item) => item.id !== id)
  emitToasts()
}

const showToast = (kind: ToastKind, message: string): void => {
  const id = ++seq
  toastItems = [...toastItems, { id, kind, message }]
  emitToasts()
  globalThis.setTimeout(() => dismissToast(id), kind === 'error' ? 6000 : 3500)
}

/** Uygulama geneli bildirim API'si. */
export const toast = {
  info: (message: string): void => showToast('info', message),
  success: (message: string): void => showToast('success', message),
  warn: (message: string): void => showToast('warn', message),
  error: (message: string): void => showToast('error', message)
}

/** Toast listesini (fixed, sağ-alt) render eder. Kökte bir kez monte edilir. */
export const ToastHost = (): React.JSX.Element => {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = (): void => force((n) => n + 1)
    toastSubs.add(fn)
    return () => {
      toastSubs.delete(fn)
    }
  }, [])
  return (
    <div className="toast-host">
      {toastItems.map((item) => (
        <div key={item.id} className={`toast toast--${item.kind}`} role="status">
          <span className="toast__msg">{item.message}</span>
          <button type="button" className="toast__close" onClick={() => dismissToast(item.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/* ---------------------------- Confirm ---------------------------- */

interface ConfirmRequest {
  readonly id: number
  readonly title: string
  readonly message: string
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly danger: boolean
  readonly resolve: (value: boolean) => void
}

let confirmCurrent: ConfirmRequest | null = null
const confirmSubs = new Set<() => void>()

const emitConfirm = (): void => {
  for (const fn of confirmSubs) {
    fn()
  }
}

/** Onay seçenekleri. */
export interface ConfirmOptions {
  readonly title: string
  readonly message: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  /** Onay butonunu tehlikeli (kırmızı) gösterir. */
  readonly danger?: boolean
}

/** Bir onay diyaloğu açar; kullanıcı onaylarsa true döner. */
export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    confirmCurrent = {
      id: ++seq,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? 'Onayla',
      cancelLabel: options.cancelLabel ?? 'Vazgeç',
      danger: options.danger ?? false,
      resolve
    }
    emitConfirm()
  })

/** Onay diyaloğunu render eder. Kökte bir kez monte edilir. */
export const ConfirmHost = (): React.JSX.Element | null => {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = (): void => force((n) => n + 1)
    confirmSubs.add(fn)
    return () => {
      confirmSubs.delete(fn)
    }
  }, [])

  const req = confirmCurrent
  if (req === null) {
    return null
  }

  const settle = (value: boolean): void => {
    req.resolve(value)
    confirmCurrent = null
    emitConfirm()
  }

  return (
    <div className="modal-backdrop" onClick={() => settle(false)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__title">{req.title}</div>
        <div className="modal__msg">{req.message}</div>
        <div className="modal__actions">
          <button type="button" className="btn-secondary" onClick={() => settle(false)}>
            {req.cancelLabel}
          </button>
          <button
            type="button"
            className={req.danger ? 'button button--danger' : 'button'}
            onClick={() => settle(true)}
            autoFocus
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
