/**
 * @module studio/components/DashboardPanel
 *
 * Tüm projeler genelinde genel bakış: sayısal göstergeler (proje/pack/sağlayıcı/
 * review, gate geçme oranı, ortalama coverage) ve son review'lar.
 */

import type { DashboardSummary } from '@covora/types'
import { useCallback, useEffect, useState } from 'react'

import type { StudioApi } from '../api/client.js'

/** {@link DashboardPanel} props. */
export interface DashboardPanelProps {
  readonly api: StudioApi
  /** Bir projeye gitmek için (son review'lardan). */
  readonly onOpenProject: (projectKey: string) => void
}

interface Stat {
  readonly label: string
  readonly value: string
}

/**
 * Genel bakış paneli.
 *
 * @param props - API ve proje açma geri çağırımı.
 */
export const DashboardPanel = ({ api, onOpenProject }: DashboardPanelProps): React.JSX.Element => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setSummary(await api.getDashboard())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  if (error !== null) {
    return <div className="state state--error">{error}</div>
  }
  if (loading || summary === null) {
    return <div className="state">Yükleniyor…</div>
  }

  const { stats, recent } = summary
  const cards: readonly Stat[] = [
    { label: 'Proje', value: String(stats.projects) },
    { label: 'Review Paketi', value: String(stats.packs) },
    { label: 'AI Sağlayıcı', value: String(stats.providers) },
    { label: 'Review', value: String(stats.reviews) },
    { label: 'Gate Geçme', value: `%${stats.gatePassRate}` },
    { label: 'Ort. Coverage', value: stats.avgCoverage.toFixed(1) }
  ]

  return (
    <section>
      <div className="stat-grid">
        {cards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="stat-card__value">{card.value}</div>
            <div className="stat-card__label">{card.label}</div>
          </div>
        ))}
      </div>

      <h3 className="section-title">Son Review'lar</h3>
      {recent.length === 0 ? (
        <div className="state">Henüz review yok.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Proje</th>
              <th>Tür</th>
              <th>Coverage</th>
              <th>Seviye</th>
              <th>Gate</th>
              <th>Tarih</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((review) => (
              <tr key={review.id}>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onOpenProject(review.projectKey)}
                  >
                    {review.projectName}
                  </button>
                </td>
                <td>
                  <span className="badge">{review.kind}</span>
                </td>
                <td className="mono">{review.score.toFixed(1)}</td>
                <td>{review.level}</td>
                <td>
                  <span className={review.gatePassed ? 'badge badge--pass' : 'badge badge--fail'}>
                    {review.gatePassed ? 'GEÇTİ' : 'KALDI'}
                  </span>
                </td>
                <td className="mono">{new Date(review.createdAt).toLocaleString('tr-TR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
