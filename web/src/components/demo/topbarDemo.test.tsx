// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from '../../app/TopBar'
import { useTourStore } from '../help/tourState'
import { useDemoStore } from './demoState'

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

  it('renders Demo button next to Tour button with ghost class', async () => {
    await act(async () => {
      root.render(createElement(TopBar))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const tourBtn = buttons.find((b) => b.textContent?.includes('Tour'))
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
})
