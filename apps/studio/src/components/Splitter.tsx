/**
 * @module studio/components/Splitter
 *
 * Dock bölgeleri arasındaki sürüklenebilir ayraç (Blender tarzı). Sürükleme
 * sırasında artımlı delta'yı `onDrag`'e iletir; boyutu çağıran yönetir.
 */

/** {@link Splitter} props. */
export interface SplitterProps {
  /** `col` = dikey ayraç (yatay sürükle), `row` = yatay ayraç (dikey sürükle). */
  readonly dir: 'col' | 'row'
  /** Her sürükleme adımında piksel delta'sı. */
  readonly onDrag: (delta: number) => void
}

/** Sürüklenebilir dock ayracı. */
export const Splitter = ({ dir, onDrag }: SplitterProps): React.JSX.Element => {
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const horizontal = dir === 'col'
    let last = horizontal ? event.clientX : event.clientY
    const move = (ev: PointerEvent): void => {
      const now = horizontal ? ev.clientX : ev.clientY
      onDrag(now - last)
      last = now
    }
    const up = (): void => {
      globalThis.removeEventListener('pointermove', move)
      globalThis.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    globalThis.addEventListener('pointermove', move)
    globalThis.addEventListener('pointerup', up)
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }

  return <div className={`splitter splitter--${dir}`} onPointerDown={onPointerDown} />
}
