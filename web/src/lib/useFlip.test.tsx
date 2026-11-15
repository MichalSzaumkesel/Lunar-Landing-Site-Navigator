// @vitest-environment jsdom
import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFlip } from './useFlip'
import type { Flip } from './useFlip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const holder: { flip: Flip } = { flip: { capture: () => {} } }
const animate = vi.fn()

/** Rects by key; the test moves items by editing this. */
const layout: Record<string, { left: number; top: number }> = {}

function List({ ids }: { ids: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const flip = useFlip(ref, ids.join(','))
  useEffect(() => {
    holder.flip = flip
  })
  return (
    <div ref={ref}>
      {ids.map((id) => (
        <div key={id} data-flip-key={id} data-id={id} />
      ))}
    </div>
  )
}

beforeEach(() => {
  animate.mockReset()
  for (const k of Object.keys(layout)) delete layout[k]
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const p = layout[(this as HTMLElement).dataset.id ?? ''] ?? { left: 0, top: 0 }
    return { left: p.left, top: p.top, right: p.left + 100, bottom: p.top + 100, width: 100, height: 100, x: p.left, y: p.top, toJSON: () => ({}) }
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (Element.prototype as { animate?: unknown }).animate
})

const render = (ids: string[]) => act(() => root.render(<List ids={ids} />))

describe('useFlip', () => {
  it('slides items that moved after a capture, from the captured position', () => {
    layout.a = { left: 0, top: 0 }
    layout.b = { left: 100, top: 0 }
    layout.c = { left: 200, top: 0 }
    render(['a', 'b', 'c'])
    act(() => holder.flip.capture())
    // b is removed: c moves into its place
    layout.c = { left: 100, top: 0 }
    render(['a', 'c'])
    expect(animate).toHaveBeenCalledTimes(1)
    const [frames, options] = animate.mock.calls[0]
    expect(frames[0].transform).toBe('translate(100px, 0px)')
    expect(frames[1].transform).toBe('translate(0, 0)')
    expect(options.duration).toBeLessThanOrEqual(350)
  })

  it('does nothing without a capture (changes from elsewhere do not animate from stale data)', () => {
    layout.a = { left: 0, top: 0 }
    layout.c = { left: 200, top: 0 }
    render(['a', 'b', 'c'])
    layout.c = { left: 100, top: 0 }
    render(['a', 'c'])
    expect(animate).not.toHaveBeenCalled()
  })

  it('ignores a capture that is older than a second', () => {
    vi.useFakeTimers()
    try {
      layout.a = { left: 0, top: 0 }
      layout.c = { left: 200, top: 0 }
      render(['a', 'c'])
      act(() => holder.flip.capture())
      vi.advanceTimersByTime(1500)
      layout.c = { left: 100, top: 0 }
      render(['a'])
      expect(animate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not animate items that did not move or that are new', () => {
    layout.a = { left: 0, top: 0 }
    render(['a'])
    act(() => holder.flip.capture())
    layout.b = { left: 100, top: 0 }
    render(['a', 'b'])
    expect(animate).not.toHaveBeenCalled()
  })

  it('does not animate with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    layout.a = { left: 0, top: 0 }
    layout.c = { left: 200, top: 0 }
    render(['a', 'b', 'c'])
    act(() => holder.flip.capture())
    layout.c = { left: 100, top: 0 }
    render(['a', 'c'])
    expect(animate).not.toHaveBeenCalled()
  })
})
