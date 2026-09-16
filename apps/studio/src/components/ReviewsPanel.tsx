/**
 * @module studio/components/ReviewsPanel
 *
 * Bir projenin review geçmişini ve coverage skorlarını listeler.
 */

import { useCallback, useEffect, useState } from 'react'

import type { ReviewRecord, StudioApi } from '../api/client.js'
import { DeltaBadge } from './DeltaBadge.js'

/** {@link ReviewsPanel} props. */
export interface ReviewsPanelProps {
  readonly api: StudioApi
  readonly projectKey: string
}

/**
 * ISO tarihini kısa okunur biçime çevirir.
 *
 * @param iso - ISO tarih dizesi.
 * @returns Yerel biçimli tarih.
 */
const formatDate = (iso: string): string => new Date(iso).toLocaleString('tr-TR')

/**
 * Coverage skorlarının zaman içindeki trendini basit bir sparkline olarak
 * çizer (0-100 ölçeğinde, eskiden yeniye).
 *
 * @param props - Review kayıtları.
 */
const CoverageSparkline = ({
  reviews
}: {
  reviews: readonly ReviewRecord[]
}): React.JSX.Element | null => {
  if (reviews.length < 2) {
    return null
  }

  const scores = [...reviews].reverse().map((review) => review.score)
  const width = 640
  const height = 80
  const padding = 6
  const points = scores
    .map((score, index) => {
      const x = padding + (index / (scores.length - 1)) * (width - 2 * padding)
      const y = height - padding - (score / 100) * (height - 2 * padding)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <div className="sparkline-wrap">
      <div className="sparkline-title">Coverage trendi (eskiden yeniye)</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="sparkline" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={2} />
      </svg>
    </div>
  )
}

/**
 * Review geçmişi paneli.
 *
 * @param props - API ve proje anahtarı.
 */
export const ReviewsPanel = ({ api, projectKey }: ReviewsPanelProps): React.JSX.Element => {
  const [reviews, setReviews] = useState<readonly ReviewRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setReviews(await api.listReviews(projectKey))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }, [api, projectKey])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <div className="state">Yükleniyor…</div>
  }
  if (error !== null) {
    return <div className="state state--error">{error}</div>
  }
  if (reviews.length === 0) {
    return <div className="state">Bu proje için review kaydı yok.</div>
  }

  return (
    <>
      <CoverageSparkline reviews={reviews} />
      <table className="table">
        <thead>
          <tr>
            <th>Tarih</th>
          <th>Tür</th>
          <th>Skor</th>
          <th>Δ</th>
          <th>Seviye</th>
          <th>Gate</th>
          <th>Kod Hash</th>
        </tr>
      </thead>
      <tbody>
        {reviews.map((review) => (
          <tr key={review.id}>
            <td>{formatDate(review.createdAt)}</td>
            <td>
              <span className="badge">{review.kind}</span>
            </td>
            <td className="score">{review.score.toFixed(1)}</td>
            <td>
              <DeltaBadge delta={review.delta} />
            </td>
            <td>{review.level}</td>
            <td>
              <span className={review.gatePassed ? 'badge badge--pass' : 'badge badge--fail'}>
                {review.gatePassed ? 'Geçti' : 'Kaldı'}
              </span>
            </td>
            <td className="mono">{review.codeHash.slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
      </table>
    </>
  )
}
