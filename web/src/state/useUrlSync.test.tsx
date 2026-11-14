// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './store'
import { useUrlSync } from './useUrlSync'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness() {
  useUrlSync()
  return null
}

describe('useUrlSync', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    useAppStore.setState({
      mode: 'advanced',
      observerHeightM: 2,
      speedHPerSec: 1,
      cursorH: 0,
      scenarios: [
        { id: 'sc1', siteId: 'apollo_11', startUtc: '1969-07-20T00:00:00Z', durationH: 240, slipDays: 0 },
      ],
      activeScenarioId: 'sc1',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    window.history.replaceState(null, '', '/')
  })

  it('applies the hash to the store on hashchange', () => {
    act(() => root.render(createElement(Harness)))

    // v=6 is a supported speed; v=2 is not in SPEEDS_H_PER_SEC and would be dropped.
    window.location.hash = '#m=s&h=10&c=12.5&v=6&s=southpole_landed~2027-08-30~720~14'
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    const state = useAppStore.getState()
    expect(state.mode).toBe('simple')
    expect(state.observerHeightM).toBe(10)
    expect(state.cursorH).toBe(12.5)
    expect(state.speedHPerSec).toBe(6)
    expect(state.scenarios).toHaveLength(1)
    expect(state.scenarios[0]).toMatchObject({
      siteId: 'southpole_landed',
      startUtc: '2027-08-30T00:00:00Z',
      durationH: 720,
      slipDays: 14,
    })
    expect(state.scenarios[0].id).toBe(state.activeScenarioId)
  })

  it('writes the store state back to the hash after a 300 ms debounce', () => {
    vi.useFakeTimers()
    act(() => root.render(createElement(Harness)))

    act(() => useAppStore.getState().setMode('simple'))
    expect(window.location.hash).toBe('')

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(window.location.hash).toBe('')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(window.location.hash).toContain('m=s')
    expect(window.location.hash).toContain('s=apollo_11~1969-07-20~240~0')
  })

  it('stops reacting to hashchange after unmount', () => {
    act(() => root.render(createElement(Harness)))
    act(() => root.unmount())
    root = createRoot(container)

    window.location.hash = '#m=s&h=10'
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(useAppStore.getState().mode).toBe('advanced')
    expect(useAppStore.getState().observerHeightM).toBe(2)
  })

  // Known bug (review R12 #2): encodeState keeps only the date part of startUtc,
  // so a start time such as 20:17:40Z is reset to 00:00:00Z on reload.
  it.todo(
    'keeps the intra-day start time (20:17:40Z) through the URL round trip (encodeState slices to the date)',
  )
})
