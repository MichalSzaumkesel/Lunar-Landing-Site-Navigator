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

  it('any key stops the demo', async () => {
    await act(async () => {
      root.render(createElement(DemoTester))
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="start-btn"]')?.click()
    })
    expect(useDemoStore.getState().isActive).toBe(true)

    // Press Space or Enter or letter key
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
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
})
