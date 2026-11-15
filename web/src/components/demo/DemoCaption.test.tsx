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

  it('shows Restart only on the end card of the standard demo and restarts from step 1', async () => {
    await act(async () => {
      root.render(createElement(DemoCaption))
    })
    await act(async () => {
      useDemoStore.getState().startDemo()
    })
    const restart = () => container.querySelector<HTMLButtonElement>('[aria-label="Restart demo"]')
    expect(restart()).toBeNull()

    await act(async () => {
      useDemoStore.getState().setStepIndex(5)
    })
    expect(restart()).not.toBeNull()

    await act(async () => {
      restart()?.click()
    })
    expect(useDemoStore.getState().stepIndex).toBe(0)
    expect(restart()).toBeNull()
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
    expect(bar?.getAttribute('aria-live')).toBeNull()
    expect(bar?.getAttribute('role')).toBe('region')

    // Hint text
    const hint = container.querySelector('.demo-caption__hint')
    expect(hint?.textContent).toBe('Esc to stop')

    // Stop button
    const stopBtn = container.querySelector<HTMLButtonElement>('.demo-caption__stop')
    expect(stopBtn).not.toBeNull()
    expect(stopBtn?.textContent).toBe('Stop demo')

    // Caption text element with dedicated live region
    const captionEl = container.querySelector('.demo-caption__text')
    expect(captionEl).not.toBeNull()
    expect(captionEl?.getAttribute('aria-live')).toBe('polite')
    expect(captionEl?.getAttribute('aria-atomic')).toBe('true')
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

  it('renders "Video 30 s" variant button and toggles variant on click', async () => {
    await act(async () => {
      root.render(createElement(DemoCaption))
    })

    await act(async () => {
      useDemoStore.getState().startDemo()
    })

    const variantBtn = container.querySelector<HTMLButtonElement>('[aria-label="Video 30 s variant"]')
    expect(variantBtn).not.toBeNull()
    expect(variantBtn?.textContent).toBe('Video 30 s')
    expect(useDemoStore.getState().variant).toBe('normal')

    await act(async () => {
      variantBtn?.click()
    })

    expect(useDemoStore.getState().variant).toBe('video30s')
    expect(variantBtn?.textContent).toBe('Standard demo')
  })

  it('renders "Record video" button next to "Video 30 s" button', async () => {
    await act(async () => {
      root.render(createElement(DemoCaption))
    })

    await act(async () => {
      useDemoStore.getState().startDemo()
    })

    const recordBtn = container.querySelector<HTMLButtonElement>('[aria-label="Record video"]')
    expect(recordBtn).not.toBeNull()
    expect(recordBtn?.textContent).toBe('Record video')

    const actionsContainer = container.querySelector('.demo-caption__actions')
    expect(actionsContainer).not.toBeNull()
    const buttons = actionsContainer?.querySelectorAll('button')
    expect(buttons?.length).toBe(2)
  })

  it('shows permission error message when recorder is declined', async () => {
    // Mock getDisplayMedia throwing NotAllowedError
    const mockGetDisplayMedia = vi.fn().mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError'),
    )
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getDisplayMedia: mockGetDisplayMedia,
      },
    })
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn(() => true),
    })

    await act(async () => {
      root.render(createElement(DemoCaption))
    })

    await act(async () => {
      useDemoStore.getState().startDemo()
    })

    const recordBtn = container.querySelector<HTMLButtonElement>('[aria-label="Record video"]')
    await act(async () => {
      recordBtn?.click()
    })

    const textEl = container.querySelector('.demo-caption__text')
    expect(textEl?.textContent).toBe(
      'Recording needs permission to capture this tab. Nothing was saved.',
    )
  })
})
