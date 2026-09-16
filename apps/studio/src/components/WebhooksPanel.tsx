/**
 * @module studio/components/WebhooksPanel
 *
 * Bir projenin bildirim webhook'larını yönetir: listele, ekle (URL + olaylar),
 * etkin/pasif yap, sil. Review olaylarında (tamamlandı / gate kaldı / regresyon)
 * hedef URL'ye JSON POST atılır.
 */

import type { Webhook, WebhookEvent } from '@covora/types'
import { useCallback, useEffect, useState } from 'react'

import type { CreateWebhookInput, StudioApi } from '../api/client.js'

/** {@link WebhooksPanel} props. */
export interface WebhooksPanelProps {
  readonly api: StudioApi
  readonly projectKey: string
}

const EVENT_LABELS: Record<WebhookEvent, string> = {
  review_completed: 'Review tamamlandı',
  gate_failed: 'Gate kaldı',
  regression: 'Regresyon'
}

const ALL_EVENTS: readonly WebhookEvent[] = ['review_completed', 'gate_failed', 'regression']

const emptyForm: CreateWebhookInput = { url: '', events: ['gate_failed', 'regression'] }

/**
 * Bildirim webhook yönetim paneli.
 *
 * @param props - API ve proje anahtarı.
 */
export const WebhooksPanel = ({ api, projectKey }: WebhooksPanelProps): React.JSX.Element => {
  const [webhooks, setWebhooks] = useState<readonly Webhook[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<readonly WebhookEvent[]>(emptyForm.events)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setWebhooks(await api.listWebhooks(projectKey))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }, [api, projectKey])

  useEffect(() => {
    void load()
  }, [load])

  const toggleEvent = (event: WebhookEvent): void => {
    setEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event]
    )
  }

  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>): Promise<void> => {
    submitEvent.preventDefault()
    if (url.trim().length === 0 || events.length === 0) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.createWebhook(projectKey, { url: url.trim(), events })
      setUrl('')
      setEvents(emptyForm.events)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (webhook: Webhook): Promise<void> => {
    setError(null)
    try {
      await api.setWebhookActive(webhook.id, !webhook.active)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  const remove = async (id: string): Promise<void> => {
    if (!globalThis.confirm('Bu webhook silinsin mi?')) {
      return
    }
    try {
      await api.deleteWebhook(id)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  return (
    <section>
      <form className="rule-form" onSubmit={(formEvent) => void submit(formEvent)}>
        <input
          className="input input--grow"
          placeholder="https://hooks.slack.com/... veya Discord/generic URL"
          value={url}
          onChange={(changeEvent) => setUrl(changeEvent.target.value)}
        />
        {ALL_EVENTS.map((event) => (
          <label key={event} className="checkbox">
            <input
              type="checkbox"
              checked={events.includes(event)}
              onChange={() => toggleEvent(event)}
            />
            {EVENT_LABELS[event]}
          </label>
        ))}
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'Ekleniyor…' : 'Webhook Ekle'}
        </button>
      </form>

      {error !== null && <div className="state state--error">{error}</div>}

      {loading ? (
        <div className="state">Yükleniyor…</div>
      ) : webhooks.length === 0 ? (
        <div className="state">Bu proje için webhook yok. Gate/regresyon bildirimlerini buradan ekleyin.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>URL</th>
              <th>Olaylar</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((webhook) => (
              <tr key={webhook.id}>
                <td className="mono webhook-url">{webhook.url}</td>
                <td>
                  {webhook.events.map((event) => (
                    <span key={event} className="badge">
                      {EVENT_LABELS[event]}
                    </span>
                  ))}
                </td>
                <td>
                  <button
                    type="button"
                    className={webhook.active ? 'toggle toggle--on' : 'toggle'}
                    onClick={() => void toggleActive(webhook)}
                  >
                    {webhook.active ? 'Etkin' : 'Kapalı'}
                  </button>
                </td>
                <td>
                  <button type="button" className="link-button" onClick={() => void remove(webhook.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
