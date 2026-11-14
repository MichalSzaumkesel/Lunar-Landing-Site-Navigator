// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePresence, usePresenceList, usePresenceValue } from './usePresence'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Minimal renderHook: re-render with new props, read the latest result. */
function renderHook<P, R>(hook: (p: P) => R, initial: P) {
  const result = { current: undefined as R }
  const host = document.createElement('div')
  const root = createRoot(host)
  function Probe({ p }: { p: P }) {
    result.current = hook(p)
    return null
  }
  const rerender = (p: P) => act(() => root.render(createElement(Probe, { p })))
  rerender(initial)
  return { result, rerender }
}

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('usePresence', () => {
  it('stays mounted for the exit duration, then unmounts', () => {
    const { result, rerender } = renderHook((open: boolean) => usePresence(open, 150), true as boolean)
    expect(result.current).toEqual({ mounted: true, state: 'open' })
    rerender(false)
    expect(result.current).toEqual({ mounted: true, state: 'closed' })
    tick(149)
    expect(result.current.mounted).toBe(true)
    tick(2)
    expect(result.current.mounted).toBe(false)
  })

  it('cancels the exit when reopened', () => {
    const { result, rerender } = renderHook((open: boolean) => usePresence(open, 150), true as boolean)
    rerender(false)
    tick(100)
    rerender(true)
    tick(500)
    expect(result.current).toEqual({ mounted: true, state: 'open' })
  })

  it('unmounts immediately with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { result, rerender } = renderHook((open: boolean) => usePresence(open, 150), true as boolean)
    rerender(false)
    tick(0)
    expect(result.current.mounted).toBe(false)
  })
})

describe('usePresenceValue', () => {
  it('keeps the last value while closing', () => {
    const { result, rerender } = renderHook((v: string | null) => usePresenceValue(v, 150), 'oops' as string | null)
    rerender(null)
    expect(result.current).toMatchObject({ mounted: true, state: 'closed', value: 'oops' })
    tick(151)
    expect(result.current.mounted).toBe(false)
  })
})

describe('usePresenceList', () => {
  it('keeps a removed item at its place as closed, then drops it', () => {
    const key = (s: string) => s
    const { result, rerender } = renderHook((items: string[]) => usePresenceList(items, key, 150), ['a', 'b', 'c'])
    rerender(['a', 'c'])
    expect(result.current.map((p) => `${p.item}:${p.state}`)).toEqual(['a:open', 'b:closed', 'c:open'])
    tick(151)
    expect(result.current.map((p) => p.item)).toEqual(['a', 'c'])
  })
})
