// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tour } from './Tour'
import { useTourStore } from './tourState'
import { useAppStore } from '../../state/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Tour component', () => {
  let container: HTMLDivElement
  let targetsContainer: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    useTourStore.setState({ isOpen: false, stepIndex: 0, dontShowAgain: false })
    useAppStore.setState({ mode: 'simple' })

    targetsContainer = document.createElement('div')
    targetsContainer.innerHTML = `
      <div data-tour="mode-switch">Mode switch</div>
      <div data-tour="simple-places">Places</div>
      <div data-tour="sky-plot">Sky view</div>
      <div data-tour="simple-summary">Summary</div>
      <div data-tour="transport-play">Play</div>
      <button data-tour="help-button">Tour</button>
    `
    document.body.appendChild(targetsContainer)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    targetsContainer.remove()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders nothing when closed', async () => {
    await act(async () => {
      root.render(createElement(Tour))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders dialog and steps through on Next click', async () => {
    await act(async () => {
      root.render(createElement(Tour))
    })

    await act(async () => {
      useTourStore.getState().openTour(0)
    })

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('false')

    const title = dialog?.querySelector('#tour-dialog-title')
    expect(title?.textContent).toBe('Mode switch')

    // Find Next button
    const nextBtn = dialog?.querySelector<HTMLButtonElement>('button.primary')
    expect(nextBtn?.textContent).toBe('Next')

    // Advance to step 2
    await act(async () => {
      nextBtn?.click()
    })

    expect(dialog?.querySelector('#tour-dialog-title')?.textContent).toBe('Places')
  })

  it('closes and marks done on Skip click', async () => {
    await act(async () => {
      root.render(createElement(Tour))
    })

    await act(async () => {
      useTourStore.getState().openTour(0)
    })

    const skipBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Skip tutorial',
    )
    expect(skipBtn).toBeDefined()

    await act(async () => {
      skipBtn?.click()
    })

    expect(useTourStore.getState().isOpen).toBe(false)
    expect(localStorage.getItem('lunar.tour.simple')).toBe('done')
  })

  it('closes on Escape key press', async () => {
    await act(async () => {
      root.render(createElement(Tour))
    })

    await act(async () => {
      useTourStore.getState().openTour(0)
    })

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()

    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(useTourStore.getState().isOpen).toBe(false)
  })

  it('renders aria-live polite region with step number and title on step change', async () => {
    await act(async () => {
      root.render(createElement(Tour))
    })

    await act(async () => {
      useTourStore.getState().openTour(0)
    })

    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion?.textContent).toBe('Step 1 of 6: Mode switch')

    // Advance to step 2
    const nextBtn = container.querySelector<HTMLButtonElement>('button.primary')
    await act(async () => {
      nextBtn?.click()
    })

    expect(liveRegion?.textContent).toBe('Step 2 of 6: Places')
  })

  it('moves focus to the dialog card on open and preserves button focus on next step', async () => {
    await act(async () => {
      root.render(createElement(Tour))
    })

    await act(async () => {
      useTourStore.getState().openTour(0)
    })

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')
    expect(document.activeElement).toBe(dialog)

    const nextBtn = container.querySelector<HTMLButtonElement>('button.primary')
    nextBtn?.focus()
    expect(document.activeElement).toBe(nextBtn)

    await act(async () => {
      nextBtn?.click()
    })

    // Focus stays on nextBtn, not forcibly reassigned
    expect(document.activeElement).toBe(nextBtn)
  })

  it('returns focus to previously active element on close if still present', async () => {
    const customButton = document.createElement('button')
    customButton.textContent = 'Active control'
    document.body.appendChild(customButton)
    customButton.focus()
    expect(document.activeElement).toBe(customButton)

    await act(async () => {
      root.render(createElement(Tour))
    })

    await act(async () => {
      useTourStore.getState().openTour(0)
    })

    const skipBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Skip tutorial',
    )
    await act(async () => {
      skipBtn?.click()
    })

    expect(document.activeElement).toBe(customButton)
    customButton.remove()
  })
})
