/**
 * @module studio/components/processes/useProcesses
 *
 * Süreçler görünümünün tüm durumunu yöneten hook. Efektler `enabled` ile
 * kapılıdır (görünüm aktif değilken ağ/akış yok). Run listesini yoklar, seçili
 * run'ı SSE ile canlı izler, girdiyi ve raporu getirir ve React Flow için
 * node/edge türetir. Kabuğun bölgeleri (Gezgin, viewport, Özellikler, Konsol)
 * bu hook'un döndürdüklerini tüketir.
 */

import type {
  ReviewKind,
  ReviewRun,
  RunLogLine,
  RunStep,
  RunSummary
} from '@covora/types'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { RunInput, RunReport, StudioApi } from '../../api/client.js'
import { FLOW_EDGES, LAYOUT, STATUS_STROKE, type Edge, type Node } from './graph.js'

/** Seçili node: girdi, bir adım ya da sonuç. */
export type SelectedNode =
  | { readonly kind: 'input' }
  | { readonly kind: 'result' }
  | { readonly kind: 'step'; readonly key: string }

const TERMINAL: readonly ReviewRun['status'][] = ['succeeded', 'degraded', 'failed', 'cancelled']

/** {@link useProcesses} dönüşü. */
export interface ProcessesState {
  readonly selectedProject: string
  readonly setSelectedProject: (key: string) => void
  readonly kindFilter: '' | ReviewKind
  readonly setKindFilter: (value: '' | ReviewKind) => void
  readonly runs: readonly RunSummary[]
  readonly openRunId: string | null
  readonly openRun: (id: string) => void
  readonly run: ReviewRun | null
  readonly logs: readonly RunLogLine[]
  readonly input: RunInput | null
  readonly report: RunReport | null
  readonly thumb: string | null
  readonly selected: SelectedNode | null
  readonly selectNode: (id: string) => void
  readonly clearSelection: () => void
  readonly nodes: Node[]
  readonly edges: Edge[]
  readonly stepByKey: Map<string, RunStep>
  readonly cancel: () => void
  readonly error: string | null
}

/** Süreçler durumunu yönetir. */
export const useProcesses = (api: StudioApi, enabled: boolean): ProcessesState => {
  const [selectedProject, setSelectedProject] = useState('')
  const [kindFilter, setKindFilter] = useState<'' | ReviewKind>('')
  const [runs, setRuns] = useState<readonly RunSummary[]>([])
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [run, setRun] = useState<ReviewRun | null>(null)
  const [logs, setLogs] = useState<RunLogLine[]>([])
  const [input, setInput] = useState<RunInput | null>(null)
  const [report, setReport] = useState<RunReport | null>(null)
  const [selected, setSelected] = useState<SelectedNode | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Run listesi + hafif yoklama.
  useEffect(() => {
    if (!enabled) {
      return
    }
    let active = true
    const load = async (): Promise<void> => {
      try {
        const list = await api.listRuns(selectedProject === '' ? undefined : selectedProject)
        if (active) {
          setRuns(list)
          setError(null)
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
        }
      }
    }
    void load()
    const interval = setInterval(() => void load(), 5000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [api, enabled, selectedProject])

  // Seçili run: canlı akış (SSE).
  useEffect(() => {
    if (!enabled || openRunId === null) {
      return
    }
    let active = true
    setRun(null)
    setLogs([])
    setInput(null)
    setReport(null)
    setSelected(null)

    const unsubscribe = api.streamRun(openRunId, (event) => {
      if (!active) {
        return
      }
      switch (event.type) {
        case 'run.created':
          setRun(event.run)
          break
        case 'run.finished':
          setRun(event.run)
          break
        case 'run.updated':
          setRun((cur) => (cur === null ? cur : { ...cur, status: event.status }))
          break
        case 'step.updated':
          setRun((cur) =>
            cur === null
              ? cur
              : {
                  ...cur,
                  steps: cur.steps.map((s) => (s.key === event.step.key ? event.step : s))
                }
          )
          break
        case 'log.appended':
          setLogs((cur) => (cur.some((l) => l.seq === event.line.seq) ? cur : [...cur, event.line]))
          break
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [api, enabled, openRunId])

  // Girdi (ekran görüntüsü / dosyalar).
  useEffect(() => {
    if (!enabled || openRunId === null) {
      return
    }
    let active = true
    api
      .getRunInput(openRunId)
      .then((data) => {
        if (active) {
          setInput(data)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, enabled, openRunId])

  // Rapor (terminal + reviewId).
  const status = run?.status
  const reviewId = run?.reviewId
  useEffect(() => {
    if (!enabled || openRunId === null || status === undefined || !TERMINAL.includes(status) || reviewId === undefined) {
      return
    }
    let active = true
    api
      .getRunReport(openRunId)
      .then((data) => {
        if (active) {
          setReport(data)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, enabled, openRunId, status, reviewId])

  const visibleRuns = useMemo(
    () => (kindFilter === '' ? runs : runs.filter((item) => item.kind === kindFilter)),
    [runs, kindFilter]
  )

  const stepByKey = useMemo(() => {
    const map = new Map<string, RunStep>()
    for (const step of run?.steps ?? []) {
      map.set(step.key, step)
    }
    return map
  }, [run])

  const thumb = useMemo(
    () =>
      input !== null && input.input.kind === 'ui'
        ? `data:image/png;base64,${input.input.screenshot}`
        : null,
    [input]
  )

  const nodes = useMemo<Node[]>(() => {
    if (run === null) {
      return []
    }
    return [
      {
        id: 'input',
        type: 'input',
        position: LAYOUT.input ?? { x: 0, y: 150 },
        data: {
          kind: run.kind,
          thumb,
          fileCount: input !== null && input.input.kind === 'code' ? input.input.files.length : null,
          selected: selected?.kind === 'input'
        },
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
          },
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
        },
        draggable: false
      }
    ]
  }, [run, input, thumb, selected])

  const edges = useMemo<Edge[]>(
    () =>
      FLOW_EDGES.map(([source, target]) => {
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

  // Liste geldiğinde ve hiçbir run açık değilken en yenisini otomatik seç.
  useEffect(() => {
    if (enabled && openRunId === null && visibleRuns.length > 0) {
      setOpenRunId(visibleRuns[0]!.id)
    }
  }, [enabled, openRunId, visibleRuns])

  const openRun = useCallback((id: string): void => {
    setOpenRunId(id)
    setSelected(null)
  }, [])

  const selectNode = useCallback((id: string): void => {
    if (id === 'input') {
      setSelected({ kind: 'input' })
    } else if (id === 'result') {
      setSelected({ kind: 'result' })
    } else {
      setSelected({ kind: 'step', key: id })
    }
  }, [])

  const clearSelection = useCallback(() => setSelected(null), [])

  const cancel = useCallback((): void => {
    if (openRunId === null) {
      return
    }
    void api.cancelRun(openRunId).catch(() => {})
  }, [api, openRunId])

  return {
    selectedProject,
    setSelectedProject,
    kindFilter,
    setKindFilter,
    runs: visibleRuns,
    openRunId,
    openRun,
    run,
    logs,
    input,
    report,
    thumb,
    selected,
    selectNode,
    clearSelection,
    nodes,
    edges,
    stepByKey,
    cancel,
    error
  }
}
