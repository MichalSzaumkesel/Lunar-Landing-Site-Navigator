// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../state/store'
import { AUTO_START_DELAY_MS, TourAutoStart } from './TourAutoStart'
import { useTourStore } from './tourState'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('TourAutoStart', () => {
  let container: HTMLDivElement
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
    useTourStore.setState({ isOpen: false })
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    container.remove()
  })

  it('opens the tutorial on the first visit and remembers it', () => {
    const root = createRoot(container)
    act(() => root.render(createElement(TourAutoStart)))
    expect(useTourStore.getState().isOpen).toBe(false)
    act(() => void vi.advanceTimersByTime(AUTO_START_DELAY_MS + 10))
    expect(useTourStore.getState().isOpen).toBe(true)
    expect(localStorage.getItem(`lunar.tour.${useAppStore.getState().mode}`)).toBe('done')
    act(() => root.unmount())
  })

  it('does not open again once seen', () => {
    localStorage.setItem(`lunar.tour.${useAppStore.getState().mode}`, 'done')
    const root = createRoot(container)
    act(() => root.render(createElement(TourAutoStart)))
    act(() => void vi.advanceTimersByTime(AUTO_START_DELAY_MS + 10))
    expect(useTourStore.getState().isOpen).toBe(false)
    act(() => root.unmount())
  })

  it('is suppressed by ?tour=0', () => {
    window.history.replaceState(null, '', '/?tour=0')
    const root = createRoot(container)
    act(() => root.render(createElement(TourAutoStart)))
    act(() => void vi.advanceTimersByTime(AUTO_START_DELAY_MS + 10))
    expect(useTourStore.getState().isOpen).toBe(false)
    act(() => root.unmount())
  })
})
