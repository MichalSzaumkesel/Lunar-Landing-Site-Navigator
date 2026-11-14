// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './store'
import { usePlaybackLoop } from './usePlaybackLoop'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness() {
  usePlaybackLoop()
  return null
}

/** Manual requestAnimationFrame queue so each frame is driven by the test. */
let frames: Map<number, FrameRequestCallback>
let nextId: number
let cancelled: number[]

function runFrame(now: number): void {
  const pending = [...frames.values()]
  frames.clear()
  for (const cb of pending) cb(now)
}

describe('usePlaybackLoop', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    frames = new Map()
    nextId = 1
    cancelled = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextId++
      frames.set(id, cb)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      cancelled.push(id)
      frames.delete(id)
    })
    vi.spyOn(performance, 'now').mockReturnValue(1000)

    useAppStore.setState({ playing: false, cursorH: 0, speedHPerSec: 6 })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('schedules no frames while paused', () => {
    act(() => root.render(createElement(Harness)))

    expect(frames.size).toBe(0)
  })

  it('advances the cursor by elapsed seconds times speed on each frame', () => {
    act(() => root.render(createElement(Harness)))

    act(() => useAppStore.getState().setPlaying(true))
    expect(frames.size).toBe(1)

    // 50 ms after the start time at 6 h/s moves the cursor by 0.3 h.
    act(() => runFrame(1050))

    expect(useAppStore.getState().cursorH).toBeCloseTo(0.3, 10)
    expect(frames.size).toBe(1)
  })

  it('caps the frame delta at 0.1 s so a background tab does not jump', () => {
    act(() => root.render(createElement(Harness)))
    act(() => useAppStore.getState().setPlaying(true))

    // A 10 s gap is clamped to 0.1 s, which is 0.6 h at 6 h/s.
    act(() => runFrame(11000))

    expect(useAppStore.getState().cursorH).toBeCloseTo(0.6, 10)
  })

  it('cancels the pending frame when playback stops', () => {
    act(() => root.render(createElement(Harness)))
    act(() => useAppStore.getState().setPlaying(true))
    const [pendingId] = [...frames.keys()]

    act(() => useAppStore.getState().setPlaying(false))

    expect(cancelled).toContain(pendingId)
    expect(frames.size).toBe(0)
  })

  it('cancels the pending frame on unmount', () => {
    act(() => root.render(createElement(Harness)))
    act(() => useAppStore.getState().setPlaying(true))
    const [pendingId] = [...frames.keys()]

    act(() => root.unmount())
    root = createRoot(container)

    expect(cancelled).toContain(pendingId)
    expect(frames.size).toBe(0)
  })
})
