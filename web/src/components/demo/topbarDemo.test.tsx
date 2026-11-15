// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from '../../app/TopBar'
import { useTourStore } from '../help/tourState'
import { useTour } from '../help/useTour'
import { useDemoStore } from './demoState'
import { useAppStore } from '../../state/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('TopBar Demo button', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useDemoStore.setState({ isActive: false, stepIndex: 0 })
    useTourStore.setState({ isOpen: false, stepIndex: 0 })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders Demo button next to Tutorial button with ghost class', async () => {
    await act(async () => {
      root.render(createElement(TopBar))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const tourBtn = buttons.find((b) => b.textContent?.includes('Tutorial'))
    const demoBtn = buttons.find((b) => b.textContent?.trim() === 'Demo')

    expect(tourBtn).toBeDefined()
    expect(demoBtn).toBeDefined()
    expect(demoBtn?.classList.contains('ghost')).toBe(true)
  })

  it('starting demo closes tour if open', async () => {
    useTourStore.setState({ isOpen: true })
    expect(useTourStore.getState().isOpen).toBe(true)

    await act(async () => {
      root.render(createElement(TopBar))
    })

    const demoBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Demo',
    )
    expect(demoBtn).toBeDefined()

    await act(async () => {
      demoBtn?.click()
    })

    expect(useTourStore.getState().isOpen).toBe(false)
    expect(useDemoStore.getState().isActive).toBe(true)
  })

  it('clicking Demo button while demo is active stops demo and sets playing to false', async () => {
    useAppStore.setState({ playing: true })
    useDemoStore.setState({ isActive: true })

    await act(async () => {
      root.render(createElement(TopBar))
    })

    const demoBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Demo',
    )
    expect(demoBtn).toBeDefined()

    await act(async () => {
      demoBtn?.click()
    })

    expect(useDemoStore.getState().isActive).toBe(false)
    expect(useAppStore.getState().playing).toBe(false)
  })

  it('clicking Tutorial button while demo is active stops demo, restores the level and then opens the tour', async () => {
    vi.useFakeTimers()
    try {
      // The demo switched a Simple visitor to Advanced; stopping restores Simple, which closes an open tour.
      const app = useAppStore.getState()
      useAppStore.setState({ mode: 'advanced' })
      useDemoStore.setState({
        isActive: true,
        snapshot: {
          scenarios: app.scenarios,
          mode: 'simple',
          cursorH: 0,
          activeScenarioId: app.activeScenarioId,
          activeTabId: null,
        },
      })
      useTourStore.setState({ isOpen: false })

      await act(async () => {
        root.render(createElement('div', null, createElement(TopBar), createElement(TourProbe)))
      })

      const tourBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Tutorial'),
      )
      expect(tourBtn).toBeDefined()

      await act(async () => {
        tourBtn?.click()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50)
      })

      expect(useDemoStore.getState().isActive).toBe(false)
      expect(useAppStore.getState().mode).toBe('simple')
      expect(useTourStore.getState().isOpen).toBe(true)
    } finally {
      vi.useRealTimers()
      useAppStore.setState({ mode: 'simple' })
    }
  })
})

/** Mounts the same mode-change effect the real tour has (useTour closes an open tour when the level changes). */
function TourProbe() {
  useTour()
  return null
}
