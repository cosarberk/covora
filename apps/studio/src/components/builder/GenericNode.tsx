/**
 * @module studio/components/builder/GenericNode
 *
 * Tek jenerik node — backend defterindeki (NodeTypeMeta) tanımdan çizilir:
 * tipli renkli giriş/çıkış portları (handle), gövdede düzenlenen parametreler
 * (grafta saklanır), çalıştırınca gerçek durumla yanar ve ürettiği çıktı
 * incelenebilir. Dekoratif değil: portlar defterden, değerler kablolardan,
 * durum SSE'den gelir.
 */

import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react'

import type { StepStatus } from '@covora/types'
import type { ParamSpec, PortSpec } from '@covora/flow'

import { effectivePorts, handleId, SUBFLOW_TYPE, typeColor, typeName } from './catalog.js'
import { useBuilder, type BlueprintOption } from './context.js'

/** Node gövdesindeki veri. */
interface GenericData {
  readonly nodeType?: string
  readonly params?: Record<string, unknown>
}

const STATE_GLYPH: Partial<Record<StepStatus, string>> = {
  running: '◴',
  succeeded: '✓',
  failed: '✕',
  skipped: '⊘',
  cancelled: '⊗'
}

/** Bir giriş portu satırı: sol kenarda tipli handle + etiket + rozet. */
const InputRow = ({ port, connected }: { port: PortSpec; connected: boolean }): React.JSX.Element => {
  const id = handleId('in', port.name)
  const needs = port.required === true && !connected
  const color = typeColor(port.type)
  const title = `${port.label} · tip: ${typeName(port.type)}${port.required === true ? ' · zorunlu' : ''}`
  const { isValidConnection } = useBuilder()
  return (
    <div className={`gio gio--in${needs ? ' is-missing' : ''}`} title={title}>
      <Handle
        type="target"
        position={Position.Left}
        id={id}
        isValidConnection={isValidConnection}
        className={`gport${needs ? ' is-missing' : ''}`}
        style={{ left: -7, background: color, borderColor: color }}
      />
      <span className="gio__label">{port.label}</span>
      {connected ? (
        <span className="gio__badge gio__badge--on">bağlı</span>
      ) : port.required === true ? (
        <span className="gio__badge gio__badge--req">gerekli</span>
      ) : null}
    </div>
  )
}

/** Bir çıkış portu satırı: sağ kenarda tipli handle + etiket. */
const OutputRow = ({ port }: { port: PortSpec }): React.JSX.Element => {
  const id = handleId('out', port.name)
  const color = typeColor(port.type)
  const title = `${port.label} · tip: ${typeName(port.type)}`
  const { isValidConnection } = useBuilder()
  return (
    <div className="gio gio--out" title={title}>
      <span className="gio__label">{port.label}</span>
      <Handle
        type="source"
        position={Position.Right}
        id={id}
        isValidConnection={isValidConnection}
        className="gport"
        style={{ right: -7, background: color, borderColor: color }}
      />
    </div>
  )
}

