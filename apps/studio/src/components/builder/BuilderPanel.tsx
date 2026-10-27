/**
 * @module studio/components/builder/BuilderPanel
 *
 * Studio Builder — GERÇEK Blueprint editörü ve backend istemcisi. Palet node
 * türlerini `/node-types` defterinden çeker; graf backend'e versiyonlu kaydedilir
 * (localStorage değil); çalıştırma gerçek motoru tetikler ve node'lar SSE ile
 * CANLI yanar (durum/çıktı/log kablolardan ve motordan gelir — dekoratif değil).
 * Birden çok blueprint yönetilir: oluştur/aç/adlandır/çoğalt/sil + sürüm geçmişi.
 * Portlar tipli; yalnızca uyumlu tipler bağlanır, bir giriş tek kablo alır, kablo
 * boşluğa bırakılınca kopar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnEdgesChange,
  type OnNodesChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { FlowGraph } from '@covora/flow'

import type {
  BlueprintRunEvent,
  BlueprintRunLogLine,
  BlueprintSummary,
  BlueprintVersionSummary,
  StudioApi
} from '../../api/client.js'
import { toast } from '../overlays.js'
import {
  buildIndex,
  connectionCompatible,
  handleId,
  parseHandle,
  portType,
  SUBFLOW_TYPE,
  typeColor,
  type BlueprintInterface,
  type InterfaceIndex,
  type NodeTypeIndex,
  type NodeTypeMeta
} from './catalog.js'
import { BuilderContext, useBuilder, type BlueprintOption, type BuilderContextValue, type NodeRunState } from './context.js'
import { BUILDER_NODE_TYPES } from './GenericNode.js'
import { DND_FORMAT, Sidebar } from './Sidebar.js'
import type { RunStatus } from '@covora/types'

export interface BuilderPanelProps {
  readonly api: StudioApi
}

interface GenericData extends Record<string, unknown> {
  readonly nodeType: string
  readonly params: Record<string, unknown>
}

const randId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 8)}`

/** Çıkış portunun tipine göre kenar rengi. */
const edgeStyle = (
  index: NodeTypeIndex,
  sourceNodeType: string | undefined,
  sourcePortName: string
): { stroke: string; strokeWidth: number } => {
  const t = portType(index, sourceNodeType, 'out', sourcePortName)
  return { stroke: t !== undefined ? typeColor(t) : 'var(--accent)', strokeWidth: 2 }
}

/** Backend grafını React Flow node/edge'lerine çevirir. */
const graphToRf = (graph: FlowGraph, index: NodeTypeIndex): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'generic',
    position: n.position,
    data: { nodeType: n.type, params: { ...n.params } } satisfies GenericData
  }))
  const typeById = new Map(graph.nodes.map((n) => [n.id, n.type]))
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: handleId('out', e.sourceHandle),
    targetHandle: handleId('in', e.targetHandle),
    animated: true,
    reconnectable: true,
    style: edgeStyle(index, typeById.get(e.source), e.sourceHandle)
  }))
  return { nodes, edges }
}

/** React Flow node/edge'lerini backend grafına çevirir (handle öneki soyulur). */
const rfToGraph = (nodes: readonly Node[], edges: readonly Edge[]): FlowGraph => ({
  nodes: nodes.map((n) => {
    const d = n.data as GenericData
    return { id: n.id, type: d.nodeType, position: { x: n.position.x, y: n.position.y }, params: d.params ?? {} }
  }),
  edges: edges.flatMap((e) => {
    const s = parseHandle(e.sourceHandle)
    const t = parseHandle(e.targetHandle)
    if (s === null || t === null) return []
    return [{ id: e.id, source: e.source, sourceHandle: s.name, target: e.target, targetHandle: t.name }]
  })
})

const STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'kuyrukta',
  running: 'çalışıyor',
  succeeded: 'başarılı',
  degraded: 'kısmi',
  failed: 'başarısız',
  cancelled: 'iptal'
}

