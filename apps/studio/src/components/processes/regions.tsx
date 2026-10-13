/**
 * @module studio/components/processes/regions
 *
 * Süreçler görünümünün kabuk bölgelerine yerleşen parçaları: Gezgin'deki run
 * listesi, viewport'taki node grafiği (zoom/pan) ve Özellikler'deki inspector.
 */

import type { ReviewKind } from '@covora/types'
import { Background, Controls, MiniMap, Panel, ReactFlow, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import {
  LOG_COLOR,
  NODE_TYPES,
  OUTCOME_LABEL,
  RUN_STATUS_LABEL,
  STEP_STATUS_LABEL,
  approxKb,
  formatDuration,
  formatTime
} from './graph.js'
import type { ProcessesState } from './useProcesses.js'

/** Gezgin: proje + tür filtresi ve run kartları. */
export const ProcessRunList = ({
  proc,
  projects
}: {
  readonly proc: ProcessesState
  readonly projects: readonly { readonly key: string; readonly name: string }[]
}): React.JSX.Element => (
  <div className="runlist">
    <div className="runlist__filters">
      <select
        className="select select--sm"
        value={proc.selectedProject}
        onChange={(event) => proc.setSelectedProject(event.target.value)}
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
            className={proc.kindFilter === value ? 'segmented__btn is-active' : 'segmented__btn'}
            onClick={() => proc.setKindFilter(value as '' | ReviewKind)}
          >
            {value === '' ? 'Hepsi' : value}
          </button>
        ))}
      </div>
    </div>
    <div className="runlist__rows">
      {proc.runs.length === 0 ? (
        <div className="tree__empty">Henüz pipeline yok.</div>
      ) : (
        proc.runs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === proc.openRunId ? 'runrow is-active' : 'runrow'}
            onClick={() => proc.openRun(item.id)}
          >
            <span className={`status-dot status-dot--${item.status}`} />
            <span className="runrow__main">
              <span className="runrow__top">
                <span className="runrow__kind">{item.kind}</span>
                <span className="runrow__score">
                  {item.score === null ? '—' : item.score.toFixed(0)}
                </span>
              </span>
              <span className="runrow__bottom mono">{formatTime(item.createdAt)}</span>
            </span>
            {item.gatePassed !== null && (
              <span className={item.gatePassed ? 'pill pill--pass' : 'pill pill--fail'}>
                {item.gatePassed ? 'geçti' : 'kaldı'}
              </span>
            )}
          </button>
        ))
      )}
    </div>
  </div>
)

