// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../state/store'
import { DemoCaption } from './DemoCaption'
import { useDemoStore } from './demoState'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('DemoCaption component', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    useDemoStore.setState({ isActive: false, stepIndex: 0 })
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

  it('renders nothing when demo is inactive', async () => {
    await act(async () => {
      root.render(createElement(DemoCaption))
    })

    expect(container.querySelector('.demo-caption')).toBeNull()
  })

  it('renders aria-live="polite" caption bar with hint and stop button when active', async () => {
    await act(async () => {
      root.render(createElement(DemoCaption))
    })

    await act(async () => {
      useDemoStore.getState().startDemo()
    })

    const bar = container.querySelector('.demo-caption')
    expect(bar).not.toBeNull()
    expect(bar?.getAttribute('aria-live')).toBe('polite')
    expect(bar?.getAttribute('role')).toBe('region')

    // Hint text
    const hint = container.querySelector('.demo-caption__hint')
    expect(hint?.textContent).toBe('Esc to stop')

    // Stop button
    const stopBtn = container.querySelector<HTMLButtonElement>('.demo-caption__stop')
    expect(stopBtn).not.toBeNull()
    expect(stopBtn?.textContent).toBe('Stop demo')

    // Caption text element
    const captionEl = container.querySelector('.demo-caption__text')
    expect(captionEl).not.toBeNull()
    expect(captionEl?.textContent).toBeTruthy()
  })

  it('stops demo and unmounts when Stop demo button is clicked', async () => {
    await act(async () => {
      root.render(createElement(DemoCaption))
    })

    await act(async () => {
      useDemoStore.getState().startDemo()
    })
    expect(useDemoStore.getState().isActive).toBe(true)

    const stopBtn = container.querySelector<HTMLButtonElement>('.demo-caption__stop')
    await act(async () => {
      stopBtn?.click()
    })

    expect(useDemoStore.getState().isActive).toBe(false)
    expect(container.querySelector('.demo-caption')).toBeNull()
  })

  it('stops demo on Escape keydown', async () => {
    await act(async () => {
      root.render(createElement(DemoCaption))
    })

    await act(async () => {
      useDemoStore.getState().startDemo()
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(useDemoStore.getState().isActive).toBe(false)
    expect(container.querySelector('.demo-caption')).toBeNull()
  })
})
