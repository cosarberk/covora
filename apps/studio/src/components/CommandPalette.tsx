/**
 * @module studio/components/CommandPalette
 *
 * Ctrl/Cmd+K ile açılan komut paleti: görünümler ve projeler arasında hızlı
 * geçiş. Yaz-filtrele, ok tuşlarıyla gez, Enter ile çalıştır.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

/** Palette'te çalıştırılabilir tek bir komut. */
export interface Command {
  readonly id: string
  readonly icon: string
  readonly label: string
  readonly hint?: string
  readonly run: () => void
}

/** {@link CommandPalette} props. */
export interface CommandPaletteProps {
  readonly commands: readonly Command[]
  readonly onClose: () => void
}

/** Komut paleti modalı. */
export const CommandPalette = ({ commands, onClose }: CommandPaletteProps): React.JSX.Element => {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') {
      return commands
    }
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(needle) ||
        (command.hint ?? '').toLowerCase().includes(needle)
    )
  }, [commands, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = filtered[active]
      if (command !== undefined) {
        command.run()
        onClose()
      }
    }
  }

  return (
    <div className="cmdk" onMouseDown={onClose}>
      <div className="cmdk__panel" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk__input"
          placeholder="Görünüm ya da proje ara…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="cmdk__list">
          {filtered.length === 0 ? (
            <div className="cmdk__empty">Eşleşme yok</div>
          ) : (
            filtered.map((command, index) => (
              <button
                key={command.id}
                type="button"
                className={index === active ? 'cmdk__item is-active' : 'cmdk__item'}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  command.run()
                  onClose()
                }}
              >
                <span className="cmdk__icon">{command.icon}</span>
                <span className="cmdk__label">{command.label}</span>
                {command.hint !== undefined && <span className="cmdk__hint">{command.hint}</span>}
              </button>
            ))
          )}
        </div>
        <div className="cmdk__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> gez
          </span>
          <span>
            <kbd>↵</kbd> seç
          </span>
          <span>
            <kbd>esc</kbd> kapat
          </span>
        </div>
      </div>
    </div>
  )
}
