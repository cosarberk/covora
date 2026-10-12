/**
 * @module studio/components/processes/graph
 *
 * Süreçler node grafiği: React Flow özel node'ları (adım / girdi / sonuç),
 * sabit düzen, kenar üreticisi ve paylaşılan etiket/biçim yardımcıları.
 */

import type { ReviewKind, RuleResult, RunLogLine, RunStatus, StepStatus } from '@covora/types'
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
  const ms = end - new Date(from).getTime()
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
}

const StepNode = ({ data }: NodeProps): React.JSX.Element => {
  const d = data as StepNodeData
  return (
    <div className={`fnode fnode--${d.status}${d.selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="fnode__handle" />
      <span className="fnode__icon">{STEP_GLYPH[d.status]}</span>
      <span className="fnode__body">
        <span className="fnode__name">{d.name}</span>
        <span className="fnode__status">{STEP_STATUS_LABEL[d.status]}</span>
      </span>
      <Handle type="source" position={Position.Right} className="fnode__handle" />
    </div>
  )
}

interface InputNodeData extends Record<string, unknown> {
  readonly kind: ReviewKind
  readonly thumb: string | null
  readonly fileCount: number | null
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

export const NODE_TYPES = { step: StepNode, input: InputNode, result: ResultNode }

export const LAYOUT: Record<string, { x: number; y: number }> = {
  input: { x: 0, y: 150 },
  ingest: { x: 230, y: 150 },
  deterministic: { x: 470, y: 50 },
  llm: { x: 470, y: 250 },
  coverage: { x: 720, y: 150 },
  gate: { x: 960, y: 150 },
  persist: { x: 1190, y: 150 },
  notify: { x: 1420, y: 150 },
  result: { x: 1650, y: 150 }
}

export const FLOW_EDGES: readonly (readonly [string, string])[] = [
  ['input', 'ingest'],
  ['ingest', 'deterministic'],
  ['ingest', 'llm'],
  ['deterministic', 'coverage'],
  ['llm', 'coverage'],
  ['coverage', 'gate'],
  ['gate', 'persist'],
  ['persist', 'notify'],
  ['notify', 'result']
]

export const STATUS_STROKE: Record<StepStatus, string> = {
  pending: 'var(--border-strong)',
  running: 'var(--accent)',
  succeeded: 'var(--pass)',
  skipped: 'var(--border-strong)',
  failed: 'var(--fail)',
  cancelled: 'var(--border-strong)'
}

export type { StepNodeData, InputNodeData, ResultNodeData }
export type { Edge, Node }
