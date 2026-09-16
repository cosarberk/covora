/**
 * @module studio/components/DeltaBadge
 *
 * Bir önceki review'a göre coverage farkını (delta) yön okuyla gösterir.
 * `null` (ilk review) için nötr çizgi gösterilir.
 */

/** {@link DeltaBadge} props. */
export interface DeltaBadgeProps {
  readonly delta: number | null
}

/**
 * Coverage delta rozeti.
 *
 * @param props - Delta değeri (null = ilk review).
 */
export const DeltaBadge = ({ delta }: DeltaBadgeProps): React.JSX.Element => {
  if (delta === null) {
    return <span className="delta delta--none">—</span>
  }
  if (delta > 0) {
    return <span className="delta delta--up">▲ {delta.toFixed(1)}</span>
  }
  if (delta < 0) {
    return <span className="delta delta--down">▼ {Math.abs(delta).toFixed(1)}</span>
  }
  return <span className="delta delta--none">0</span>
}
