/**
 * @module studio/components/DashboardPanel
 *
 * Genel bakış: KPI kartları, gate geçme oranı (halka gösterge), ortalama
 * coverage (bar) ve son review'lar. Değerler sunucuda hesaplanır.
 */

import type { DashboardSummary } from '@covora/types'
import { useCallback, useEffect, useState } from 'react'

import type { StudioApi } from '../api/client.js'
import { DeltaBadge } from './DeltaBadge.js'
import { Icon, type IconName } from './Icon.js'

/** {@link DashboardPanel} props. */
export interface DashboardPanelProps {
  readonly api: StudioApi
  /** Bir projeye gitmek için (son review'lardan). */
  readonly onOpenProject: (projectKey: string) => void
}

/** Yüzdelik değer için SVG halka göstergesi. */
const Ring = ({ value, color }: { readonly value: number; readonly color: string }): React.JSX.Element => {
  const r = 34
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, value)) / 100) * c
  return (
    <svg className="ring" viewBox="0 0 80 80" width="88" height="88">
      <circle cx="40" cy="40" r={r} className="ring__track" />
      <circle
        cx="40"
        cy="40"
        r={r}
        className="ring__fill"
        stroke={color}
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="44" className="ring__text">
        %{Math.round(value)}
      </text>
    </svg>
  )
}

const KPI: readonly { readonly key: keyof DashboardSummary['stats']; readonly icon: IconName; readonly label: string }[] = [
  { key: 'projects', icon: 'project', label: 'Proje' },
  { key: 'packs', icon: 'packages', label: 'Review Paketi' },
  { key: 'providers', icon: 'ai', label: 'AI Sağlayıcı' },
  { key: 'reviews', icon: 'reviews', label: 'Review' }
]

/** Genel bakış paneli. */
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
    return (
      <div className="dash">
        <div className="page__head">
          <div>
            <h1 className="page__title">Genel Bakış</h1>
          </div>
        </div>
        <div className="state state--error">{error}</div>
      </div>
    )
  }
  if (loading || summary === null) {
    return (
      <div className="dash">
        <div className="page__head">
          <div>
            <h1 className="page__title">Genel Bakış</h1>
          </div>
        </div>
        <div className="skeleton-grid">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton-card" />
          ))}
        </div>
      </div>
    )
  }

  const { stats, recent } = summary
  const gateColor =
    stats.gatePassRate >= 80
      ? 'var(--pass)'
      : stats.gatePassRate >= 50
        ? 'var(--warn)'
        : 'var(--fail)'

  return (
    <div className="dash">
      <div className="page__head">
        <div>
          <h1 className="page__title">Genel Bakış</h1>
          <p className="page__sub">Tüm projeler genelinde özet ve son review’lar.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Yenile
          </button>
        </div>
      </div>

      <div className="kpi-row">
        {KPI.map((item) => (
          <div key={item.key} className="kpi">
            <span className="kpi__icon">
              <Icon name={item.icon} size={18} />
            </span>
            <span className="kpi__value">{stats[item.key]}</span>
            <span className="kpi__label">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="dash-hero">
        <div className="hero-card">
          <div className="hero-card__head">Gate geçme oranı</div>
          <div className="hero-card__ring">
            <Ring value={stats.gatePassRate} color={gateColor} />
            <div className="hero-card__legend">
              <div>
                <span className="dot dot--pass" /> Geçen review'lar
              </div>
              <div className="hero-card__muted">{stats.reviews} review üzerinden</div>
            </div>
          </div>
        </div>

        <div className="hero-card">
          <div className="hero-card__head">Ortalama coverage</div>
          <div className="hero-card__big">{stats.avgCoverage.toFixed(1)}</div>
          <div className="meter">
            <div
              className="meter__fill"
              style={{ width: `${Math.max(0, Math.min(100, stats.avgCoverage))}%` }}
            />
          </div>
          <div className="hero-card__muted">0–100 arası tüm review ortalaması</div>
        </div>
      </div>

      <div className="section-head">
        <h3 className="section-title">Son Review'lar</h3>
      </div>
      {recent.length === 0 ? (
        <div className="state">Henüz review yok. Bir pipeline tetiklendiğinde burada görünür.</div>
      ) : (
        <div className="recent">
          {recent.map((review) => (
            <button
              key={review.id}
              type="button"
              className="recent__row"
              onClick={() => onOpenProject(review.projectKey)}
            >
              <span className="recent__avatar">
                {(review.projectName[0] ?? '?').toUpperCase()}
              </span>
              <span className="recent__main">
                <span className="recent__name">{review.projectName}</span>
                <span className="recent__meta">
                  <span className="badge">{review.kind}</span>
                  <span className="mono">{new Date(review.createdAt).toLocaleString('tr-TR')}</span>
                </span>
              </span>
              <span className="recent__score">
                <span className="recent__num">{review.score.toFixed(1)}</span>
                <span className="recent__lvl">{review.level}</span>
              </span>
              <DeltaBadge delta={review.delta} />
              <span className={review.gatePassed ? 'badge badge--pass' : 'badge badge--fail'}>
                {review.gatePassed ? 'GEÇTİ' : 'KALDI'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
