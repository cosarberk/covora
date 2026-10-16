/**
 * @module studio/components/IntegrationsPanel
 *
 * Bağlamalar: çalışma-alanı geneli 3. parti bağlantılar (Jira vb.). Dış sistemin
 * uç noktası ve gizli erişim jetonu buradan eklenir/düzenlenir/silinir. Gizli
 * jeton sunucudan asla geri dönmez; yalnızca tanımlı olup olmadığı gösterilir.
 *
 * NOT: Git sağlayıcıları (GitHub/GitLab/Gitea) buraya DEĞİL, projenin kendi git
 * bağlantısına aittir. Otomasyon kuralları (ör. "Jira'da task review'a alınınca
 * MR kontrolü başlat") ileride bu bağlantılara eklenecek.
 */

import type { CreateIntegrationInput, Integration, IntegrationProvider } from '@covora/types'
import { useCallback, useEffect, useState } from 'react'

import type { StudioApi } from '../api/client.js'
import { confirmDialog } from './overlays.js'

/** {@link IntegrationsPanel} props. */
export interface IntegrationsPanelProps {
  readonly api: StudioApi
}

/** Sağlayıcı seçenekleri (okunur etiketle). */
const PROVIDER_OPTIONS: readonly { readonly value: IntegrationProvider; readonly label: string }[] = [
  { value: 'jira', label: 'Jira' },
  { value: 'generic', label: 'Jenerik (HTTP)' }
]

/** Sağlayıcıya göre örnek adres (placeholder). */
const BASE_URL_HINT: Record<IntegrationProvider, string> = {
  jira: 'https://firma.atlassian.net',
  generic: 'https://ornek.servis.com/api'
}

const emptyForm: CreateIntegrationInput = {
  provider: 'jira',
  name: '',
  baseUrl: '',
  token: '',
  enabled: true
}

/**
 * Bağlamalar yönetim paneli.
 *
 * @param props - Studio API.
 */
export const IntegrationsPanel = ({ api }: IntegrationsPanelProps): React.JSX.Element => {
  const [integrations, setIntegrations] = useState<readonly Integration[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CreateIntegrationInput>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setIntegrations(await api.listIntegrations())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (form.name.trim().length === 0 || form.baseUrl.trim().length === 0) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const token = form.token?.trim()
      await api.createIntegration({
        provider: form.provider,
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        ...(token !== undefined && token.length > 0 ? { token } : {}),
        enabled: form.enabled ?? true
      })
      setForm(emptyForm)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (integration: Integration): Promise<void> => {
    setError(null)
    try {
      await api.updateIntegration(integration.id, { enabled: !integration.enabled })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  const remove = async (integration: Integration): Promise<void> => {
    const confirmed = await confirmDialog({
      title: 'Bağlantı sil',
      message: `"${integration.name}" bağlantısı silinecek.`,
      confirmLabel: 'Sil',
      danger: true
    })
    if (!confirmed) {
      return
    }
    try {
      await api.deleteIntegration(integration.id)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  return (
    <section>
      <form className="rule-form" onSubmit={(event) => void submit(event)}>
        <select
          className="select"
          value={form.provider}
          onChange={(event) =>
            setForm({ ...form, provider: event.target.value as IntegrationProvider })
          }
        >
          {PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="ad (örn. Şirket Jira)"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <input
          className="input input--grow"
          placeholder={`baseUrl (${BASE_URL_HINT[form.provider]})`}
          value={form.baseUrl}
          onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
        />
        <input
          className="input"
          type="password"
          placeholder="erişim jetonu (opsiyonel)"
          value={form.token ?? ''}
          onChange={(event) => setForm({ ...form, token: event.target.value })}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.enabled ?? true}
            onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
          />
          etkin
        </label>
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'Ekleniyor…' : 'Bağlantı Ekle'}
        </button>
      </form>

      {error !== null && <div className="state state--error">{error}</div>}

      {loading ? (
        <div className="state">Yükleniyor…</div>
      ) : integrations.length === 0 ? (
        <div className="state">
          Henüz bağlantı yok. Jira gibi dış sistemleri buradan bağlayın; otomasyon
          kuralları (task → MR kontrolü, çıktıdan bug kaydı) yakında.
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Sağlayıcı</th>
              <th>Ad</th>
              <th>URL</th>
              <th>Jeton</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {integrations.map((integration) => (
              <tr key={integration.id}>
                <td>
                  <span className="badge">
                    {PROVIDER_OPTIONS.find((o) => o.value === integration.provider)?.label ??
                      integration.provider}
                  </span>
                </td>
                <td>{integration.name}</td>
                <td className="mono">{integration.baseUrl}</td>
                <td>
                  {integration.hasToken ? (
                    <span className="badge badge--pass">tanımlı</span>
                  ) : (
                    <span className="badge">yok</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className={integration.enabled ? 'toggle toggle--on' : 'toggle'}
                    onClick={() => void toggleEnabled(integration)}
                  >
                    {integration.enabled ? 'Etkin' : 'Kapalı'}
                  </button>
                </td>
                <td className="rule-actions">
                  <button
                    type="button"
                    className="link-button link-button--danger"
                    onClick={() => void remove(integration)}
                  >
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