export const BuilderPanel = ({ api }: BuilderPanelProps): React.JSX.Element => {
  const [index, setIndex] = useState<NodeTypeIndex>(() => new Map())
  const [types, setTypes] = useState<readonly NodeTypeMeta[]>([])
  const [blueprints, setBlueprints] = useState<readonly BlueprintSummary[]>([])
  // blueprint anahtarı → dış arayüz (Alt-Blueprint node portları + tip kontrolü).
  const [interfaces, setInterfaces] = useState<Map<string, BlueprintInterface>>(() => new Map())
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [currentName, setCurrentName] = useState<string>('')
  const [versions, setVersions] = useState<readonly BlueprintVersionSummary[]>([])
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')

  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState<Edge>([])

  // Çalıştırma (SSE) durumu.
  const [runState, setRunState] = useState<Record<string, NodeRunState>>({})
  const [logs, setLogs] = useState<readonly BlueprintRunLogLine[]>([])
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null)
  const [running, setRunning] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)

  // isValidConnection handle'lardan çağrıldığı için güncel node'lara ref ile eriş.
  const nodesRef = useRef<Node[]>(nodes)
  nodesRef.current = nodes
  const indexRef = useRef<NodeTypeIndex>(index)
  indexRef.current = index
  const interfacesRef = useRef<InterfaceIndex>(interfaces)
  interfacesRef.current = interfaces

  // nodeId → bağlı giriş handle id'leri ("bağlı" rozeti + zorunlu kontrolü).
  const connectedInputs = useMemo<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {}
    for (const e of edges) {
      if (e.targetHandle == null) continue
      ;(m[e.target] ??= []).push(e.targetHandle)
    }
    return m
  }, [edges])

  // ── Yükleme ────────────────────────────────────────────────────────────
  const reloadBlueprints = useCallback(async (): Promise<readonly BlueprintSummary[]> => {
    const list = await api.listBlueprints()
    setBlueprints(list)
    return list
  }, [api])

  // Verilen anahtarların (eksik olanların) dış arayüzünü backend'den çekip belleğe
  // alır — Alt-Blueprint node'ları portlarını bu arayüzden çizer.
  const ensureInterfaces = useCallback(
    async (keys: readonly string[]): Promise<void> => {
      const missing = [...new Set(keys)].filter((k) => k !== '' && !interfacesRef.current.has(k))
      if (missing.length === 0) return
      const loaded = await Promise.all(
        missing.map(async (k) => {
          try {
            return [k, await api.getBlueprintInterface(k)] as const
          } catch {
            return null
          }
        })
      )
      setInterfaces((cur) => {
        const next = new Map(cur)
        for (const entry of loaded) if (entry !== null) next.set(entry[0], entry[1])
        return next
      })
    },
    [api]
  )

  const openBlueprint = useCallback(
    async (key: string, idx: NodeTypeIndex): Promise<void> => {
      try {
        const detail = await api.getBlueprint(key)
        const rf = graphToRf(detail.graph, idx)
        setCurrentKey(detail.key)
        setCurrentName(detail.name)
        setNodes(rf.nodes)
        setEdges(rf.edges)
        setRunState({})
        setLogs([])
        setRunStatus(null)
        setDirty(false)
        setVersions(await api.listBlueprintVersions(key))
      } catch (c) {
        toast.error(c instanceof Error ? c.message : 'Blueprint açılamadı')
      }
    },
    [api, setNodes, setEdges]
  )

  useEffect(() => {
    void (async () => {
      try {
        const metas = await api.listNodeTypes()
        const idx = buildIndex(metas)
        setTypes(metas)
        setIndex(idx)
        const list = await reloadBlueprints()
        if (list.length > 0) await openBlueprint(list[0]!.key, idx)
      } catch (c) {
        toast.error(c instanceof Error ? c.message : 'Builder yüklenemedi')
      }
    })()
    return () => {
      unsubRef.current?.()
    }
  }, [api, reloadBlueprints, openBlueprint])

  // Arayüzleri hazır tut: tüm blueprint'ler (seçici için) + canvas'taki subflow
  // node'larının referansları (portlarını çizmek için).
  useEffect(() => {
    if (blueprints.length > 0) void ensureInterfaces(blueprints.map((b) => b.key))
  }, [blueprints, ensureInterfaces])
  useEffect(() => {
    const keys = nodes
      .filter((n) => (n.data as GenericData).nodeType === SUBFLOW_TYPE)
      .map((n) => {
        const key = (n.data as GenericData).params?.blueprintKey
        return typeof key === 'string' ? key : ''
      })
      .filter((k) => k !== '')
    if (keys.length > 0) void ensureInterfaces(keys)
  }, [nodes, ensureInterfaces])

  // ── Graf düzenleme (değişiklikleri "kaydedilmemiş" işaretle) ──────────────
  const markDirtyFromNodeChanges = useCallback(
    (changes: NodeChange<Node>[]): void => {
      if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) setDirty(true)
      onNodesChangeRaw(changes)
    },
    [onNodesChangeRaw]
  )
  const markDirtyFromEdgeChanges = useCallback(
    (changes: EdgeChange<Edge>[]): void => {
      if (changes.some((c) => c.type !== 'select')) setDirty(true)
      onEdgesChangeRaw(changes)
    },
    [onEdgesChangeRaw]
  )

  const updateParam = useCallback(
    (nodeId: string, name: string, value: unknown): void => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          const d = n.data as GenericData
          return { ...n, data: { ...d, params: { ...d.params, [name]: value } } }
        })
      )
      setDirty(true)
    },
    [setNodes]
  )

  const removeNode = useCallback(
    (id: string): void => {
      setNodes((nds) => nds.filter((n) => n.id !== id))
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
      setDirty(true)
    },
    [setNodes, setEdges]
  )

  const duplicateNode = useCallback(
    (id: string): void => {
      setNodes((nds) => {
        const src = nds.find((n) => n.id === id)
        if (src === undefined) return nds
        const d = src.data as GenericData
        return [
          ...nds,
          {
            id: randId(d.nodeType),
            type: 'generic',
            position: { x: src.position.x + 48, y: src.position.y + 48 },
            data: { nodeType: d.nodeType, params: { ...d.params } } satisfies GenericData
          }
        ]
      })
      setDirty(true)
    },
    [setNodes]
  )

  const addNode = useCallback(
    (nodeType: string, position: { x: number; y: number }): void => {
      setNodes((nds) => [
        ...nds,
        { id: randId(nodeType), type: 'generic', position, data: { nodeType, params: {} } satisfies GenericData }
      ])
      setDirty(true)
    },
    [setNodes]
  )

  const isValidConnection = useCallback<IsValidConnection>(
    (conn) =>
      connectionCompatible(
        indexRef.current,
        interfacesRef.current,
        nodesRef.current.map((n) => ({
          id: n.id,
          data: { nodeType: (n.data as GenericData).nodeType, params: (n.data as GenericData).params }
        })),
        conn
      ),
    []
  )

  const onConnect = useCallback(
    (conn: Connection): void => {
      if (!isValidConnection(conn)) {
        toast.error('Uyumsuz portlar — yalnızca tipi uyan portlar bağlanır')
        return
      }
      const s = parseHandle(conn.sourceHandle)
      const srcNode = nodesRef.current.find((n) => n.id === conn.source)
      const style =
        s !== null ? edgeStyle(indexRef.current, (srcNode?.data as GenericData | undefined)?.nodeType, s.name) : undefined
      setEdges((eds) => {
        const pruned = eds.filter((e) => !(e.target === conn.target && e.targetHandle === conn.targetHandle))
        return addEdge({ ...conn, animated: true, reconnectable: true, ...(style ? { style } : {}) }, pruned)
      })
      setDirty(true)
    },
    [isValidConnection, setEdges]
  )

  const reconnectOk = useRef(true)
  const onReconnectStart = useCallback((): void => {
    reconnectOk.current = false
  }, [])
  const onReconnect = useCallback(
    (oldEdge: Edge, newConn: Connection): void => {
      if (!isValidConnection(newConn)) return
      reconnectOk.current = true
      setEdges((eds) => reconnectEdge(oldEdge, newConn, eds))
      setDirty(true)
    },
    [isValidConnection, setEdges]
  )
  const onReconnectEnd = useCallback(
    (_e: unknown, edge: Edge): void => {
      if (!reconnectOk.current) {
        setEdges((eds) => eds.filter((x) => x.id !== edge.id))
        setDirty(true)
      }
      reconnectOk.current = true
    },
    [setEdges]
  )
  const onEdgeDoubleClick = useCallback(
    (_e: React.MouseEvent, edge: Edge): void => {
      setEdges((eds) => eds.filter((x) => x.id !== edge.id))
      setDirty(true)
    },
    [setEdges]
  )

  // ── Blueprint yönetimi ───────────────────────────────────────────────────
  const createBlueprint = useCallback(async (): Promise<void> => {
    const name = newName.trim()
    if (name === '') {
      toast.error('Blueprint adı gir')
      return
    }
    try {
      const created = await api.createBlueprint({ name, graph: { nodes: [], edges: [] } })
      setNewName('')
      await reloadBlueprints()
      await openBlueprint(created.key, index)
      toast.success('Blueprint oluşturuldu')
    } catch (c) {
      toast.error(c instanceof Error ? c.message : 'Oluşturulamadı')
    }
  }, [api, newName, reloadBlueprints, openBlueprint, index])

  const saveVersion = useCallback(async (): Promise<string | null> => {
    if (currentKey === null) {
      toast.error('Önce bir blueprint oluştur/aç')
      return null
    }
    try {
      const result = await api.saveBlueprintVersion(currentKey, rfToGraph(nodes, edges))
      setDirty(false)
      setVersions(await api.listBlueprintVersions(currentKey))
      await reloadBlueprints()
      toast.success(`Sürüm v${result.version} kaydedildi`)
      return currentKey
    } catch (c) {
      toast.error(c instanceof Error ? c.message : 'Kaydedilemedi')
      return null
    }
  }, [api, currentKey, nodes, edges, reloadBlueprints])

  const renameCurrent = useCallback(async (): Promise<void> => {
    if (currentKey === null) return
    const name = window.prompt('Yeni ad:', currentName)
    if (name === null || name.trim() === '') return
    try {
      await api.renameBlueprint(currentKey, { name: name.trim() })
      setCurrentName(name.trim())
      await reloadBlueprints()
    } catch (c) {
      toast.error(c instanceof Error ? c.message : 'Yeniden adlandırılamadı')
    }
  }, [api, currentKey, currentName, reloadBlueprints])

  const duplicateCurrent = useCallback(async (): Promise<void> => {
    if (currentKey === null) return
    try {
      const res = await api.duplicateBlueprint(currentKey)
      await reloadBlueprints()
      await openBlueprint(res.key, index)
      toast.success('Blueprint çoğaltıldı')
    } catch (c) {
      toast.error(c instanceof Error ? c.message : 'Çoğaltılamadı')
    }
  }, [api, currentKey, reloadBlueprints, openBlueprint, index])

  const deleteCurrent = useCallback(async (): Promise<void> => {
    if (currentKey === null) return
    if (!window.confirm(`"${currentName}" silinsin mi? (tüm sürüm/çalıştırmalar)`)) return
    try {
      await api.deleteBlueprint(currentKey)
      const list = await reloadBlueprints()
      if (list.length > 0) await openBlueprint(list[0]!.key, index)
      else {
        setCurrentKey(null)
        setCurrentName('')
        setNodes([])
        setEdges([])
        setVersions([])
      }
      toast.success('Blueprint silindi')
    } catch (c) {
      toast.error(c instanceof Error ? c.message : 'Silinemedi')
    }
  }, [api, currentKey, currentName, reloadBlueprints, openBlueprint, index, setNodes, setEdges])

  const loadVersion = useCallback(
    async (version: number): Promise<void> => {
      if (currentKey === null) return
      try {
        const detail = await api.getBlueprint(currentKey, version)
        const rf = graphToRf(detail.graph, index)
        setNodes(rf.nodes)
        setEdges(rf.edges)
        setRunState({})
        setDirty(true) // yüklenen eski sürüm, kaydedilince yeni sürüm olur
        toast.info(`v${version} canvas'a yüklendi (kaydet → yeni sürüm)`)
      } catch (c) {
        toast.error(c instanceof Error ? c.message : 'Sürüm yüklenemedi')
      }
    },
    [api, currentKey, index, setNodes, setEdges]
  )

  // ── Çalıştırma (gerçek motor + SSE canlı yanma) ──────────────────────────
  const applyEvent = useCallback((event: BlueprintRunEvent): void => {
    switch (event.type) {
      case 'bp.run.snapshot': {
        const map: Record<string, NodeRunState> = {}
        for (const n of event.run.nodeRuns) map[n.nodeId] = { status: n.status, output: n.output, error: n.error }
        setRunState(map)
        setLogs(event.logs)
        setRunStatus(event.run.status)
        break
      }
      case 'bp.node.updated':
        setRunState((cur) => ({
          ...cur,
          [event.node.nodeId]: { status: event.node.status, output: event.node.output, error: event.node.error }
        }))
        break
      case 'bp.log.appended':
        setLogs((cur) => [...cur, event.line])
        break
      case 'bp.run.updated':
        setRunStatus(event.status)
        break
      case 'bp.run.finished':
        setRunStatus(event.status)
        setRunning(false)
        if (event.status === 'succeeded') toast.success('Çalıştırma tamamlandı ✓')
        else if (event.status === 'degraded') toast.info('Çalıştırma kısmi tamamlandı')
        else toast.error(`Çalıştırma başarısız${event.error !== undefined ? `: ${event.error}` : ''}`)
        break
    }
  }, [])

  const run = useCallback(async (): Promise<void> => {
    if (running) return
    if (currentKey === null) {
      toast.error('Önce bir blueprint oluştur/aç')
      return
    }
    if (nodes.length === 0) {
      toast.error('Boş blueprint — soldan node ekle')
      return
    }
    // Kaydedilmemiş değişiklik varsa önce kaydet (çalıştırma en güncel sürümü koşar).
    if (dirty) {
      const saved = await saveVersion()
      if (saved === null) return
    }
    setRunning(true)
    setRunState({})
    setLogs([])
    setRunStatus('queued')
    try {
      const { runId } = await api.runBlueprint(currentKey)
      unsubRef.current?.()
      unsubRef.current = api.streamBlueprintRun(runId, applyEvent)
    } catch (c) {
      setRunning(false)
      toast.error(c instanceof Error ? c.message : 'Çalıştırılamadı')
    }
  }, [running, currentKey, nodes.length, dirty, saveVersion, api, applyEvent])

  // Alt-blueprint seçici: kendisi hariç tüm blueprint'ler (öz-referans döngüsünü önler).
  const blueprintOptions = useMemo<readonly BlueprintOption[]>(
    () => blueprints.filter((b) => b.key !== currentKey).map((b) => ({ key: b.key, name: b.name })),
    [blueprints, currentKey]
  )

  const ctx = useMemo<BuilderContextValue>(
    () => ({
      index,
      interfaces,
      blueprintOptions,
      connectedInputs,
      runState,
      updateParam,
      removeNode,
      duplicateNode,
      isValidConnection
    }),
    [index, interfaces, blueprintOptions, connectedInputs, runState, updateParam, removeNode, duplicateNode, isValidConnection]
  )

  return (
    <BuilderContext.Provider value={ctx}>
      <ReactFlowProvider>
        <div className="bwrap">
          <style>{NODE_CSS}</style>
          <Sidebar types={types} />
          <Canvas
            nodes={nodes}
            edges={edges}
            onNodesChange={markDirtyFromNodeChanges}
            onEdgesChange={markDirtyFromEdgeChanges}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onEdgeDoubleClick={onEdgeDoubleClick}
            isValidConnection={isValidConnection}
            addNode={addNode}
            manager={{
              blueprints,
              currentKey,
              currentName,
              versions,
              dirty,
              newName,
              setNewName,
              onCreate: () => void createBlueprint(),
              onOpen: (key) => void openBlueprint(key, index),
              onSave: () => void saveVersion(),
              onRename: () => void renameCurrent(),
              onDuplicate: () => void duplicateCurrent(),
              onDelete: () => void deleteCurrent(),
              onLoadVersion: (v) => void loadVersion(v)
            }}
            run={() => void run()}
            running={running}
            runStatus={runStatus}
            logs={logs}
            empty={nodes.length === 0}
          />
        </div>
      </ReactFlowProvider>
    </BuilderContext.Provider>
  )
}

