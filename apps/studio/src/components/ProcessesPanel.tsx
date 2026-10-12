/**
 * @module studio/components/ProcessesPanel
 *
 * "Süreçler" — review pipeline'larının canlı, görsel (node-tabanlı) görünümü.
 * Sol: run listesi (proje + tür filtreli). Orta: seçili run'ın **React Flow**
 * akış şeması (girdi → ingest → deterministik ‖ AI → coverage → gate → kayıt →
 * bildirim → sonuç), canlı renkli node'lar ve animasyonlu kenarlar; altta canlı
 * log konsolu. Sağ: tıklanan node'un detayı — gönderilen ekran görüntüsü, adım
 * logları/süresi ya da kural-kural rapor ve gate gerekçeleri.
 */

import type {
  ReviewKind,
  ReviewRun,
  RuleResult,
  RunLogLine,
  RunStatus,
  RunStep,
  RunSummary,
  StepStatus
} from '@covora/types'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { RunInput, RunReport, StudioApi } from '../api/client.js'

/** {@link ProcessesPanel} props. */
export interface ProcessesPanelProps {
  readonly api: StudioApi
  readonly projects: readonly { readonly key: string; readonly name: string }[]
}

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Kuyrukta',
  running: 'Çalışıyor',
  succeeded: 'Başarılı',
  degraded: 'Kısmi (AI hata)',
  failed: 'Hata',
  cancelled: 'İptal'
}

const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: 'Bekliyor',
  running: 'Çalışıyor',
  succeeded: 'Tamam',
  skipped: 'Atlandı',
  failed: 'Hata',
  cancelled: 'İptal'
}

const STEP_ICON: Record<StepStatus, string> = {
  pending: '○',
  running: '◍',
  succeeded: '✓',
  skipped: '–',
  failed: '✕',
  cancelled: '⊘'
}

const OUTCOME_LABEL: Record<RuleResult['outcome'], string> = {
  pass: 'Geçti',
  partial: 'Kısmi',
  fail: 'Kaldı'
}

const LOG_COLOR: Record<RunLogLine['level'], string> = {
  debug: 'var(--text-faint)',
  info: 'var(--text-dim)',
  warn: 'var(--warn)',
  error: 'var(--fail)'
}

const TERMINAL: readonly RunStatus[] = ['succeeded', 'degraded', 'failed', 'cancelled']

const formatTime = (iso: string): string => new Date(iso).toLocaleTimeString('tr-TR')

