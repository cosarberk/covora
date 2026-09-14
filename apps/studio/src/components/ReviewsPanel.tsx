/**
 * @module studio/components/ReviewsPanel
 *
 * Bir projenin review geçmişini ve coverage skorlarını listeler.
 */

import { useCallback, useEffect, useState } from 'react'

import type { ReviewRecord, StudioApi } from '../api/client.js'

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
    <table className="table">
      <thead>
        <tr>
          <th>Tarih</th>
          <th>Tür</th>
          <th>Skor</th>
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
  )
}