interface ManagerProps {
  readonly blueprints: readonly BlueprintSummary[]
  readonly currentKey: string | null
  readonly currentName: string
  readonly versions: readonly BlueprintVersionSummary[]
  readonly dirty: boolean
  readonly newName: string
  readonly setNewName: (v: string) => void
  readonly onCreate: () => void
  readonly onOpen: (key: string) => void
  readonly onSave: () => void
  readonly onRename: () => void
  readonly onDuplicate: () => void
  readonly onDelete: () => void
  readonly onLoadVersion: (version: number) => void
}

interface CanvasProps {
  readonly nodes: Node[]
  readonly edges: Edge[]
  readonly onNodesChange: OnNodesChange<Node>
  readonly onEdgesChange: OnEdgesChange<Edge>
  readonly onConnect: (c: Connection) => void
  readonly onReconnect: (oldEdge: Edge, newConn: Connection) => void
  readonly onReconnectStart: () => void
  readonly onReconnectEnd: (e: unknown, edge: Edge) => void
  readonly onEdgeDoubleClick: (e: React.MouseEvent, edge: Edge) => void
  readonly isValidConnection: IsValidConnection
  readonly addNode: (nodeType: string, position: { x: number; y: number }) => void
  readonly manager: ManagerProps
  readonly run: () => void
  readonly running: boolean
  readonly runStatus: RunStatus | null
  readonly logs: readonly BlueprintRunLogLine[]
  readonly empty: boolean
}