/** Viewport: node grafiği (zoom/pan/minimap). */
export const ProcessGraph = ({ proc }: { readonly proc: ProcessesState }): React.JSX.Element => {
  if (proc.openRunId === null) {
    return (
      <div className="graph-empty">
        <div className="graph-empty__icon">⟲</div>
        Sağdaki Pipeline’lar listesinden bir çalıştırma seç — akış grafiği burada açılır.
      </div>
    )
  }
  if (proc.run === null) {
    return <div className="state">Yükleniyor…</div>
  }
  return (
    <ReactFlow
      key={proc.openRunId}
      nodes={proc.nodes}
      edges={proc.edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={(changes) => proc.onNodesChange(changes)}
      onNodeClick={(_, node: Node) => proc.selectNode(node.id)}
      onPaneClick={() => proc.clearSelection()}
      fitView
      fitViewOptions={{ padding: 0.16 }}
      nodesDraggable
      nodesConnectable={false}
      elevateNodesOnSelect
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      maxZoom={2}
    >
      <Background color="var(--line)" gap={26} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="proc-minimap" />
      <Panel position="top-right" className="flow-panel">
        <button type="button" className="flow-panel__btn" onClick={() => proc.resetLayout()}>
          Düzeni sıfırla
        </button>
      </Panel>
    </ReactFlow>
  )
}

/** Özellikler: seçili node'un detayı (girdi / adım / sonuç) ya da run özeti. */
export const ProcessInspector = ({ proc }: { readonly proc: ProcessesState }): React.JSX.Element => {
  const { run, selected, logs, input, thumb, report, stepByKey, rules } = proc

  if (run === null) {
    return <div className="props__desc">Bir pipeline seçildiğinde detaylar burada görünür.</div>
  }

  if (selected === null) {
    return (
      <div className="inspector">
        <div className="props__name">{RUN_STATUS_LABEL[run.status]}</div>
        <div className="props__key mono">{run.codeHash}</div>
        <dl className="kv">
          <dt>Tür</dt>
          <dd>{run.kind}</dd>
          <dt>Skor</dt>
          <dd>{run.score === null || run.score === undefined ? '—' : run.score.toFixed(1)}</dd>
          <dt>Gate</dt>
          <dd>
            {run.gatePassed === null || run.gatePassed === undefined
              ? '—'
              : run.gatePassed
                ? 'Geçti'
                : 'Kaldı'}
          </dd>
          <dt>Süre</dt>
          <dd>{formatDuration(run.startedAt, run.finishedAt) ?? '—'}</dd>
        </dl>
        <p className="props__desc">Grafikte bir node’a tıkla: girdi görseli, adım logları ya da kural raporu.</p>
      </div>
    )
  }

  if (selected.kind === 'input') {
    if (input === null) {
      return <div className="props__desc">Girdi yükleniyor…</div>
    }
    if (input.input.kind === 'ui') {
      return (
        <div className="inspector">
          {thumb !== null && (
            <a href={thumb} target="_blank" rel="noreferrer">
              <img className="inspector__img" src={thumb} alt="Gönderilen ekran görüntüsü" />
            </a>
          )}
          <dl className="kv">
            <dt>Tür</dt>
            <dd>UI (ekran görüntüsü)</dd>
            <dt>Boyut</dt>
            <dd>~{approxKb(input.input.screenshot)} KB</dd>
            <dt>Client</dt>
            <dd>{input.input.clientResults?.length ?? 0} sonuç</dd>
          </dl>
        </div>
      )
    }
    return (
      <div className="inspector">
        <dl className="kv">
          <dt>Tür</dt>
          <dd>Code ({input.input.files.length} dosya)</dd>
        </dl>
        <ul className="file-list">
          {input.input.files.map((file) => (
            <li key={file.path} className="mono">
              {file.path}
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
      <div className="inspector">
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
        <div className="props__group">Adım logları</div>
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

  if (selected.kind === 'rule') {
    const rule = rules.find((item) => item.key === selected.key) ?? null
    if (rule === null) {
      return <div className="props__desc">Kural bilgisi yükleniyor…</div>
    }
    const result = report?.results.find((item) => item.ruleId === rule.key) ?? null
    const SEV_LABEL: Record<typeof rule.severity, string> = {
      blocker: 'Blocker',
      warning: 'Uyarı',
      info: 'Bilgi'
    }
    return (
      <div className="inspector">
        <div className="props__name">{rule.title}</div>
        <div className="props__key mono">{rule.key}</div>
        <dl className="kv">
          <dt>Değerlendirme</dt>
          <dd>{rule.evaluation === 'llm' ? 'AI-yargı' : 'Deterministik'}</dd>
          <dt>Önem</dt>
          <dd>{SEV_LABEL[rule.severity]}</dd>
          <dt>Ağırlık</dt>
          <dd>{rule.weight}</dd>
          <dt>Sonuç</dt>
          <dd>
            {result === null ? (
              '— (henüz değerlendirilmedi)'
            ) : (
              <span className={`badge badge--${result.outcome}`}>{OUTCOME_LABEL[result.outcome]}</span>
            )}
          </dd>
        </dl>
        {rule.description.length > 0 && (
          <>
            <div className="props__group">Açıklama / talimat</div>
            <p className="rule-desc">{rule.description}</p>
          </>
        )}
        {result?.note !== undefined && result.note.length > 0 && (
          <>
            <div className="props__group">Gerekçe</div>
            <p className="rule-desc">{result.note}</p>
          </>
        )}
        <div className="props__group">İlgili loglar</div>
        <div className="detail-logs">
          {(() => {
            const matched = logs.filter((l) => l.message.startsWith(`${rule.title}:`))
            return matched.length === 0 ? (
              <div className="console__empty">Bu kurala ait log yok</div>
            ) : (
              matched.map((line) => (
                <div key={line.seq} className="console__line">
                  <span className="console__ts">{formatTime(line.at)}</span>
                  <span style={{ color: LOG_COLOR[line.level] }}>{line.message}</span>
                </div>
              ))
            )
          })()}
        </div>
      </div>
    )
  }

  // selected.kind === 'result'
  const coverage = report?.outcome?.coverage ?? null
  const gate = report?.outcome?.gate ?? null
  const results = report?.results ?? []
  return (
    <div className="inspector">
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
            {coverage.earnedWeight.toFixed(1)} / {coverage.totalWeight.toFixed(1)}
          </dd>
          {coverage.failedBlockers.length > 0 && (
            <>
              <dt>Blocker</dt>
              <dd className="detail-err">{coverage.failedBlockers.join(', ')}</dd>
            </>
          )}
        </dl>
      )}

      {gate !== null && !gate.passed && gate.reasons.length > 0 && (
        <div className="report-reasons">
          <div className="props__group">Gate neden kaldı</div>
          <ul>
            {gate.reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="props__group">Kural sonuçları ({results.length})</div>
      {results.length === 0 ? (
        <div className="console__empty">
          {report === null ? 'Rapor yükleniyor…' : 'Sonuç yok.'}
        </div>
      ) : (
        <ul className="rule-results">
          {results.map((result) => (
            <li key={result.ruleId} className={`rule-result rule-result--${result.outcome}`}>
              <span className="rule-result__dot" />
              <div className="rule-result__main">
                <span className="rule-result__id mono">{result.ruleId}</span>
                {result.note !== undefined && <span className="rule-result__note">{result.note}</span>}
              </div>
              <span className={`badge badge--${result.outcome}`}>{OUTCOME_LABEL[result.outcome]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