/** Tek parametre kontrolü (grafa yazar). */
const ParamField = ({ nodeId, param, value }: { nodeId: string; param: ParamSpec; value: unknown }): React.JSX.Element => {
  const { updateParam } = useBuilder()
  const current = value ?? param.default
  const common = { className: 'ginput' }
  if (param.control === 'boolean') {
    return (
      <label className="gcheck">
        <input
          type="checkbox"
          checked={Boolean(current)}
          onChange={(e) => updateParam(nodeId, param.name, e.target.checked)}
        />
        <span>{param.label}</span>
      </label>
    )
  }
  return (
    <label className="gfield">
      <span>{param.label}</span>
      {param.control === 'select' ? (
        <select
          {...common}
          value={String(current ?? '')}
          onChange={(e) => updateParam(nodeId, param.name, e.target.value)}
        >
          {(param.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : param.control === 'code' ? (
        <textarea
          {...common}
          rows={3}
          value={String(current ?? '')}
          placeholder={param.placeholder ?? ''}
          onChange={(e) => updateParam(nodeId, param.name, e.target.value)}
        />
      ) : (
        <input
          {...common}
          type={param.control === 'number' ? 'number' : 'text'}
          value={String(current ?? '')}
          placeholder={param.placeholder ?? ''}
          onChange={(e) =>
            updateParam(nodeId, param.name, param.control === 'number' ? Number(e.target.value) : e.target.value)
          }
        />
      )}
    </label>
  )
}

/** Alt-blueprint seçici (subflow node'u hangi blueprint'i gömecek). */
const SubflowPicker = ({
  nodeId,
  value,
  options
}: {
  nodeId: string
  value: string
  options: readonly BlueprintOption[]
}): React.JSX.Element => {
  const { updateParam } = useBuilder()
  return (
    <label className="gfield">
      <span>gömülü blueprint</span>
      <select
        className="ginput"
        value={value}
        onChange={(e) => updateParam(nodeId, 'blueprintKey', e.target.value)}
      >
        <option value="">— seç —</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Çalışma sonrası node çıktısının incelenmesi. */
const OutputInspect = ({ output }: { output: unknown }): React.JSX.Element | null => {
  if (output === null || output === undefined) return null
  let text: string
  try {
    text = JSON.stringify(output, null, 2)
  } catch {
    text = String(output)
  }
  if (text.length > 1200) text = `${text.slice(0, 1200)}…`
  return (
    <details className="goutput">
      <summary>çıktı</summary>
      <pre className="goutput__pre">{text}</pre>
    </details>
  )
}

/** Tek jenerik node. */
export const GenericNode = ({ id, data, selected }: NodeProps): React.JSX.Element => {
  const { index, interfaces, blueprintOptions, connectedInputs, runState, removeNode, duplicateNode } = useBuilder()
  const d = data as GenericData
  const meta = d.nodeType !== undefined ? index.get(d.nodeType) : undefined

  if (meta === undefined) {
    return (
      <div className="gnode gnode--unknown">
        <div className="gnode__head">
          <span className="gnode__title">Bilinmeyen node: {d.nodeType ?? '?'}</span>
        </div>
      </div>
    )
  }

  const isSubflow = d.nodeType === SUBFLOW_TYPE
  const params = d.params ?? {}
  // Portlar: normal node'da statik defterden; subflow'da gömülen blueprint arayüzünden.
  const ports = effectivePorts(index, interfaces, d.nodeType, params)
  const subflowKey = typeof params.blueprintKey === 'string' ? params.blueprintKey : ''
  const connected = new Set(connectedInputs[id] ?? [])
  const run = runState[id]
  const state = run?.status
  const sel = selected === true
  const showBody = isSubflow || meta.params.length > 0 || run?.error != null || run?.output != null

  return (
    <div
      className={`gnode gnode--${meta.category.toLowerCase()}${sel ? ' is-selected' : ''}${
        state !== undefined ? ` is-${state}` : ''
      }`}
    >
      <NodeToolbar isVisible={sel} position={Position.Top} offset={8}>
        <div className="gtoolbar">
          <button type="button" className="gtoolbar__btn" onClick={() => duplicateNode(id)} title="Çoğalt">
            ⧉ çoğalt
          </button>
          <button
            type="button"
            className="gtoolbar__btn gtoolbar__btn--danger"
            onClick={() => removeNode(id)}
            title="Sil"
          >
            🗑 sil
          </button>
        </div>
      </NodeToolbar>

      <div className="gnode__head" title={meta.description}>
        <span className="gnode__glyph" aria-hidden>
          {meta.glyph}
        </span>
        <span className="gnode__title">{meta.label}</span>
        {state !== undefined && STATE_GLYPH[state] !== undefined && (
          <span className={`gnode__state gnode__state--${state}`} aria-hidden>
            {STATE_GLYPH[state]}
          </span>
        )}
      </div>

      {ports.inputs.length > 0 && (
        <div className="gnode__io gnode__io--in">
          {ports.inputs.map((p) => (
            <InputRow key={p.name} port={p} connected={connected.has(handleId('in', p.name))} />
          ))}
        </div>
      )}

      {showBody && (
        <div className="gnode__body nodrag nopan nowheel" onMouseDown={(e) => e.stopPropagation()}>
          {isSubflow ? (
            <>
              <SubflowPicker nodeId={id} value={subflowKey} options={blueprintOptions} />
              {subflowKey === '' && <p className="gnode__hint">Gömmek için bir blueprint seç.</p>}
              {subflowKey !== '' && ports.inputs.length === 0 && ports.outputs.length === 0 && (
                <p className="gnode__hint">Bu blueprint'in Giriş/Çıkış portu yok.</p>
              )}
            </>
          ) : (
            meta.params.map((p) => <ParamField key={p.name} nodeId={id} param={p} value={params[p.name]} />)
          )}
          {run?.error != null && <p className="gnode__err">⚠ {run.error}</p>}
          <OutputInspect output={run?.output} />
        </div>
      )}

      {ports.outputs.length > 0 && (
        <div className="gnode__io gnode__io--out">
          {ports.outputs.map((p) => (
            <OutputRow key={p.name} port={p} />
          ))}
        </div>
      )}
    </div>
  )
}

export const BUILDER_NODE_TYPES = { generic: GenericNode }
