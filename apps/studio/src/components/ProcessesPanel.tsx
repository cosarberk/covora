/**
 * @module studio/components/ProcessesPanel
 *
 * "Süreçler" — review pipeline'larının CI/CD tarzı görünümü. Üstte proje
 * seçici; altında run (pipeline) listesi durum rozetleriyle; bir run'a girince
 * adımları (job'ları) ve **canlı akan** log konsolu (SSE). Kuyruktaki run'lar
 * iptal edilebilir.
 */

import type { ReviewRun, RunLogLine, RunStatus, RunStep, RunSummary, StepStatus } from '@covora/types'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { StudioApi } from '../api/client.js'

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

const RUN_STATUS_CLASS: Record<RunStatus, string> = {
  queued: 'badge',
  running: 'badge',
  succeeded: 'badge badge--pass',
  degraded: 'badge',
  failed: 'badge badge--fail',
  cancelled: 'badge'
}

const STEP_ICON: Record<StepStatus, string> = {
  pending: '○',
  running: '◍',
  succeeded: '●',
  skipped: '–',
  failed: '✕',
  cancelled: '⊘'
}

const LOG_COLOR: Record<RunLogLine['level'], string> = {
  debug: '#6b7385',
  info: '#9aa0bd',
  warn: '#e0b05b',
  error: '#f26d6d'
}

const formatTime = (iso: string): string => new Date(iso).toLocaleTimeString('tr-TR')

/** Tek bir run'ın canlı detayı: adımlar + log konsolu. */
const RunDetail = ({
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
  const consoleRef = useRef<HTMLDivElement | null>(null)

  // onChanged'i ref'te tut: aksi halde her render'da kimliği değişip aboneliği
  // yeniden kurar ve sonsuz render/yeniden-bağlanma döngüsüne yol açar.
  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    onChangedRef.current = onChanged
  }, [onChanged])

  useEffect(() => {
    let active = true
    setRun(null)
    setLogs([])

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
          setRun((current) =>
            current === null ? current : { ...current, status: event.status }
          )
          onChangedRef.current()
          break
        case 'step.updated':
          setRun((current) => {
            if (current === null) {
              return current
            }
            const steps = current.steps.map((step) =>
              step.key === event.step.key ? event.step : step
            )
            return { ...current, steps }
          })
          break
        case 'log.appended':
          setLogs((current) =>
            current.some((line) => line.seq === event.line.seq)
              ? current
              : [...current, event.line]
          )
          break
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [api, runId])

  // Yeni log geldikçe konsolu en alta kaydır.
  useEffect(() => {
    const el = consoleRef.current
    if (el !== null) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs])

  const cancel = async (): Promise<void> => {
    try {
      await api.cancelRun(runId)
      onChanged()
    } catch {
      // Kuyrukta değilse iptal edilemez; yoksay.
    }
  }

  if (run === null) {
    return <div className="state">Yükleniyor…</div>
  }

  return (
    <div className="run-detail">
      <div className="run-detail__head">
        <span className={RUN_STATUS_CLASS[run.status]}>{RUN_STATUS_LABEL[run.status]}</span>
        <span className="mono">{run.kind}</span>
        <span className="mono">{run.codeHash.slice(0, 12)}</span>
        {run.queuePosition !== undefined && <span className="badge">sıra {run.queuePosition}</span>}
        {run.status === 'queued' && (
          <button type="button" className="link-button" onClick={() => void cancel()}>
            İptal et
          </button>
        )}
      </div>

      <ol className="steps">
        {[...run.steps]
          .sort((a, b) => a.order - b.order)
          .map((step: RunStep) => (
            <li key={step.key} className={`step step--${step.status}`}>
              <span className="step__icon">{STEP_ICON[step.status]}</span>
              <span className="step__name">{step.name}</span>
              <span className="step__status mono">{step.status}</span>
              {step.error !== undefined && <span className="step__error">{step.error}</span>}
            </li>
          ))}
      </ol>

      <div className="console" ref={consoleRef}>
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

/**
 * Süreçler paneli.
 *
 * @param props - API ve proje listesi.
 */
export const ProcessesPanel = ({ api, projects }: ProcessesPanelProps): React.JSX.Element => {
  const [selectedProject, setSelectedProject] = useState<string>('')
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
    // Liste durumları için hafif yoklama (canlı olaylar açık run'da zaten gelir).
    const interval = setInterval(() => void load(), 5000)
    return () => clearInterval(interval)
  }, [load])

  return (
    <section className="processes">
      <div className="processes__bar">
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
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          Yenile
        </button>
      </div>

      {error !== null && <div className="state state--error">{error}</div>}

      {runs.length === 0 ? (
        <div className="state">Henüz pipeline yok. Bir review tetiklendiğinde burada görünür.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Durum</th>
              <th>Proje</th>
              <th>Tür</th>
              <th>Skor</th>
              <th>Gate</th>
              <th>Başlangıç</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className={run.id === openRunId ? 'row--active' : undefined}>
                <td>
                  <span className={RUN_STATUS_CLASS[run.status]}>
                    {RUN_STATUS_LABEL[run.status]}
                  </span>
                  {run.queuePosition !== undefined && (
                    <span className="badge">sıra {run.queuePosition}</span>
                  )}
                </td>
                <td className="mono">{run.projectKey}</td>
                <td>
                  <span className="badge">{run.kind}</span>
                </td>
                <td className="score">{run.score === null ? '—' : run.score.toFixed(1)}</td>
                <td>
                  {run.gatePassed === null ? (
                    '—'
                  ) : (
                    <span className={run.gatePassed ? 'badge badge--pass' : 'badge badge--fail'}>
                      {run.gatePassed ? 'Geçti' : 'Kaldı'}
                    </span>
                  )}
                </td>
                <td className="mono">{formatTime(run.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setOpenRunId(run.id === openRunId ? null : run.id)}
                  >
                    {run.id === openRunId ? 'Kapat' : 'Detay'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {openRunId !== null && <RunDetail api={api} runId={openRunId} onChanged={() => void load()} />}
    </section>
  )
}
