/**
 * @module studio/components/processes/useProcesses
 *
 * Süreçler görünümünün tüm durumunu yöneten hook. Efektler `enabled` ile
 * kapılıdır (görünüm aktif değilken ağ/akış yok). Run listesini yoklar, seçili
 * run'ı SSE ile canlı izler, girdiyi/raporu ve o projenin kurallarını getirir;
 * React Flow için **kural başına** node + dinamik düzen türetir. Çalışan
 * adımlar için canlı süre sayacı tutar ve kullanıcının sürüklediği node
 * konumlarını hatırlar. Kabuğun bölgeleri (Gezgin, viewport, Özellikler,
 * Konsol) bu hook'un döndürdüklerini tüketir.
 */

import type {
  ManagementRule,
  ReviewKind,
  ReviewRun,
  RunLogLine,
  RunStep,
  RunSummary
} from '@covora/types'
import { useNodesState, type OnNodesChange } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { RunInput, RunReport, StudioApi } from '../../api/client.js'
import { toast } from '../overlays.js'
import { COL_W, ROW_H, STATUS_STROKE, formatDuration, type Edge, type Node } from './graph.js'

/** Seçili node: girdi, bir adım, bir kural ya da sonuç. */
export type SelectedNode =
  | { readonly kind: 'input' }
  | { readonly kind: 'result' }
  | { readonly kind: 'step'; readonly key: string }
  | { readonly kind: 'rule'; readonly key: string }

const TERMINAL: readonly ReviewRun['status'][] = ['succeeded', 'degraded', 'failed', 'cancelled']

/** Kural node id'si (step anahtarlarıyla çakışmasın diye önekli). */
const ruleNodeId = (key: string): string => `rule:${key}`

/** İki node `data` nesnesini (düz, sığ) eşitlik için karşılaştırır. */
const shallowEqualData = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) {
    return false
  }
  for (const key of keys) {
    if (a[key] !== b[key]) {
      return false
    }
  }
  return true
}

/**
 * Yeni türetilen node'ları öncekilerle id'ye göre birleştirir: sürüklenen
 * pozisyon ve React Flow ölçümleri korunur, `data` yalnız gerçekten
 * değiştiyse yenilenir. Değişmeyen node'lar **aynı referansı** koruduğu için
 * React Flow onları yeniden render etmez (tek node sürüklerken tüm grafiğin
 * render olmasının önüne geçer).
 */
