// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../state/store'
import { TourChip } from './TourChip'
import { useTourStore } from './tourState'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('TourChip', () => {
  let container: HTMLDivElement
  beforeEach(() => {
    localStorage.clear()
    useTourStore.setState({ isOpen: false })
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => container.remove())

  it('offers the tutorial without opening it, and opens on click', () => {
    const root = createRoot(container)
    act(() => root.render(createElement(TourChip)))
    expect(useTourStore.getState().isOpen).toBe(false)
    const go = container.querySelector<HTMLButtonElement>('.tour-chip__go')!
    expect(go.textContent).toContain('New here?')
    act(() => go.click())
    expect(useTourStore.getState().isOpen).toBe(true)
    act(() => root.unmount())
  })

  it('dismiss stores the choice for the mode and hides the chip', () => {
    const root = createRoot(container)
    act(() => root.render(createElement(TourChip)))
    act(() => container.querySelector<HTMLButtonElement>('.tour-chip__close')!.click())
    expect(localStorage.getItem(`lunar.tour.${useAppStore.getState().mode}`)).toBe('done')
    expect(container.querySelector('.tour-chip')).toBeNull()
    act(() => root.unmount())
  })
})