/** İki ISO zaman damgası arasındaki süreyi insan-okunur verir. */
const formatDuration = (from?: string, to?: string): string | null => {
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

/** Base64 uzunluğundan yaklaşık byte boyutu (KB). */
const approxKb = (base64: string): number => Math.round((base64.length * 3) / 4 / 1024)

/* ------------------------------------------------------------------ *
 * React Flow — özel node'lar
 * ------------------------------------------------------------------ */

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
      <span className="fnode__icon">{STEP_ICON[d.status]}</span>
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
          <span className="fnode__placeholder">🖼️ ekran görüntüsü</span>
        )
      ) : (
        <span className="fnode__placeholder">📄 {d.fileCount ?? '?'} dosya</span>
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

const NODE_TYPES = { step: StepNode, input: InputNode, result: ResultNode }

/** Akış şemasındaki sabit düzen (soldan sağa; deterministik/AI paralel). */
const LAYOUT: Record<string, { x: number; y: number }> = {
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

const EDGES: readonly (readonly [string, string])[] = [
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

const STATUS_STROKE: Record<StepStatus, string> = {
  pending: 'var(--border-strong)',
  running: 'var(--accent)',
  succeeded: 'var(--pass)',
  skipped: 'var(--border-strong)',
  failed: 'var(--fail)',
  cancelled: 'var(--border-strong)'
}

/** Seçili node tanımı: girdi, bir adım ya da sonuç. */
type Selected =
  | { readonly kind: 'input' }
  | { readonly kind: 'result' }
  | { readonly kind: 'step'; readonly key: string }

/* ------------------------------------------------------------------ *
 * Seçili run: akış + konsol + detay
 * ------------------------------------------------------------------ */

const RunWorkspace = ({
  api,
  runId,
  onChanged
}: {
  readonly api: StudioApi
  readonly runId: string
  readonly onChanged: () => void
}): React.JSX.Element => {
  const [run, setRun] = useState<ReviewRun | null>(null)
  const [logs, setLogs] = useState<RunLogLine[]>([])
  const [input, setInput] = useState<RunInput | null>(null)
  const [report, setReport] = useState<RunReport | null>(null)
  const [selected, setSelected] = useState<Selected | null>(null)
  const consoleRef = useRef<HTMLDivElement | null>(null)

  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    onChangedRef.current = onChanged
  }, [onChanged])

  // Canlı akış (SSE): run + loglar.
  useEffect(() => {
    let active = true
    setRun(null)
    setLogs([])
    setInput(null)
    setReport(null)
    setSelected(null)

    const unsubscribe = api.streamRun(runId, (event) => {
      if (!active) {
        return
      }
      switch (event.type) {
        case 'run.created':
          setRun(event.run)
          break
        case 'run.finished':
          setRun(event.run)
          onChangedRef.current()
          break
        case 'run.updated':
          setRun((cur) => (cur === null ? cur : { ...cur, status: event.status }))
          onChangedRef.current()
          break
        case 'step.updated':
          setRun((cur) =>
            cur === null
              ? cur
              : { ...cur, steps: cur.steps.map((s) => (s.key === event.step.key ? event.step : s)) }
          )
          break
        case 'log.appended':
          setLogs((cur) =>
            cur.some((l) => l.seq === event.line.seq) ? cur : [...cur, event.line]
          )
          break
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [api, runId])

  // Girdiyi (ekran görüntüsü / dosyalar) bir kez getir.
  useEffect(() => {
    let active = true
    api
      .getRunInput(runId)
      .then((data) => {
        if (active) {
          setInput(data)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, runId])

  // Run bir review ürettiyse raporu getir (terminal + reviewId).
  const status = run?.status
  const reviewId = run?.reviewId
  useEffect(() => {
    if (status === undefined || !TERMINAL.includes(status) || reviewId === undefined) {
      return
    }
    let active = true
    api
      .getRunReport(runId)
      .then((data) => {
        if (active) {
          setReport(data)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, runId, status, reviewId])

  // Yeni log geldikçe konsolu en alta kaydır.
  useEffect(() => {
    const el = consoleRef.current
    if (el !== null) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs])

  const cancel = useCallback(async (): Promise<void> => {
    try {
      await api.cancelRun(runId)
      onChangedRef.current()
    } catch {
      // Kuyrukta değilse iptal edilemez.
    }
  }, [api, runId])

  const thumb = useMemo(
    () =>
      input !== null && input.kind === 'ui' && input.input.kind === 'ui'
        ? `data:image/png;base64,${input.input.screenshot}`
        : null,
    [input]
  )

  const stepByKey = useMemo(() => {
    const map = new Map<string, RunStep>()
    for (const step of run?.steps ?? []) {
      map.set(step.key, step)
    }
    return map
  }, [run])

  // Node'lar & kenarlar (run + girdiden türetilir).
  const nodes = useMemo<Node[]>(() => {
    if (run === null) {
      return []
    }
    const list: Node[] = [
      {
        id: 'input',
        type: 'input',
        position: LAYOUT.input ?? { x: 0, y: 150 },
        data: {
          kind: run.kind,
          thumb,
          fileCount:
            input !== null && input.input.kind === 'code' ? input.input.files.length : null,
          selected: selected?.kind === 'input'
        } satisfies InputNodeData,
        draggable: false
      },
      ...run.steps.map(
        (step): Node => ({
          id: step.key,
          type: 'step',
          position: LAYOUT[step.key] ?? { x: 0, y: 0 },
          data: {
            name: step.name,
            status: step.status,
            selected: selected?.kind === 'step' && selected.key === step.key
          } satisfies StepNodeData,
          draggable: false
        })
      ),
      {
        id: 'result',
        type: 'result',
        position: LAYOUT.result ?? { x: 1650, y: 150 },
        data: {
          score: run.score ?? null,
          level: run.level ?? null,
          gatePassed: run.gatePassed ?? null,
          selected: selected?.kind === 'result'
        } satisfies ResultNodeData,
        draggable: false
      }
    ]
    return list
  }, [run, input, thumb, selected])

  const edges = useMemo<Edge[]>(
    () =>
      EDGES.map(([source, target]) => {
        const sourceStep = stepByKey.get(source)
        const targetStep = stepByKey.get(target)
        const stroke =
          sourceStep !== undefined ? STATUS_STROKE[sourceStep.status] : 'var(--border-strong)'
        const animated = targetStep?.status === 'running' || sourceStep?.status === 'running'
        return {
          id: `${source}-${target}`,
          source,
          target,
          animated,
          style: { stroke, strokeWidth: 2 }
        }
      }),
    [stepByKey]
  )

  if (run === null) {
    return <div className="state">Yükleniyor…</div>
  }

  const onNodeClick = (_: unknown, node: Node): void => {
    if (node.id === 'input') {
      setSelected({ kind: 'input' })
    } else if (node.id === 'result') {
      setSelected({ kind: 'result' })
    } else {
      setSelected({ kind: 'step', key: node.id })
    }
  }

  return (
    <div className="proc-ws">
      <div className="proc-ws__head">
        <span className={`badge badge--run-${run.status}`}>{RUN_STATUS_LABEL[run.status]}</span>
        <span className="badge">{run.kind}</span>
        <span className="mono proc-ws__hash">{run.codeHash}</span>
        {run.delta !== null && run.delta !== undefined && (
          <span className={`badge ${run.delta < 0 ? 'badge--fail' : 'badge--pass'}`}>
            Δ {run.delta > 0 ? '+' : ''}
            {run.delta.toFixed(1)}
          </span>
        )}
        <span className="proc-ws__spacer" />
        {formatDuration(run.startedAt, run.finishedAt) !== null && (
          <span className="mono proc-ws__time">
            ⏱ {formatDuration(run.startedAt, run.finishedAt)}
          </span>
        )}
        {run.status === 'queued' && (
          <button type="button" className="btn-secondary" onClick={() => void cancel()}>
            İptal et
          </button>
        )}
      </div>

      <div className="proc-ws__body">
        <div className="proc-ws__canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={1.5}
          >
            <Background color="var(--border)" gap={22} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="proc-minimap" />
          </ReactFlow>
        </div>

        {selected !== null && (
          <aside className="proc-detail">
            <div className="proc-detail__head">
              <strong>{detailTitle(selected, stepByKey)}</strong>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelected(null)}
                title="Kapat"
              >
                ×
              </button>
            </div>
            <div className="proc-detail__body">
              <DetailBody
                selected={selected}
                run={run}
                logs={logs}
                input={input}
                thumb={thumb}
                report={report}
                stepByKey={stepByKey}
              />
            </div>
          </aside>
        )}
      </div>

      <div className="proc-console" ref={consoleRef}>
        {logs.length === 0 ? (
          <div className="console__empty">Henüz log yok…</div>
        ) : (
          logs.map((line) => (
            <div key={line.seq} className="console__line">
              <span className="console__ts">{formatTime(line.at)}</span>
              {line.stepKey !== undefined && <span className="console__step">{line.stepKey}</span>}
              <span style={{ color: LOG_COLOR[line.level] }}>{line.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const detailTitle = (selected: Selected, stepByKey: Map<string, RunStep>): string => {
  if (selected.kind === 'input') {
    return 'Gönderilen girdi'
  }
  if (selected.kind === 'result') {
    return 'Review raporu'
  }
  return stepByKey.get(selected.key)?.name ?? selected.key
}

/** Detay panelinin içeriği (seçime göre). */
const DetailBody = ({
  selected,
  run,
  logs,
  input,
  thumb,
  report,
  stepByKey
}: {
  readonly selected: Selected
  readonly run: ReviewRun
  readonly logs: readonly RunLogLine[]
  readonly input: RunInput | null
  readonly thumb: string | null
  readonly report: RunReport | null
  readonly stepByKey: Map<string, RunStep>
}): React.JSX.Element => {
  if (selected.kind === 'input') {
    if (input === null) {
      return <div className="state">Girdi yükleniyor…</div>
    }
    if (input.input.kind === 'ui') {
      return (
        <div className="detail-input">
          {thumb !== null && (
            <a href={thumb} target="_blank" rel="noreferrer">
              <img className="detail-input__img" src={thumb} alt="Gönderilen ekran görüntüsü" />
            </a>
          )}
          <dl className="kv">
            <dt>Tür</dt>
            <dd>UI (ekran görüntüsü)</dd>
            <dt>Boyut</dt>
            <dd>~{approxKb(input.input.screenshot)} KB (base64)</dd>
            <dt>Client kontrol</dt>
            <dd>{input.input.clientResults?.length ?? 0} sonuç</dd>
          </dl>
          <p className="detail-hint">Tam boyut için görsele tıkla (yeni sekme).</p>
        </div>
      )
    }
    return (
      <div className="detail-input">
        <dl className="kv">
          <dt>Tür</dt>
          <dd>Code ({input.input.files.length} dosya)</dd>
        </dl>
        <ul className="file-list">
          {input.input.files.map((file) => (
            <li key={file.path} className="mono">
              {file.path} <span className="file-list__size">{file.content.length} b</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (selected.kind === 'step') {
    const step = stepByKey.get(selected.key)
    const stepLogs = logs.filter((l) => l.stepKey === selected.key)
    return (
      <div className="detail-step">
        <dl className="kv">
          <dt>Durum</dt>
          <dd>{step !== undefined ? STEP_STATUS_LABEL[step.status] : '—'}</dd>
          <dt>Süre</dt>
          <dd>{formatDuration(step?.startedAt, step?.finishedAt) ?? '—'}</dd>
          {step?.error !== undefined && (
            <>
              <dt>Hata</dt>
              <dd className="detail-err">{step.error}</dd>
            </>
          )}
        </dl>
        <div className="detail-sub">Bu adımın logları</div>
        <div className="detail-logs">
          {stepLogs.length === 0 ? (
            <div className="console__empty">Log yok</div>
          ) : (
            stepLogs.map((line) => (
              <div key={line.seq} className="console__line">
                <span className="console__ts">{formatTime(line.at)}</span>
                <span style={{ color: LOG_COLOR[line.level] }}>{line.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // selected.kind === 'result'
  const coverage = report?.outcome?.coverage ?? null
  const gate = report?.outcome?.gate ?? null
  const results: readonly RuleResult[] = report?.results ?? []
  return (
    <div className="detail-report">
      <div className="report-score">
        <div className="report-score__num">
          {run.score === null || run.score === undefined ? '—' : run.score.toFixed(1)}
        </div>
        <div className="report-score__meta">
          <span>seviye {run.level ?? '—'}</span>
          <span
            className={`badge ${run.gatePassed ? 'badge--pass' : run.gatePassed === false ? 'badge--fail' : ''}`}
          >
            {run.gatePassed === null || run.gatePassed === undefined
              ? '—'
              : run.gatePassed
                ? 'Gate GEÇTİ'
                : 'Gate KALDI'}
          </span>
        </div>
      </div>

      {coverage !== null && (
        <dl className="kv">
          <dt>Ağırlık</dt>
          <dd>
            {coverage.earnedWeight.toFixed(1)} / {coverage.totalWeight.toFixed(1)} kazanıldı
          </dd>
          {coverage.failedBlockers.length > 0 && (
            <>
              <dt>Uyumsuz blocker</dt>
              <dd className="detail-err">{coverage.failedBlockers.join(', ')}</dd>
            </>
          )}
        </dl>
      )}

      {gate !== null && !gate.passed && gate.reasons.length > 0 && (
        <div className="report-reasons">
          <div className="detail-sub">Gate neden kaldı</div>
          <ul>
            {gate.reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="detail-sub">Kural sonuçları ({results.length})</div>
      {results.length === 0 ? (
        <div className="console__empty">
          {report === null ? 'Rapor yükleniyor ya da bu run sonuç üretmedi.' : 'Sonuç yok.'}
        </div>
      ) : (
        <ul className="rule-results">
          {results.map((result) => (
            <li key={result.ruleId} className={`rule-result rule-result--${result.outcome}`}>
              <span className="rule-result__dot" />
              <div className="rule-result__main">
                <span className="rule-result__id mono">{result.ruleId}</span>
                {result.note !== undefined && (
                  <span className="rule-result__note">{result.note}</span>
                )}
              </div>
              <span className={`badge badge--${result.outcome}`}>
                {OUTCOME_LABEL[result.outcome]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Panel: liste + seçili run
 * ------------------------------------------------------------------ */

/**
 * Süreçler paneli.
 *
 * @param props - API ve proje listesi.
 */
export const ProcessesPanel = ({ api, projects }: ProcessesPanelProps): React.JSX.Element => {
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [kindFilter, setKindFilter] = useState<'' | ReviewKind>('')
  const [runs, setRuns] = useState<readonly RunSummary[]>([])
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      setRuns(await api.listRuns(selectedProject === '' ? undefined : selectedProject))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }, [api, selectedProject])

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), 5000)
    return () => clearInterval(interval)
  }, [load])

  const visibleRuns = useMemo(
    () => (kindFilter === '' ? runs : runs.filter((run) => run.kind === kindFilter)),
    [runs, kindFilter]
  )

  return (
    <section className="proc">
      <aside className="proc__list">
        <div className="proc__filters">
          <select
            className="select"
            value={selectedProject}
            onChange={(event) => setSelectedProject(event.target.value)}
          >
            <option value="">Tüm projeler</option>
            {projects.map((project) => (
              <option key={project.key} value={project.key}>
                {project.name}
              </option>
            ))}
          </select>
          <div className="segmented">
            {(['', 'ui', 'code'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={kindFilter === value ? 'segmented__btn is-active' : 'segmented__btn'}
                onClick={() => setKindFilter(value)}
              >
                {value === '' ? 'Hepsi' : value}
              </button>
            ))}
          </div>
        </div>

        {error !== null && <div className="state state--error">{error}</div>}

        <div className="proc__runs">
          {visibleRuns.length === 0 ? (
            <div className="state">Henüz pipeline yok.</div>
          ) : (
            visibleRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                className={run.id === openRunId ? 'runcard is-active' : 'runcard'}
                onClick={() => setOpenRunId(run.id)}
              >
                <span className="runcard__top">
                  <span className={`status-dot status-dot--${run.status}`} />
                  <span className="runcard__kind">{run.kind}</span>
                  <span className="runcard__score">
                    {run.score === null ? '—' : run.score.toFixed(0)}
                  </span>
                  {run.gatePassed !== null && (
                    <span className={run.gatePassed ? 'pill pill--pass' : 'pill pill--fail'}>
                      {run.gatePassed ? 'geçti' : 'kaldı'}
                    </span>
                  )}
                </span>
                <span className="runcard__bottom">
                  <span className="mono runcard__project">{run.projectKey}</span>
                  <span className="runcard__time">{formatTime(run.createdAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="proc__stage">
        {openRunId === null ? (
          <div className="proc__empty">
            <div className="proc__empty-icon">🔧</div>
            Soldan bir pipeline seç — akışı, gönderilen görseli ve raporu burada göreceksin.
          </div>
        ) : (
          <RunWorkspace api={api} runId={openRunId} onChanged={() => void load()} />
        )}
      </div>
    </section>
  )
}
