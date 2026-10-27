/**
 * @module studio/components/builder/Sidebar
 *
 * Node paleti: backend defterinden (NodeTypeMeta) gelen türleri kategoriye göre
 * gruplar, aranabilir ve sürükle-bırak eder. dragStart'ta payload
 * `dataTransfer.setData("genericNode", JSON)` ile konur; canvas drop'ta bunu
 * okuyup node ekler.
 */

import { useMemo, useState } from 'react'

import type { NodeTypeMeta } from './catalog.js'

export const DND_FORMAT = 'genericNode'

const onDragStart = (event: React.DragEvent<HTMLElement>, meta: NodeTypeMeta): void => {
  event.dataTransfer.setData(DND_FORMAT, JSON.stringify({ nodeType: meta.type }))
  event.dataTransfer.effectAllowed = 'move'
}

/** Node paleti. Türler BuilderPanel'den (API'den yüklenmiş) prop olarak gelir. */
export const Sidebar = ({ types }: { types: readonly NodeTypeMeta[] }): React.JSX.Element => {
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase()
    const match = (d: NodeTypeMeta): boolean =>
      query === '' || d.label.toLowerCase().includes(query) || d.description.toLowerCase().includes(query)
    const byCat = new Map<string, NodeTypeMeta[]>()
    for (const meta of types) {
      if (!match(meta)) continue
      const list = byCat.get(meta.category) ?? []
      list.push(meta)
      byCat.set(meta.category, list)
    }
    return [...byCat.entries()]
  }, [q, types])

  return (
    <div className="bsidebar">
      <input
        className="bsidebar__search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Node ara…"
      />
      {groups.length === 0 && <p className="bsidebar__empty">Sonuç yok.</p>}
      {groups.map(([category, metas]) => (
        <div key={category} className="bsidebar__group">
          <h4>{category}</h4>
          {metas.map((meta) => (
            <div
              key={meta.type}
              className="bsidebar__item"
              draggable
              onDragStart={(e) => onDragStart(e, meta)}
              title={meta.description}
            >
              <span className="bsidebar__glyph">{meta.glyph}</span>
              <span className="bsidebar__name">{meta.label}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
