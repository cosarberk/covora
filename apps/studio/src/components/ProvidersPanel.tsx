/**
 * @module studio/components/ProvidersPanel
 *
 * AI sağlayıcılarını yönetir: türü (ollama / openai-uyumlu), endpoint, model ve
 * (gerekirse) API anahtarıyla ekle; aktifleştir; sil; ve **anlık sağlığını**
 * kontrol et (erişilebilir mi, model yüklü mü, mevcut modeller). Her review türü
 * (ui/code) için bir sağlayıcı aktiftir.
 */

import type { ProviderConfig, ProviderHealth, ProviderType, ReviewKind } from '@covora/types'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CreateProviderInput, StudioApi } from '../api/client.js'

/** {@link ProvidersPanel} props. */
export interface ProvidersPanelProps {
  readonly api: StudioApi
}

const emptyForm: CreateProviderInput = {
  name: '',
  providerType: 'ollama',
  kind: 'ui',
  baseUrl: 'http://ollama:11434',
  model: '',
  apiKey: '',
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
  const [health, setHealth] = useState<Record<string, ProviderHealth | 'loading'>>({})

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
    if (
      form.name.trim().length === 0 ||
      form.model.trim().length === 0 ||
      form.baseUrl.trim().length === 0
    ) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      // API anahtarı yalnızca openai-uyumlu için anlamlı.
      const payload: CreateProviderInput =
        form.providerType === 'openai-compatible'
          ? form
          : { ...form, apiKey: null }
      await api.createProvider(payload)
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

  const [warming, setWarming] = useState<Record<string, boolean>>({})
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    []
  )

  const checkHealth = async (id: string): Promise<void> => {
    setHealth((current) => ({ ...current, [id]: 'loading' }))
    try {
      const result = await api.getProviderHealth(id)
      if (mounted.current) {
        setHealth((current) => ({ ...current, [id]: result }))
      }
    } catch {
      setHealth((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }

  const stopWarming = (id: string): void =>
    setWarming((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })

  // Model RAM'e yüklenene (modelLoaded) kadar sağlığı yoklar.
  const pollUntilLoaded = useCallback(
    (id: string, triesLeft: number): void => {
      if (!mounted.current || triesLeft <= 0) {
        stopWarming(id)
        return
      }
      void api
        .getProviderHealth(id)
        .then((h) => {
          if (!mounted.current) {
            return
          }
          setHealth((current) => ({ ...current, [id]: h }))
          if (h.modelLoaded === true) {
            stopWarming(id)
          } else {
            globalThis.setTimeout(() => pollUntilLoaded(id, triesLeft - 1), 5000)
          }
        })
        .catch(() => {
          globalThis.setTimeout(() => pollUntilLoaded(id, triesLeft - 1), 5000)
        })
    },
    [api]
  )

  const warm = async (id: string): Promise<void> => {
    setWarming((current) => ({ ...current, [id]: true }))
    try {
      await api.warmProvider(id)
    } catch (cause) {
      stopWarming(id)
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
      return
    }
    pollUntilLoaded(id, 120) // ~10 dk (5sn × 120)
  }

  const unload = async (id: string): Promise<void> => {
    try {
      await api.unloadProvider(id)
      globalThis.setTimeout(() => void checkHealth(id), 1500)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  const isOpenAi = form.providerType === 'openai-compatible'

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
          value={form.providerType ?? 'ollama'}
          onChange={(event) =>
            setForm({ ...form, providerType: event.target.value as ProviderType })
          }
        >
          <option value="ollama">ollama</option>
          <option value="openai-compatible">openai-uyumlu</option>
        </select>
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
          placeholder={isOpenAi ? 'baseUrl (http://vllm:8000/v1)' : 'baseUrl (http://ollama:11434)'}
          value={form.baseUrl}
          onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
        />
        <input
          className="input"
          placeholder={isOpenAi ? 'model (örn. qwen2-vl)' : 'model (qwen3-vl:8b)'}
          value={form.model}
          onChange={(event) => setForm({ ...form, model: event.target.value })}
        />
        {isOpenAi && (
          <input
            className="input"
            type="password"
            placeholder="API anahtarı (opsiyonel)"
            value={form.apiKey ?? ''}
            onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
          />
        )}
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
              <th>Review</th>
              <th>URL</th>
              <th>Model</th>
              <th>Durum</th>
              <th>Sağlık</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => {
              const h = health[provider.id]
              return (
                <tr key={provider.id}>
                  <td>{provider.name}</td>
                  <td>
                    <span className="badge">{provider.providerType}</span>
                  </td>
                  <td>
                    <span className="badge">{provider.kind}</span>
                    {provider.capabilities.vision && <span className="badge">vision</span>}
                  </td>
                  <td className="mono">{provider.baseUrl}</td>
                  <td className="mono">
                    {provider.model}
                    {provider.hasApiKey && <span className="badge"> 🔑</span>}
                  </td>
                  <td>
                    <span className={provider.active ? 'badge badge--pass' : 'badge'}>
                      {provider.active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td>
                    {warming[provider.id] === true ? (
                      <span className="badge" title="Model belleğe yükleniyor">
                        RAM'e yükleniyor…
                      </span>
                    ) : h === undefined ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => void checkHealth(provider.id)}
                      >
                        Kontrol et
                      </button>
                    ) : h === 'loading' ? (
                      <span className="mono">kontrol ediliyor…</span>
                    ) : h.reachable ? (
                      <span className="mono" title={(h.models ?? []).join(', ')}>
                        {h.modelLoaded === true ? (
                          <span className="badge badge--pass">Hazır (RAM'de)</span>
                        ) : h.modelLoaded === false ? (
                          <>
                            <span className="badge badge--pass">erişilebilir</span>
                            <span className="badge"> yüklü değil</span>
                          </>
                        ) : (
                          <span className="badge badge--pass">erişilebilir</span>
                        )}
                        {h.latencyMs !== undefined && ` ${h.latencyMs}ms`}
                      </span>
                    ) : (
                      <span className="badge badge--fail" title={h.error}>
                        erişilemiyor
                      </span>
                    )}
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
                      onClick={() => void checkHealth(provider.id)}
                    >
                      Durum
                    </button>{' '}
                    {provider.providerType === 'ollama' && (
                      <>
                        <button
                          type="button"
                          className="link-button"
                          disabled={warming[provider.id] === true}
                          onClick={() => void warm(provider.id)}
                        >
                          RAM'e yükle
                        </button>{' '}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => void unload(provider.id)}
                        >
                          Boşalt
                        </button>{' '}
                      </>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => void remove(provider.id)}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
