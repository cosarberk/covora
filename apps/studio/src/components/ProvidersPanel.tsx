/**
 * @module studio/components/ProvidersPanel
 *
 * LLM sağlayıcılarını (Ollama endpoint + model) yönetir: listele, ekle,
 * aktifleştir, sil. Her review türü (ui/code) için bir sağlayıcı aktiftir.
 */

import type { ProviderConfig, ReviewKind } from '@covora/types'
import { useCallback, useEffect, useState } from 'react'

import type { CreateProviderInput, StudioApi } from '../api/client.js'

/** {@link ProvidersPanel} props. */
export interface ProvidersPanelProps {
  readonly api: StudioApi
}

const emptyForm: CreateProviderInput = {
  name: '',
  kind: 'ui',
  baseUrl: 'http://ollama:11434',
  model: '',
  active: true
}

/**
 * AI sağlayıcı yönetim paneli.
 *
 * @param props - Studio API.
 */
export const ProvidersPanel = ({ api }: ProvidersPanelProps): React.JSX.Element => {
  const [providers, setProviders] = useState<readonly ProviderConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CreateProviderInput>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setProviders(await api.listProviders())
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
    if (form.name.trim().length === 0 || form.model.trim().length === 0 || form.baseUrl.trim().length === 0) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.createProvider(form)
      setForm(emptyForm)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setSaving(false)
    }
  }

  const activate = async (id: string): Promise<void> => {
    setError(null)
    try {
      await api.activateProvider(id)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  const remove = async (id: string): Promise<void> => {
    if (!globalThis.confirm('Bu sağlayıcı silinsin mi?')) {
      return
    }
    try {
      await api.deleteProvider(id)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  return (
    <section>
      <form className="rule-form" onSubmit={(event) => void submit(event)}>
        <input
          className="input"
          placeholder="ad (örn. Ollama UI)"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <select
          className="select"
          value={form.kind}
          onChange={(event) => setForm({ ...form, kind: event.target.value as ReviewKind })}
        >
          <option value="ui">ui (vision)</option>
          <option value="code">code</option>
        </select>
        <input
          className="input input--grow"
          placeholder="baseUrl (http://ollama:11434)"
          value={form.baseUrl}
          onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
        />
        <input
          className="input"
          placeholder="model (qwen3-vl:8b)"
          value={form.model}
          onChange={(event) => setForm({ ...form, model: event.target.value })}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.active ?? false}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          aktif
        </label>
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'Ekleniyor…' : 'Sağlayıcı Ekle'}
        </button>
      </form>

      {error !== null && <div className="state state--error">{error}</div>}

      {loading ? (
        <div className="state">Yükleniyor…</div>
      ) : providers.length === 0 ? (
        <div className="state">Henüz sağlayıcı yok. Yoksa server env'deki varsayılan kullanılır.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Tür</th>
              <th>URL</th>
              <th>Model</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.name}</td>
                <td>
                  <span className="badge">{provider.kind}</span>
                </td>
                <td className="mono">{provider.baseUrl}</td>
                <td className="mono">{provider.model}</td>
                <td>
                  <span className={provider.active ? 'badge badge--pass' : 'badge'}>
                    {provider.active ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td>
                  {!provider.active && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => void activate(provider.id)}
                    >
                      Aktifleştir
                    </button>
                  )}{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void remove(provider.id)}
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
