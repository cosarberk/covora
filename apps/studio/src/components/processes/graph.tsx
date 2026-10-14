/**
 * @module studio/components/processes/graph
 *
 * Süreçler node grafiği: React Flow özel node'ları (adım / girdi / sonuç),
 * sabit düzen, kenar üreticisi ve paylaşılan etiket/biçim yardımcıları.
 */

import type {
  ReviewKind,
  RuleResult,
  RunLogLine,
  RunStatus,
  Severity,
  StepStatus
} from '@covora/types'
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react'

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Kuyrukta',
  running: 'Çalışıyor',
  succeeded: 'Başarılı',
  degraded: 'Kısmi (AI hata)',
  failed: 'Hata',
  cancelled: 'İptal'
}

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: 'Bekliyor',
  running: 'Çalışıyor',
  succeeded: 'Tamam',
  skipped: 'Atlandı',
  failed: 'Hata',
  cancelled: 'İptal'
}

export const STEP_GLYPH: Record<StepStatus, string> = {
  pending: '○',
  running: '◍',
  succeeded: '✓',
  skipped: '–',
  failed: '✕',
  cancelled: '⊘'
}

export const OUTCOME_LABEL: Record<RuleResult['outcome'], string> = {
  pass: 'Geçti',
  partial: 'Kısmi',
  fail: 'Kaldı'
}

export const LOG_COLOR: Record<RunLogLine['level'], string> = {
  debug: 'var(--text-faint)',
  info: 'var(--text-dim)',
  warn: 'var(--warn)',
  error: 'var(--fail)'
}

export const formatTime = (iso: string): string => new Date(iso).toLocaleTimeString('tr-TR')

export const formatDuration = (from?: string, to?: string): string | null => {
  if (from === undefined) {
    return null
  }
  const end = to !== undefined ? new Date(to).getTime() : Date.now()
  // Saat kayması / henüz yazılmamış bitiş zamanı negatif verebilir; 0'a sıkıştır.
  const ms = Math.max(0, end - new Date(from).getTime())
  if (ms < 1000) {
    return `${ms} ms`
  }
  const s = ms / 1000
  if (s < 60) {
    return `${s.toFixed(1)} sn`
  }
  const m = Math.floor(s / 60)
  return `${m} dk ${Math.round(s - m * 60)} sn`
}

export const approxKb = (base64: string): number => Math.round((base64.length * 3) / 4 / 1024)

interface StepNodeData extends Record<string, unknown> {
  readonly name: string
  readonly status: StepStatus
  readonly selected: boolean
  /** Canlı süre ya da kural sayısı gibi alt satır (örn. "12.4 sn", "3 kural"). */
  readonly detail: string | null
}