const mergeNodes = (prev: Node[], next: Node[]): Node[] => {
  const prevById = new Map(prev.map((node) => [node.id, node]))
  return next.map((node) => {
    const old = prevById.get(node.id)
    if (old === undefined) {
      return node
    }
    const data = shallowEqualData(old.data, node.data) ? old.data : node.data
    if (data === old.data && old.type === node.type) {
      return old
    }
    return { ...old, type: node.type, data }
  })
}

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
  readonly rules: readonly ManagementRule[]
  readonly thumb: string | null
  readonly selected: SelectedNode | null
  readonly selectNode: (id: string) => void
  readonly clearSelection: () => void
  readonly nodes: Node[]
  readonly edges: Edge[]
  readonly onNodesChange: OnNodesChange<Node>
  readonly resetLayout: () => void
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
  const [rules, setRules] = useState<readonly ManagementRule[]>([])
  const [selected, setSelected] = useState<SelectedNode | null>(null)
  const [tick, setTick] = useState(0)
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
    setRules([])
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

  // Açık run'ın projesi + türü (özetten; run yüklenmeden de bilinir).
  const openSummary = useMemo(
    () => runs.find((item) => item.id === openRunId) ?? null,
    [runs, openRunId]
  )
  const projectKey = run?.projectKey ?? openSummary?.projectKey ?? null
  const runKind = run?.kind ?? openSummary?.kind ?? null

  // O projenin kuralları (kural başına node için). Türe göre süzülür.
  useEffect(() => {
    if (!enabled || projectKey === null) {
      return
    }
    let active = true
    api
      .listRules(projectKey)
      .then((list) => {
        if (active) {
          setRules(list)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, enabled, projectKey])

  // Rapor (terminal + reviewId).
  const status = run?.status
  const reviewId = run?.reviewId
  useEffect(() => {
    if (
      !enabled ||
      openRunId === null ||
      status === undefined ||
      !TERMINAL.includes(status) ||
      reviewId === undefined
    ) {
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

  // Canlı süre sayacı: run terminal değilken saniyede bir tetikle.
  useEffect(() => {
    if (!enabled || run === null || TERMINAL.includes(run.status)) {
      return
    }
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [enabled, run])

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

  // Bu run'ın türüne ait kurallar, değerlendirme tipine göre ayrılmış.
  const relevantRules = useMemo(
    () => (runKind === null ? [] : rules.filter((rule) => rule.kind === runKind)),
    [rules, runKind]
  )
  const detRules = useMemo(
    () => relevantRules.filter((rule) => rule.evaluation === 'deterministic'),
    [relevantRules]
  )
  const llmRules = useMemo(
    () => relevantRules.filter((rule) => rule.evaluation === 'llm'),
    [relevantRules]
  )

  // Rapor sonuçları kural anahtarına göre (motor rule.key'i ruleId olarak yazar).
  const outcomeByKey = useMemo(() => {
    const map = new Map<string, RunReport['results'][number]['outcome']>()
    for (const result of report?.results ?? []) {
      map.set(result.ruleId, result.outcome)
    }
    return map
  }, [report])

  // Arzu edilen node düzeni + verisi: input → ingest → (det/llm adımları +
  // kural node'ları) → coverage → gate → persist → notify → result. Bu fonksiyon
  // yalnız hedef node'ları üretir; sürükleme pozisyonları React Flow state'inde
  // yaşar ve aşağıdaki sync efekti id'ye göre merge eder.
  const computeNodes = useCallback((): Node[] => {
    if (run === null) {
      return []
    }
    // `tick` bağımlılık olarak çalışan adımların canlı süresini yeniden
    // hesaplatır (formatDuration içeride Date.now() kullanır).
    const R = detRules.length
    const L = llmRules.length
    const groupGap = R > 0 && L > 0 ? 56 : 0
    const detY = detRules.map((_, i) => i * ROW_H)
    const llmBase = R * ROW_H + groupGap
    const llmY = llmRules.map((_, j) => llmBase + j * ROW_H)
    const allY = [...detY, ...llmY]
    const minY = allY.length > 0 ? Math.min(...allY) : 0
    const maxY = allY.length > 0 ? Math.max(...allY) : 0
    const midY = (minY + maxY) / 2
    // Kural olmayan tür için step'i `midY`'ye koymak det/llm kartlarını üst üste
    // bindiriyordu; o durumda sabit bir offset'le ayır (det üstte, llm altta).
    const detStepY = R > 0 ? (detY[0]! + detY[R - 1]!) / 2 : midY - ROW_H / 2
    const llmStepY = L > 0 ? (llmY[0]! + llmY[L - 1]!) / 2 : midY + ROW_H / 2

    const stepDetail = (step: RunStep, ruleCount: number): string | null => {
      if (step.status === 'running') {
        return formatDuration(step.startedAt)
      }
      if (step.startedAt !== undefined && step.finishedAt !== undefined) {
        return formatDuration(step.startedAt, step.finishedAt)
      }
      return ruleCount > 0 ? `${ruleCount} kural` : null
    }

    const list: Node[] = []

    // Girdi
    list.push({
      id: 'input',
      type: 'reviewInput',
      position: { x: 0, y: midY },
      data: {
        kind: run.kind,
        thumb,
        fileCount: input !== null && input.input.kind === 'code' ? input.input.files.length : null,
        hasSource: run.origin?.refUrl !== undefined,
        selected: selected?.kind === 'input'
      }
    })

    // Omurga adımları (rule olmayanlar) + det/llm adımları
    for (const step of run.steps) {
      const isDet = step.key === 'deterministic'
      const isLlm = step.key === 'llm'
      const col =
        step.key === 'ingest'
          ? 1
          : isDet || isLlm
            ? 2
            : step.key === 'coverage'
              ? 4
              : step.key === 'gate'
                ? 5
                : step.key === 'persist'
                  ? 6
                  : 7 // notify
      const y = isDet ? detStepY : isLlm ? llmStepY : midY
      const ruleCount = isDet ? R : isLlm ? L : 0
      list.push({
        id: step.key,
        type: 'step',
        position: { x: col * COL_W, y },
        data: {
          name: step.name,
          status: step.status,
          detail: stepDetail(step, ruleCount),
          selected: selected?.kind === 'step' && selected.key === step.key
        }
      })
    }

    // Kural node'ları (deterministik üstte, AI altta)
    const detStep = run.steps.find((s) => s.key === 'deterministic')
    const llmStep = run.steps.find((s) => s.key === 'llm')
    detRules.forEach((rule, i) => {
      list.push({
        id: ruleNodeId(rule.key),
        type: 'rule',
        position: { x: 3 * COL_W, y: detY[i]! },
        data: {
          title: rule.title,
          evaluation: rule.evaluation,
          severity: rule.severity,
          weight: rule.weight,
          outcome: outcomeByKey.get(rule.key) ?? null,
          running: detStep?.status === 'running',
          selected: selected?.kind === 'rule' && selected.key === rule.key
        }
      })
    })
    llmRules.forEach((rule, j) => {
      list.push({
        id: ruleNodeId(rule.key),
        type: 'rule',
        position: { x: 3 * COL_W, y: llmY[j]! },
        data: {
          title: rule.title,
          evaluation: rule.evaluation,
          severity: rule.severity,
          weight: rule.weight,
          outcome: outcomeByKey.get(rule.key) ?? null,
          running: llmStep?.status === 'running',
          selected: selected?.kind === 'rule' && selected.key === rule.key
        }
      })
    })

    // Sonuç
    list.push({
      id: 'result',
      type: 'result',
      position: { x: 8 * COL_W, y: midY },
      data: {
        score: run.score ?? null,
        level: run.level ?? null,
        gatePassed: run.gatePassed ?? null,
        selected: selected?.kind === 'result'
      }
    })

    return list
  }, [run, input, thumb, selected, detRules, llmRules, outcomeByKey, tick])

  // React Flow kontrollü node state'i: sürükleme/ölçüm değişiklikleri
  // `onNodesChange` (applyNodeChanges) ile uygulanır; veri değişince aşağıdaki
  // efekt id-bazlı merge eder. Böylece her render'da node'lar sıfırdan
  // üretilmez, tek node sürüklerken yalnız o node render olur.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  useEffect(() => {
    setNodes((prev) => mergeNodes(prev, computeNodes()))
  }, [computeNodes, setNodes])

  // Kenarlar: omurga + kural dalları. Uç noktalardan biri çalışıyorsa animasyonlu.
  const edges = useMemo<Edge[]>(() => {
    if (run === null) {
      return []
    }
    const stepStatus = (key: string): RunStep['status'] | null => stepByKey.get(key)?.status ?? null
    const running = (key: string): boolean => stepStatus(key) === 'running'
    const strokeFor = (srcKey: string): string => {
      const s = stepStatus(srcKey)
      return s !== null ? STATUS_STROKE[s] : 'var(--border-strong)'
    }
    const mk = (source: string, target: string, srcKey: string, tgtKey: string): Edge => ({
      id: `${source}->${target}`,
      source,
      target,
      animated: running(srcKey) || running(tgtKey),
      style: { stroke: strokeFor(srcKey), strokeWidth: 2 }
    })

    const list: Edge[] = []
    const hasDet = run.steps.some((s) => s.key === 'deterministic')
    const hasLlm = run.steps.some((s) => s.key === 'llm')

    list.push(mk('input', 'ingest', 'ingest', 'ingest'))
    if (hasDet) {
      list.push(mk('ingest', 'deterministic', 'ingest', 'deterministic'))
      if (detRules.length === 0) {
        list.push(mk('deterministic', 'coverage', 'deterministic', 'coverage'))
      }
      for (const rule of detRules) {
        list.push(mk('deterministic', ruleNodeId(rule.key), 'deterministic', 'deterministic'))
        list.push(mk(ruleNodeId(rule.key), 'coverage', 'deterministic', 'coverage'))
      }
    }
    if (hasLlm) {
      list.push(mk('ingest', 'llm', 'ingest', 'llm'))
      if (llmRules.length === 0) {
        list.push(mk('llm', 'coverage', 'llm', 'coverage'))
      }
      for (const rule of llmRules) {
        list.push(mk('llm', ruleNodeId(rule.key), 'llm', 'llm'))
        list.push(mk(ruleNodeId(rule.key), 'coverage', 'llm', 'coverage'))
      }
    }
    if (!hasDet && !hasLlm) {
      list.push(mk('ingest', 'coverage', 'ingest', 'coverage'))
    }
    list.push(mk('coverage', 'gate', 'coverage', 'gate'))
    list.push(mk('gate', 'persist', 'gate', 'persist'))
    list.push(mk('persist', 'notify', 'persist', 'notify'))
    list.push(mk('notify', 'result', 'notify', 'notify'))
    return list
  }, [run, stepByKey, detRules, llmRules])

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
    } else if (id.startsWith('rule:')) {
      setSelected({ kind: 'rule', key: id.slice('rule:'.length) })
    } else {
      setSelected({ kind: 'step', key: id })
    }
  }, [])

  const clearSelection = useCallback(() => setSelected(null), [])

  // Düzeni sıfırla: sürükleme pozisyonlarını atıp hesaplanan düzene dön.
  const resetLayout = useCallback(() => setNodes(computeNodes()), [computeNodes, setNodes])

  const cancel = useCallback((): void => {
    if (openRunId === null) {
      return
    }
    void api
      .cancelRun(openRunId)
      .then(() => toast.info('Çalıştırma iptal ediliyor'))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : 'İptal edilemedi'))
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
    rules: relevantRules,
    thumb,
    selected,
    selectNode,
    clearSelection,
    nodes,
    edges,
    onNodesChange,
    resetLayout,
    stepByKey,
    cancel,
    error
  }
}
