/**
 * @module studio/components/DashboardPanel
 *
 * Genel bakış = operasyon konsolu. Üstte KPI'lar; altında canlı sistem durumu
 * (AI sağlayıcı sağlığı + pipeline kuyruğu), gate/coverage göstergeleri,
 * coverage trendi ve son review'lar. Sağlayıcı/run verileri periyodik tazelenir.
 */

import type { DashboardSummary, ProviderConfig, ProviderHealth, RunSummary } from '@covora/types'
import { useCallback, useEffect, useRef, useState } from 'react'

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

/** Küçük çizgi grafik (0–100 değerleri; soldan sağa kronolojik). */
const Sparkline = ({ values }: { readonly values: readonly number[] }): React.JSX.Element => {
  const w = 280
  const h = 64
  const pad = 4
  if (values.length < 2) {
    return <div className="spark__empty">Trend için en az 2 review gerekli.</div>
  }
  const step = (w - pad * 2) / (values.length - 1)
  const y = (v: number): number => h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - pad * 2)
  const points = values.map((v, i) => `${pad + i * step},${y(v)}`).join(' ')
  const area = `${pad},${h} ${points} ${pad + (values.length - 1) * step},${h}`
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <polygon points={area} className="spark__area" />
      <polyline points={points} className="spark__line" />
      {values.map((v, i) => (
        <circle key={i} cx={pad + i * step} cy={y(v)} r={2} className="spark__dot" />
      ))}
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
  const [providers, setProviders] = useState<readonly ProviderConfig[]>([])
  const [health, setHealth] = useState<Record<string, ProviderHealth>>({})
  const [runs, setRuns] = useState<readonly RunSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  const load = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const [dash, provs, runList] = await Promise.all([
        api.getDashboard(),
        api.listProviders(),
        api.listRuns()
      ])
      if (!alive.current) {
        return
      }
      setSummary(dash)
      setProviders(provs)
      setRuns(runList)
      // Aktif sağlayıcılar için sağlık kontrolü (paralel, hatayı yut).
      const active = provs.filter((provider) => provider.active)
      const results = await Promise.all(
        active.map(async (provider) => {
          try {
            return [provider.id, await api.getProviderHealth(provider.id)] as const
          } catch {
            return null
          }
        })
      )
      if (!alive.current) {
        return
      }
      const map: Record<string, ProviderHealth> = {}
      for (const entry of results) {
        if (entry !== null) {
          map[entry[0]] = entry[1]
        }
      }
      setHealth(map)
    } catch (cause) {
      if (alive.current) {
        setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
      }
    }
  }, [api])

  useEffect(() => {
    alive.current = true
    setLoading(true)
    void load().finally(() => {
      if (alive.current) {
        setLoading(false)
      }
    })
    const interval = setInterval(() => void load(), 15000)
    return () => {
      alive.current = false
      clearInterval(interval)
    }
  }, [load])

  if (error !== null && summary === null) {
    return (
      <div className="dash">
        <div className="page__head">
          <h1 className="page__title">Genel Bakış</h1>
        </div>
        <div className="state state--error">{error}</div>
      </div>
    )
  }
  if (loading && summary === null) {
    return (
      <div className="dash">
        <div className="page__head">
          <h1 className="page__title">Genel Bakış</h1>
        </div>
        <div className="skeleton-grid">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton-card" />
          ))}
        </div>
      </div>
    )
  }
  if (summary === null) {
    return <div className="dash" />
  }

  const { stats, recent } = summary
  const gateColor =
    stats.gatePassRate >= 80 ? 'var(--pass)' : stats.gatePassRate >= 50 ? 'var(--warn)' : 'var(--fail)'

  // Pipeline durumu (listRuns'tan türetilir).
  const queued = runs.filter((run) => run.status === 'queued').length
  const running = runs.filter((run) => run.status === 'running').length
  const failed = runs.filter((run) => run.status === 'failed').length
  const degraded = runs.filter((run) => run.status === 'degraded').length
  const inFlight = runs.filter((run) => run.status === 'queued' || run.status === 'running').slice(0, 4)

  // Coverage trendi (son review'lar; kronolojik).
  const trend = [...recent].reverse().map((review) => review.score)

  // Sağlayıcı sağlığı: ui/code için aktif olan.
  const activeProviders = providers.filter((provider) => provider.active)

  return (
    <div className="dash">
      <div className="page__head">
        <div>
          <h1 className="page__title">Genel Bakış</h1>
          <p className="page__sub">Sistem durumu, pipeline akışı ve son review'lar — canlı.</p>
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

      {/* Canlı sistem durumu */}
      <div className="ops-row">
        <div className="ops-card">
          <div className="ops-card__head">
            <Icon name="ai" size={14} />
            <span>AI Sağlayıcı Sağlığı</span>
          </div>
          {activeProviders.length === 0 ? (
            <div className="ops-empty">Aktif sağlayıcı yok. “AI Sağlayıcılar”dan bir model aktifleştirin.</div>
          ) : (
            <div className="ops-list">
              {activeProviders.map((provider) => {
                const h = health[provider.id]
                const reachable = h?.reachable ?? null
                const loaded = h?.modelLoaded ?? null
                return (
                  <div key={provider.id} className="prov-health">
                    <span
                      className={`status-dot ${reachable === null ? '' : reachable ? 'status-dot--succeeded' : 'status-dot--failed'}`}
                    />
                    <div className="prov-health__main">
                      <div className="prov-health__top">
                        <span className="prov-health__name">{provider.name}</span>
                        <span className="badge">{provider.kind}</span>
                      </div>
                      <span className="prov-health__model mono">{provider.model}</span>
                    </div>
                    <div className="prov-health__flags">
                      <span className={reachable ? 'flag flag--ok' : 'flag flag--off'}>
                        {reachable === null ? 'kontrol…' : reachable ? 'erişilebilir' : 'erişilemiyor'}
                      </span>
                      {loaded !== null && (
                        <span className={loaded ? 'flag flag--ok' : 'flag flag--idle'}>
                          {loaded ? 'RAM’de' : 'yüklü değil'}
                        </span>
                      )}
                      {h?.latencyMs !== undefined && (
                        <span className="flag flag--muted mono">{Math.round(h.latencyMs)} ms</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="ops-card">
          <div className="ops-card__head">
            <Icon name="flow" size={14} />
            <span>Pipeline Durumu</span>
          </div>
          <div className="pipe-stats">
            <div className="pipe-stat">
              <b className={running > 0 ? 'is-live' : ''}>{running}</b>
              <span>çalışıyor</span>
            </div>
            <div className="pipe-stat">
              <b>{queued}</b>
              <span>kuyrukta</span>
            </div>
            <div className="pipe-stat">
              <b className={degraded > 0 ? 'is-warn' : ''}>{degraded}</b>
              <span>kısmi</span>
            </div>
            <div className="pipe-stat">
              <b className={failed > 0 ? 'is-fail' : ''}>{failed}</b>
              <span>hata</span>
            </div>
          </div>
          {inFlight.length > 0 ? (
            <div className="ops-list">
              {inFlight.map((run) => (
                <div key={run.id} className="pipe-row">
                  <span className={`status-dot status-dot--${run.status}`} />
                  <span className="badge">{run.kind}</span>
                  <span className="pipe-row__hash mono">{run.codeHash.slice(0, 8)}</span>
                  <span className="pipe-row__time mono">
                    {new Date(run.createdAt).toLocaleTimeString('tr-TR')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="ops-empty">Şu an işlenen pipeline yok.</div>
          )}
        </div>
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

        <div className="hero-card">
          <div className="hero-card__head">Coverage trendi</div>
          <Sparkline values={trend} />
          <div className="hero-card__muted">Son {trend.length} review (eskiden yeniye)</div>
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
              <span className="recent__avatar">{(review.projectName[0] ?? '?').toUpperCase()}</span>
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