interface Menu {
  id: string
  x: number
  y: number
}

const LEVEL_GLYPH: Record<string, string> = { debug: '·', info: 'ℹ', warn: '⚠', error: '✕' }

const Canvas = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onReconnect,
  onReconnectStart,
  onReconnectEnd,
  onEdgeDoubleClick,
  isValidConnection,
  addNode,
  manager,
  run,
  running,
  runStatus,
  logs,
  empty
}: CanvasProps): React.JSX.Element => {
  const { screenToFlowPosition } = useReactFlow()
  const { removeNode, duplicateNode } = useBuilder()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [showLogs, setShowLogs] = useState(true)

  const onDrop = useCallback(
    (event: React.DragEvent): void => {
      event.preventDefault()
      const raw = event.dataTransfer.getData(DND_FORMAT)
      if (!raw) return
      try {
        const { nodeType } = JSON.parse(raw) as { nodeType: string }
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
        addNode(nodeType, { x: pos.x, y: pos.y })
      } catch {
        // yok say
      }
    },
    [screenToFlowPosition, addNode]
  )

  const onDragOver = useCallback((event: React.DragEvent): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node): void => {
    event.preventDefault()
    setMenu({ id: node.id, x: event.clientX, y: event.clientY })
  }, [])

  const closeMenu = useCallback((): void => setMenu(null), [])

  const m = manager

  return (
    <div className="bcanvas" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={BUILDER_NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onEdgeDoubleClick={onEdgeDoubleClick}
        isValidConnection={isValidConnection}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={closeMenu}
        onMoveStart={closeMenu}
        connectionRadius={30}
        connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 2 }}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable
        nodesConnectable
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background color="var(--line)" gap={26} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />

        <Panel position="top-left">
          <div className="bmanage">
            <select
              className="bmanage__sel"
              value={m.currentKey ?? ''}
              onChange={(e) => e.target.value !== '' && m.onOpen(e.target.value)}
            >
              {m.currentKey === null && <option value="">— blueprint —</option>}
              {m.blueprints.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.name} (v{b.latestVersion})
                </option>
              ))}
            </select>
            {m.currentKey !== null && (
              <div className="bmanage__row">
                <button type="button" className="bchip" onClick={m.onRename} title="Yeniden adlandır">
                  ✎
                </button>
                <button type="button" className="bchip" onClick={m.onDuplicate} title="Çoğalt">
                  ⧉
                </button>
                <button type="button" className="bchip bchip--danger" onClick={m.onDelete} title="Sil">
                  🗑
                </button>
                {m.versions.length > 0 && (
                  <select
                    className="bmanage__ver"
                    value=""
                    onChange={(e) => e.target.value !== '' && m.onLoadVersion(Number(e.target.value))}
                    title="Sürüm geçmişi"
                  >
                    <option value="">sürümler…</option>
                    {m.versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version} · {new Date(v.createdAt).toLocaleString('tr')}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div className="bmanage__row">
              <input
                className="bmanage__new"
                value={m.newName}
                onChange={(e) => m.setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && m.onCreate()}
                placeholder="yeni blueprint adı"
              />
              <button type="button" className="bchip bchip--go" onClick={m.onCreate} title="Oluştur">
                ＋
              </button>
            </div>
          </div>
        </Panel>

        <Panel position="top-right">
          <div className="brun">
            <button type="button" className="brun__save" onClick={m.onSave} disabled={m.currentKey === null || !m.dirty}>
              {m.dirty ? '● Kaydet' : '✓ Kaydedildi'}
            </button>
            <button type="button" className="brun__go" onClick={run} disabled={running || empty || m.currentKey === null}>
              {running ? '◴ Çalışıyor…' : '▶ Çalıştır'}
            </button>
            {runStatus !== null && <span className={`brun__status brun__status--${runStatus}`}>{STATUS_LABEL[runStatus]}</span>}
          </div>
        </Panel>

        {logs.length > 0 && (
          <Panel position="bottom-center">
            <div className={`blog${showLogs ? '' : ' is-collapsed'}`}>
              <button type="button" className="blog__head" onClick={() => setShowLogs((s) => !s)}>
                {showLogs ? '▾' : '▸'} Çalıştırma günlüğü ({logs.length})
              </button>
              {showLogs && (
                <div className="blog__body">
                  {logs.slice(-80).map((l) => (
                    <div key={l.seq} className={`blog__line blog__line--${l.level}`}>
                      <span className="blog__glyph">{LEVEL_GLYPH[l.level] ?? '·'}</span>
                      {l.nodeId !== null && <span className="blog__node">{l.nodeId}</span>}
                      <span>{l.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        )}

        {empty && (
          <div className="bempty">
            {m.currentKey === null ? (
              <>
                <span>Henüz blueprint yok.</span>
                <span>Sol üstten ad verip ＋ ile oluştur.</span>
              </>
            ) : (
              <>
                <span>Soldaki paletten node sürükle.</span>
                <span>◆ Proje ile başla, portları tipine göre bağla.</span>
              </>
            )}
          </div>
        )}
      </ReactFlow>

      {menu !== null && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 19 }}
            onClick={closeMenu}
            onContextMenu={(e) => {
              e.preventDefault()
              closeMenu()
            }}
          />
          <div className="bmenu" style={{ left: menu.x, top: menu.y }}>
            <button
              type="button"
              className="bmenu__item"
              onClick={() => {
                duplicateNode(menu.id)
                closeMenu()
              }}
            >
              ⧉ Çoğalt
            </button>
            <button
              type="button"
              className="bmenu__item bmenu__item--danger"
              onClick={() => {
                removeNode(menu.id)
                closeMenu()
              }}
            >
              🗑 Sil
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const NODE_CSS = `
.bwrap { display: flex; height: 100%; min-height: 0; }
.bsidebar { width: 184px; flex: none; border-right: 1px solid var(--border); background: var(--surface); padding: 10px; overflow-y: auto; }
.bsidebar__search { width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-2); color: var(--text); font-size: 12px; }
.bsidebar__empty { color: var(--text-dim); font-size: 12px; }
.bsidebar__group { margin-bottom: 12px; }
.bsidebar__group h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--text-dim); }
.bsidebar__item { display: flex; align-items: center; gap: 8px; padding: 8px 9px; margin-bottom: 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); color: var(--text); cursor: grab; font-size: 12px; }
.bsidebar__item:hover { border-color: var(--accent); box-shadow: var(--shadow-sm); }
.bsidebar__item:active { cursor: grabbing; }
.bsidebar__glyph { color: var(--accent); width: 16px; text-align: center; }
.bsidebar__name { font-weight: 500; }
.bcanvas { flex: 1; min-width: 0; position: relative; }
.bempty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; pointer-events: none; color: var(--text-dim); font-size: 13px; text-align: center; }

.gnode { width: 236px; background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 12px; box-shadow: var(--shadow); color: var(--text); font-size: 12px; position: relative; }
.gnode.is-selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.gnode.is-running { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.gnode.is-succeeded { border-color: var(--pass); }
.gnode.is-skipped { opacity: .6; }
.gnode.is-failed { border-color: var(--fail); box-shadow: 0 0 0 2px rgba(239,68,68,.25); }
.gnode--unknown { width: 200px; border-color: var(--fail); }
.gnode__head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid var(--border); font-weight: 600; border-radius: 12px 12px 0 0; }
.gnode__glyph { color: var(--accent); font-size: 14px; }
.gnode__title { font-size: 13px; flex: 1; }
.gnode__state { font-size: 12px; }
.gnode__state--running { color: var(--accent); animation: gspin 1s linear infinite; }
.gnode__state--succeeded { color: var(--pass); }
.gnode__state--failed { color: var(--fail); }
@keyframes gspin { to { transform: rotate(360deg); } }

.gnode__io { display: flex; flex-direction: column; }
.gnode__io--in { padding: 4px 0; border-bottom: 1px dashed var(--border); }
.gnode__io--out { padding: 4px 0; border-top: 1px dashed var(--border); }
.gio { position: relative; display: flex; align-items: center; gap: 6px; padding: 3px 12px; font-size: 11px; min-height: 20px; }
.gio--out { justify-content: flex-end; text-align: right; }
.gio__label { color: var(--text); }
.gio__badge { font-size: 9px; padding: 1px 5px; border-radius: 999px; }
.gio__badge--on { background: var(--accent-soft); color: var(--accent); }
.gio__badge--req { background: rgba(239,68,68,.15); color: var(--fail); }
.gio.is-missing .gio__label { color: var(--fail); }

.gnode__body { padding: 8px 12px 10px; display: flex; flex-direction: column; gap: 7px; }
.gnode__err { margin: 0; color: var(--fail); font-size: 11px; }
.gnode__hint { margin: 0; color: var(--text-dim); font-size: 10px; font-style: italic; }
.gfield { display: flex; flex-direction: column; gap: 2px; }
.gfield > span { font-size: 10px; color: var(--text-dim); }
.ginput { width: 100%; box-sizing: border-box; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); font-size: 12px; font-family: inherit; }
.gcheck { display: flex; gap: 6px; align-items: center; font-size: 12px; }
.goutput { font-size: 11px; }
.goutput summary { cursor: pointer; color: var(--accent); }
.goutput__pre { margin: 4px 0 0; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: 10px; }

.gport { width: 12px !important; height: 12px !important; border: 2px solid var(--surface) !important; border-radius: 50% !important; }
.gport.is-missing { box-shadow: 0 0 0 3px rgba(239,68,68,.3) !important; }
.react-flow__handle.connectingfrom { box-shadow: 0 0 0 4px var(--accent-soft) !important; }
.react-flow__handle.valid { box-shadow: 0 0 0 5px rgba(16,185,129,.4) !important; transform: scale(1.2); }

.gtoolbar { display: flex; gap: 6px; }
.gtoolbar__btn { padding: 4px 8px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface-2); color: var(--text); cursor: pointer; font-size: 11px; box-shadow: var(--shadow-sm); }
.gtoolbar__btn:hover { border-color: var(--accent); }
.gtoolbar__btn--danger:hover { border-color: var(--fail); color: var(--fail); }

.bmanage { display: flex; flex-direction: column; gap: 6px; background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 10px; padding: 8px; box-shadow: var(--shadow); min-width: 220px; }
.bmanage__row { display: flex; gap: 4px; align-items: center; }
.bmanage__sel, .bmanage__ver { flex: 1; padding: 5px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); font-size: 12px; }
.bmanage__new { flex: 1; padding: 5px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); font-size: 12px; }
.bchip { padding: 5px 8px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); color: var(--text); cursor: pointer; font-size: 12px; }
.bchip:hover { border-color: var(--accent); }
.bchip--danger:hover { border-color: var(--fail); color: var(--fail); }
.bchip--go { border-color: var(--accent); background: var(--accent); color: #fff; }

.brun { display: flex; gap: 6px; align-items: center; }
.brun__save { padding: 6px 10px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface-2); color: var(--text); cursor: pointer; font-size: 12px; font-weight: 600; }
.brun__save:disabled { opacity: .55; cursor: default; }
.brun__go { padding: 6px 12px; border: 1px solid var(--pass); border-radius: 8px; background: var(--pass); color: #fff; cursor: pointer; font-size: 12px; font-weight: 600; box-shadow: var(--shadow); }
.brun__go:disabled { opacity: .6; cursor: default; }
.brun__status { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); }
.brun__status--succeeded { color: var(--pass); border-color: var(--pass); }
.brun__status--failed { color: var(--fail); border-color: var(--fail); }
.brun__status--running, .brun__status--queued { color: var(--accent); border-color: var(--accent); }

.blog { width: min(560px, 60vw); background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 10px 10px 0 0; box-shadow: var(--shadow); overflow: hidden; }
.blog__head { width: 100%; text-align: left; padding: 6px 10px; border: none; background: var(--surface); color: var(--text); cursor: pointer; font-size: 12px; font-weight: 600; }
.blog__body { max-height: 160px; overflow-y: auto; padding: 6px 10px; font-size: 11px; font-family: ui-monospace, monospace; }
.blog__line { display: flex; gap: 6px; padding: 1px 0; align-items: baseline; }
.blog__line--error { color: var(--fail); }
.blog__line--warn { color: #f59e0b; }
.blog__glyph { width: 12px; text-align: center; flex: none; }
.blog__node { color: var(--text-dim); flex: none; }

.bmenu { position: fixed; z-index: 20; background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: var(--shadow); padding: 4px; min-width: 130px; }
.bmenu__item { display: block; width: 100%; text-align: left; padding: 6px 10px; border: none; background: none; color: var(--text); cursor: pointer; font-size: 12px; border-radius: 6px; }
.bmenu__item:hover { background: var(--accent-soft); }
.bmenu__item--danger:hover { background: rgba(239,68,68,.15); color: var(--fail); }
`
