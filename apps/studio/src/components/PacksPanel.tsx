/**
 * @module studio/components/PacksPanel
 *
 * Review Pack'lerini (kural koleksiyonları) yönetir: listele, oluştur, sil ve
 * seçilen pack'in kurallarını düzenle/ekle. Yerleşik (builtin) pack'ler silinemez.
 */

import type { Pack, ReviewKind } from '@covora/types'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { CreatePackInput, StudioApi } from '../api/client.js'
import { RulesPanel } from './RulesPanel.js'

/** {@link PacksPanel} props. */
export interface PacksPanelProps {
  readonly api: StudioApi
}

const emptyForm: CreatePackInput = {
  key: '',
  name: '',
  kind: 'code',
  description: ''
}

/**
 * Review Pack yönetim paneli.
 *
 * @param props - Studio API.
 */
export const PacksPanel = ({ api }: PacksPanelProps): React.JSX.Element => {
  const [packs, setPacks] = useState<readonly Pack[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CreatePackInput>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setPacks(await api.listPacks())
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
    if (form.key.trim().length === 0 || form.name.trim().length === 0) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await api.createPack(form)
      setForm(emptyForm)
      await load()
      setSelected(created.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (pack: Pack): Promise<void> => {
    if (!globalThis.confirm(`"${pack.name}" paketi ve tüm kuralları silinsin mi?`)) {
      return
    }
    setError(null)
    try {
      await api.deletePack(pack.id)
      if (selected === pack.id) {
        setSelected(null)
      }
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selected) ?? null,
    [packs, selected]
  )

  const loadPackRules = useCallback(
    () => (selected === null ? Promise.resolve([]) : api.listPackRules(selected)),
    [api, selected]
  )

  return (
    <section className="packs">
      <form className="rule-form" onSubmit={(event) => void submit(event)}>
        <input
          className="input"
          placeholder="anahtar (örn. react-a11y)"
          value={form.key}
          onChange={(event) => setForm({ ...form, key: event.target.value })}
        />
        <input
          className="input input--grow"
          placeholder="ad"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <select
          className="select"
          value={form.kind}
          onChange={(event) => setForm({ ...form, kind: event.target.value as ReviewKind })}
        >
          <option value="code">code</option>
          <option value="ui">ui</option>
        </select>
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'Ekleniyor…' : 'Paket Ekle'}
        </button>
      </form>

      {error !== null && <div className="state state--error">{error}</div>}

      {loading ? (
        <div className="state">Yükleniyor…</div>
      ) : packs.length === 0 ? (
        <div className="state">Henüz pack yok.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Anahtar</th>
              <th>Tür</th>
              <th>Kaynak</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {packs.map((pack) => (
              <tr key={pack.id} className={pack.id === selected ? 'row--active' : undefined}>
                <td>{pack.name}</td>
                <td className="mono">{pack.key}</td>
                <td>
                  <span className="badge">{pack.kind}</span>
                </td>
                <td>
                  <span className={pack.builtin ? 'badge badge--pass' : 'badge'}>
                    {pack.builtin ? 'yerleşik' : 'özel'}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setSelected(pack.id === selected ? null : pack.id)}
                  >
                    {pack.id === selected ? 'Kapat' : 'Kurallar'}
                  </button>
                  {!pack.builtin && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => void remove(pack)}
                      >
                        Sil
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedPack !== null && (
        <div className="pack-rules">
          <h3 className="pack-rules__title">
            {selectedPack.name} · kurallar <span className="badge">{selectedPack.kind}</span>
          </h3>
          <RulesPanel
            api={api}
            loadRules={loadPackRules}
            onCreate={(input) =>
              api.createPackRule(selectedPack.id, { ...input, kind: selectedPack.kind }).then(() => undefined)
            }
            defaultKind={selectedPack.kind}
            emptyLabel="Bu pack'te henüz kural yok."
          />
        </div>
      )}
    </section>
  )
}