const StepNode = ({ data }: NodeProps): React.JSX.Element => {
  const d = data as StepNodeData
  return (
    <div className={`fnode fnode--${d.status}${d.selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="fnode__handle" />
      <span className="fnode__icon">{STEP_GLYPH[d.status]}</span>
      <span className="fnode__body">
        <span className="fnode__name">{d.name}</span>
        <span className="fnode__status">
          {STEP_STATUS_LABEL[d.status]}
          {d.detail !== null && <span className="fnode__detail"> · {d.detail}</span>}
        </span>
      </span>
      {d.status === 'running' && <span className="fnode__spin" aria-hidden />}
      <Handle type="source" position={Position.Right} className="fnode__handle" />
    </div>
  )
}

interface RuleNodeData extends Record<string, unknown> {
  readonly title: string
  readonly evaluation: 'deterministic' | 'llm'
  readonly severity: Severity
  readonly weight: number
  /** Nihai sonuç (rapor geldiğinde); henüz yoksa null. */
  readonly outcome: RuleResult['outcome'] | null
  /** Üst adım çalışıyor mu (neon efekti). */
  readonly running: boolean
  readonly selected: boolean
}

const RuleNode = ({ data }: NodeProps): React.JSX.Element => {
  const d = data as RuleNodeData
  const state =
    d.outcome !== null ? `fnode--rule-${d.outcome}` : d.running ? 'fnode--running' : 'fnode--rule-idle'
  return (
    <div className={`fnode fnode--rule ${state}${d.selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="fnode__handle" />
      <span className="fnode__rtop">
        <span className={`fnode__tag fnode__tag--${d.evaluation}`}>
          {d.evaluation === 'llm' ? 'AI' : 'DET'}
        </span>
        {d.severity === 'blocker' && <span className="fnode__blocker">BLOCKER</span>}
        <span className="fnode__weight">ağ. {d.weight}</span>
      </span>
      <span className="fnode__name">{d.title}</span>
      <span className="fnode__rstatus">
        {d.outcome !== null
          ? OUTCOME_LABEL[d.outcome]
          : d.running
            ? 'değerlendiriliyor…'
            : 'bekliyor'}
      </span>
      {d.running && d.outcome === null && <span className="fnode__spin" aria-hidden />}
      <Handle type="source" position={Position.Right} className="fnode__handle" />
    </div>
  )
}

interface InputNodeData extends Record<string, unknown> {
  readonly kind: ReviewKind
  readonly thumb: string | null
  readonly fileCount: number | null
  /** Köken bir kaynağa (MR/PR/commit) bağlıysa node'da ipucu gösterilir. */
  readonly hasSource: boolean
  readonly selected: boolean
}

const InputNode = ({ data }: NodeProps): React.JSX.Element => {
  const d = data as InputNodeData
  return (
    <div className={`fnode fnode--input${d.selected ? ' is-selected' : ''}`}>
      <span className="fnode__name">Girdi · {d.kind}</span>
      {d.kind === 'ui' ? (
        d.thumb !== null ? (
          <img className="fnode__thumb" src={d.thumb} alt="Gönderilen ekran görüntüsü" />
        ) : (
          <span className="fnode__placeholder">ekran görüntüsü</span>
        )
      ) : (
        <span className="fnode__placeholder">{d.fileCount ?? '?'} dosya</span>
      )}
      {d.hasSource && <span className="fnode__src">↗ kaynak</span>}
      <Handle type="source" position={Position.Right} className="fnode__handle" />
    </div>
  )
}

interface ResultNodeData extends Record<string, unknown> {
  readonly score: number | null
  readonly level: string | null
  readonly gatePassed: boolean | null
  readonly selected: boolean
}

const ResultNode = ({ data }: NodeProps): React.JSX.Element => {
  const d = data as ResultNodeData
  const gateClass = d.gatePassed === null ? '' : d.gatePassed ? ' fnode--pass' : ' fnode--fail'
  return (
    <div className={`fnode fnode--result${gateClass}${d.selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="fnode__handle" />
      <span className="fnode__name">Sonuç</span>
      <span className="fnode__score">{d.score === null ? '—' : d.score.toFixed(1)}</span>
      <span className="fnode__sub">
        {d.level ?? '—'} ·{' '}
        {d.gatePassed === null ? '—' : d.gatePassed ? 'Gate geçti' : 'Gate kaldı'}
      </span>
    </div>
  )
}

// NOT: tip adları React Flow'un yerleşik adlarıyla (input/default/output/group)
// çakışmamalı — çakışırsa node'a varsayılan beyaz kutu/çerçeve/150px basılır.
export const NODE_TYPES = { step: StepNode, reviewInput: InputNode, result: ResultNode, rule: RuleNode }

/** Grafik düzeni için kolon genişliği ve satır yüksekliği (px). */
export const COL_W = 250
export const ROW_H = 92

export const STATUS_STROKE: Record<StepStatus, string> = {
  pending: 'var(--border-strong)',
  running: 'var(--accent)',
  succeeded: 'var(--pass)',
  skipped: 'var(--border-strong)',
  failed: 'var(--fail)',
  cancelled: 'var(--border-strong)'
}

export type { StepNodeData, InputNodeData, ResultNodeData, RuleNodeData }
export type { Edge, Node }
