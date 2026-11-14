// @vitest-environment jsdom
// Runs the real loader (reading the mock files) and the real window-map computation; only the
// browser edges (fetch, canvas, ResizeObserver) are stubbed.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../state/store'

vi.mock('../../lib/loader', async () => {
  const actual = await vi.importActual<typeof import('../../lib/loader')>('../../lib/loader')
  const fetchImpl = (async (url: string) => {
    const path = resolve(process.cwd(), 'public', String(url).replace(/^\/+/, ''))
    try {
      const body = readFileSync(path)
      return new Response(body, { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }) as unknown as typeof fetch
  return {
    ...actual,
    dataSource: actual.createDataSource({ fetchImpl, baseUrl: '/', useMock: true, apiUrl: null }),
  }
})

import { WindowMap } from './WindowMap'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(
  new Proxy({}, { get: () => () => null, set: () => true }),
) as unknown as typeof HTMLCanvasElement.prototype.getContext

describe('WindowMap with real loader and computation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('lists every mock site, computes window lists and opens a valid cell', async () => {
    await act(async () => {
      root.render(createElement(WindowMap))
    })
    // Loader promises settle, then the 250 ms debounce fires the real computation.
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
    }

    const labels = container.querySelector('.finder__labels-col')?.textContent ?? ''
    expect(labels).toContain('Equatorial site')
    expect(labels).toContain('Artemis III candidate region')
    expect(container.querySelector('canvas')).not.toBeNull()
    expect(container.querySelector('.finder__error-msg')).toBeNull()

    const windows = container.querySelector('.finder__windows-section')?.textContent ?? ''
    expect(windows).toMatch(/\d{4}/)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    const w = canvas.width || 760
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: w, height: canvas.height || 168, right: w, bottom: 168, x: 0, y: 0, toJSON: () => {} }) as DOMRect
    const before = useAppStore.getState().scenarios.length
    await act(async () => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }))
    })
    expect(container.querySelector('.finder__confirmation')?.textContent).toMatch(/^Opened .+ from \d{4}-\d{2}-\d{2}$/)
    expect(useAppStore.getState().scenarios.length).toBe(before + 1)
  }, 60_000)
})
