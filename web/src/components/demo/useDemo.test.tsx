// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTourStore } from '../help/tourState'
import { useAppStore } from '../../state/store'
import { useDemoStore } from './demoState'
import { DEMO_STEPS } from './demoSteps'
import { useDemo } from './useDemo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function DemoTester() {
  const { isActive, stepIndex, caption, startDemo, stopDemo } = useDemo()
  return createElement(
    'div',
    null,
    createElement('div', { 'data-testid': 'status' }, isActive ? 'active' : 'inactive'),
    createElement('div', { 'data-testid': 'step' }, String(stepIndex)),
    createElement('div', { 'data-testid': 'caption' }, caption),
    createElement('button', { 'data-testid': 'start-btn', onClick: startDemo }, 'Start'),
    createElement('button', { 'data-testid': 'stop-btn', onClick: stopDemo }, 'Stop'),
  )
}

describe('useDemo hook', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    useDemoStore.setState({ isActive: false, stepIndex: 0 })
    useTourStore.setState({ isOpen: false, stepIndex: 0 })
    useAppStore.setState({ mode: 'simple', playing: false, cursorH: 0 })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('initializes inactive and activates on startDemo', async () => {
    await act(async () => {
      root.render(createElement(DemoTester))
    })

    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('inactive')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="start-btn"]')?.click()
    })

    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('active')
    expect(container.querySelector('[data-testid="step"]')?.textContent).toBe('0')
    expect(useDemoStore.getState().isActive).toBe(true)
  })

  it('closes tour when demo starts', async () => {
    useTourStore.setState({ isOpen: true })
    expect(useTourStore.getState().isOpen).toBe(true)

    await act(async () => {
      root.render(createElement(DemoTester))
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="start-btn"]')?.click()
    })

    expect(useTourStore.getState().isOpen).toBe(false)
  })

  it('Esc stops the demo and pauses playback', async () => {
    await act(async () => {
      root.render(createElement(DemoTester))
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="start-btn"]')?.click()
    })
    expect(useDemoStore.getState().isActive).toBe(true)

    // Press Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(useDemoStore.getState().isActive).toBe(false)
    expect(useAppStore.getState().playing).toBe(false)
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('inactive')
  })

  it('non-Escape keys do not stop demo, but Escape key stops the demo', async () => {
    await act(async () => {
      root.render(createElement(DemoTester))
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="start-btn"]')?.click()
    })
    expect(useDemoStore.getState().isActive).toBe(true)

    // Press Space - should NOT stop the demo
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })
    expect(useDemoStore.getState().isActive).toBe(true)

    // Press Escape - should stop the demo
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(useDemoStore.getState().isActive).toBe(false)
  })

  it('clicking stop button stops the demo', async () => {
    await act(async () => {
      root.render(createElement(DemoTester))
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="start-btn"]')?.click()
    })
    expect(useDemoStore.getState().isActive).toBe(true)

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="stop-btn"]')?.click()
    })

    expect(useDemoStore.getState().isActive).toBe(false)
  })

  it('advances through steps with timer and loops back to step 0', async () => {
    await act(async () => {
      root.render(createElement(DemoTester))
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="start-btn"]')?.click()
    })

    // Advance through each step by its duration
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      expect(useDemoStore.getState().stepIndex).toBe(i)
      await act(async () => {
        vi.advanceTimersByTime(DEMO_STEPS[i].durationMs)
      })
    }

    // Should have looped back to step 0
    expect(useDemoStore.getState().stepIndex).toBe(0)
  })

  it('restores app state before demo started (scenarios, mode, slip, cursor, playing false, active tab) when stopped', async () => {
    // Setup pre-demo app state
    const initialScenarios = [
      {
        id: 'user_sc1',
        siteId: 'custom_site',
        startUtc: '2026-05-01T00:00:00Z',
        durationH: 120,
        slipDays: 3,
      },
    ]
    useAppStore.setState({
      scenarios: initialScenarios,
      mode: 'simple',
      cursorH: 42,
      playing: false,
      activeScenarioId: 'user_sc1',
    })

    // Setup tabs in DOM
    const polarTab = document.createElement('button')
    polarTab.id = 'tab-polar'
    polarTab.setAttribute('role', 'tab')
    polarTab.setAttribute('aria-selected', 'true')
    polarTab.onclick = () => {
      polarTab.setAttribute('aria-selected', 'true')
      tab3d.setAttribute('aria-selected', 'false')
    }
    const tab3d = document.createElement('button')
    tab3d.id = 'tab-3d'
    tab3d.setAttribute('role', 'tab')
    tab3d.setAttribute('aria-selected', 'false')
    tab3d.onclick = () => {
      tab3d.setAttribute('aria-selected', 'true')
      polarTab.setAttribute('aria-selected', 'false')
    }
    document.body.appendChild(polarTab)
    document.body.appendChild(tab3d)

    // Start demo
    await act(async () => {
      useDemoStore.getState().startDemo()
    })
    expect(useDemoStore.getState().isActive).toBe(true)

    // Demo steps modify the store and DOM
    await act(async () => {
      useAppStore.setState({
        mode: 'advanced',
        cursorH: 100,
        playing: true,
        scenarios: [
          {
            id: 'demo_sc1',
            siteId: 'apollo_11',
            startUtc: '2026-12-01T00:00:00Z',
            durationH: 336,
            slipDays: 14,
          },
        ],
      })
      tab3d.click()
    })

    expect(tab3d.getAttribute('aria-selected')).toBe('true')
    expect(useAppStore.getState().mode).toBe('advanced')
    expect(useAppStore.getState().playing).toBe(true)

    // Stop demo
    await act(async () => {
      useDemoStore.getState().stopDemo()
    })

    // Verify app state was completely restored
    expect(useDemoStore.getState().isActive).toBe(false)
    expect(useAppStore.getState().playing).toBe(false)
    expect(useAppStore.getState().mode).toBe('simple')
    expect(useAppStore.getState().cursorH).toBe(42)
    expect(useAppStore.getState().scenarios).toEqual(initialScenarios)
    expect(polarTab.getAttribute('aria-selected')).toBe('true')

    polarTab.remove()
    tab3d.remove()
  })
})
