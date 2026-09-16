/**
 * @module studio/components/ProjectPacksPanel
 *
 * Bir projenin abone olduğu Review Pack'lerini yönetir: tüm pack'leri listeler
 * ve abone/abonelikten çıkar geçişini sağlar. Review, projenin abone olduğu
 * pack'lerdeki kuralları değerlendirir.
 */

import type { Pack } from '@covora/types'
import { useCallback, useEffect, useState } from 'react'

import type { StudioApi } from '../api/client.js'

/** {@link ProjectPacksPanel} props. */
export interface ProjectPacksPanelProps {
  readonly api: StudioApi
  readonly projectKey: string
}

/**
 * Proje-pack abonelik paneli.
 *
 * @param props - API ve proje anahtarı.
 */
export const ProjectPacksPanel = ({
  api,
  projectKey
}: ProjectPacksPanelProps): React.JSX.Element => {
  const [packs, setPacks] = useState<readonly Pack[]>([])
  const [subscribed, setSubscribed] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [all, mine] = await Promise.all([
        api.listPacks(),
        api.listProjectPacks(projectKey)
      ])
      setPacks(all)
      setSubscribed(new Set(mine.map((pack) => pack.id)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }, [api, projectKey])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (pack: Pack): Promise<void> => {
    setBusy(pack.id)
    setError(null)
    try {
      if (subscribed.has(pack.id)) {
        await api.removePack(projectKey, pack.id)
      } else {
        await api.assignPack(projectKey, pack.id)
      }
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      {error !== null && <div className="state state--error">{error}</div>}

      {loading ? (
        <div className="state">Yükleniyor…</div>
      ) : packs.length === 0 ? (
        <div className="state">Henüz pack yok. Önce “Review Paketleri”nden oluştur.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Anahtar</th>
              <th>Tür</th>
              <th>Kaynak</th>
              <th>Abonelik</th>
            </tr>
          </thead>
          <tbody>
            {packs.map((pack) => {
              const on = subscribed.has(pack.id)
              return (
                <tr key={pack.id}>
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
                      className={on ? 'toggle toggle--on' : 'toggle'}
                      disabled={busy === pack.id}
                      onClick={() => void toggle(pack)}
                    >
                      {on ? 'Abone' : 'Abone Değil'}
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
