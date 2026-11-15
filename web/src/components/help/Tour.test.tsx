// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tour } from './Tour'
import { placeTourCard } from './tourPlacement'
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

  describe('step transitions', () => {
    const outOfView = { top: 2000, bottom: 2040, left: 10, right: 110, width: 100, height: 40 }
    let rect: typeof outOfView
    let scrollSpy: ReturnType<typeof vi.fn>

    const mount = async (reduce: boolean) => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as never
      await act(async () => {
        root.render(createElement(Tour))
      })
      await act(async () => {
        useTourStore.getState().openTour(0)
      })
    }
    const advance = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
      })
    }
    const card = () => container.querySelector('[role="dialog"]') as HTMLElement
    const cutout = () => container.querySelector('.tour-cutout')

    beforeEach(() => {
      vi.useFakeTimers()
      rect = { ...outOfView }
      scrollSpy = vi.fn()
      Element.prototype.scrollIntoView = scrollSpy as never
      Element.prototype.getBoundingClientRect = (() => rect) as never
      Object.defineProperty(window, 'onscrollend', { value: null, configurable: true })
    })
    afterEach(() => {
      vi.useRealTimers()
      delete (window as { onscrollend?: unknown }).onscrollend
    })

    it('hides the overlay during a smooth scroll and shows it after scrollend', async () => {
      await mount(false)
      expect(card().classList.contains('tour-card--on')).toBe(false)
      await advance(130)
      expect(scrollSpy).toHaveBeenCalledWith(
        expect.objectContaining({ block: 'center', behavior: 'smooth' }),
      )
      rect = { ...rect, top: 300, bottom: 340 }
      await advance(300)
      expect(card().classList.contains('tour-card--on')).toBe(false)
      expect(cutout()?.classList.contains('tour-cutout--on')).toBe(false)
      await act(async () => {
        window.dispatchEvent(new Event('scrollend'))
      })
      expect(card().classList.contains('tour-card--on')).toBe(true)
      expect(cutout()?.classList.contains('tour-cutout--on')).toBe(true)
      expect((cutout() as HTMLElement).style.transform).toContain('296px')
    })

    it('keeps the spotlight (the only dimming layer) mounted while the step changes', async () => {
      await mount(true)
      await advance(5)
      const frame = cutout()
      expect(frame).not.toBeNull()
      await act(async () => {
        useTourStore.getState().openTour(1)
      })
      expect(cutout()).toBe(frame)
      await advance(5)
      expect(cutout()).toBe(frame)
    })

    describe('spotlight glide', () => {
      let animate: ReturnType<typeof vi.fn>
      beforeEach(() => {
        animate = vi.fn()
        Element.prototype.animate = animate as never
      })
      afterEach(() => {
        delete (Element.prototype as { animate?: unknown }).animate
      })

      const settledAt = async (r: typeof outOfView, step: number) => {
        rect = r
        await act(async () => {
          useTourStore.getState().openTour(step)
        })
        await advance(400)
      }
      const inView = { top: 100, bottom: 140, left: 10, right: 110, width: 100, height: 40 }
      const elsewhere = { top: 300, bottom: 360, left: 400, right: 600, width: 200, height: 60 }

      it('glides from the old rect to the new one with transform only, once per step', async () => {
        await mount(false)
        await settledAt(inView, 0)
        expect(animate).not.toHaveBeenCalled()
        await settledAt(elsewhere, 1)
        expect(animate).toHaveBeenCalledTimes(1)
        const [frames, options] = animate.mock.calls[0]
        expect(Object.keys(frames[0])).toEqual(['transform'])
        expect(frames[0].transform).toContain('translate(6px, 96px)')
        expect(frames[1].transform).toBe('translate(396px, 296px)')
        expect(options.duration).toBeLessThanOrEqual(350)
        // Position is always a transform, never an inline top or left
        const style = (cutout() as HTMLElement).style
        expect(style.top).toBe('')
        expect(style.left).toBe('')
        expect(style.transform).toBe('translate(396px, 296px)')
      })

      it('does not glide with reduced motion', async () => {
        await mount(true)
        await settledAt(inView, 0)
        await settledAt(elsewhere, 1)
        expect(animate).not.toHaveBeenCalled()
      })
    })

    it('falls back to polling the target rect when scrollend is missing', async () => {
      delete (window as { onscrollend?: unknown }).onscrollend
      await mount(false)
      await advance(130)
      expect(card().classList.contains('tour-card--on')).toBe(false)
      rect = { ...rect, top: 300, bottom: 340 }
      await advance(50)
      expect(card().classList.contains('tour-card--on')).toBe(false)
      await advance(200)
      expect(card().classList.contains('tour-card--on')).toBe(true)
    })

    it('shows immediately with reduced motion and when the target is in view', async () => {
      await mount(true)
      await advance(5)
      expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
      expect(card().classList.contains('tour-card--on')).toBe(true)

      await act(async () => {
        root.render(null)
      })
      scrollSpy.mockClear()
      rect = { top: 100, bottom: 140, left: 10, right: 110, width: 100, height: 40 }
      await mount(false)
      await advance(130)
      expect(scrollSpy).not.toHaveBeenCalled()
      expect(card().classList.contains('tour-card--on')).toBe(true)
    })
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

  describe('keys while the tour is open', () => {
    const key = (target: EventTarget, k: string) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
      target.dispatchEvent(e)
      return e
    }
    const open = async () => {
      await act(async () => {
        root.render(createElement(Tour))
      })
      await act(async () => {
        useTourStore.getState().openTour(0)
      })
    }

    it('Back stays focusable (aria-disabled) on step 1, so focus is never dropped to the page', async () => {
      await open()
      const back = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Back') as HTMLButtonElement
      expect(back.disabled).toBe(false)
      expect(back.getAttribute('aria-disabled')).toBe('true')

      const next = container.querySelector<HTMLButtonElement>('button.primary') as HTMLButtonElement
      await act(async () => {
        next.click()
      })
      expect(back.getAttribute('aria-disabled')).toBe('false')
      back.focus()
      await act(async () => {
        back.click()
      })
      expect(useTourStore.getState().stepIndex).toBe(0)
      // Back is now inactive but still holds focus, and Escape works from there
      expect(document.activeElement).toBe(back)
      await act(async () => {
        key(back, 'Escape')
      })
      expect(useTourStore.getState().isOpen).toBe(false)
    })

    it('an inactive Back does nothing when clicked', async () => {
      await open()
      const back = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Back') as HTMLButtonElement
      await act(async () => {
        back.click()
      })
      expect(useTourStore.getState().stepIndex).toBe(0)
      expect(useTourStore.getState().isOpen).toBe(true)
    })

    it('Escape and the arrows work with focus on the page body, outside the card', async () => {
      await open()
      ;(document.activeElement as HTMLElement | null)?.blur()
      expect(document.activeElement).toBe(document.body)

      const right = key(document.body, 'ArrowRight')
      await act(async () => {})
      expect(right.defaultPrevented).toBe(true)
      expect(useTourStore.getState().stepIndex).toBe(1)

      key(document.body, 'ArrowLeft')
      await act(async () => {})
      expect(useTourStore.getState().stepIndex).toBe(0)

      await act(async () => {
        key(document.body, 'Escape')
      })
      expect(useTourStore.getState().isOpen).toBe(false)
    })

    it('leaves Escape to an open menu and the arrows to a slider or a text field', async () => {
      await open()
      const menu = document.createElement('div')
      menu.setAttribute('role', 'menu')
      menu.innerHTML = '<button role="menuitem">Item</button>'
      const range = document.createElement('input')
      range.type = 'range'
      const text = document.createElement('input')
      text.type = 'text'
      document.body.append(menu, range, text)
      try {
        const item = menu.firstElementChild as HTMLElement
        expect(key(item, 'Escape').defaultPrevented).toBe(false)
        expect(useTourStore.getState().isOpen).toBe(true)
        key(range, 'ArrowRight')
        key(text, 'ArrowRight')
        expect(useTourStore.getState().stepIndex).toBe(0)
      } finally {
        menu.remove()
        range.remove()
        text.remove()
      }
    })

    it('does not listen once the tour is closed', async () => {
      await open()
      await act(async () => {
        useTourStore.getState().closeTour()
      })
      const e = key(document.body, 'ArrowRight')
      expect(e.defaultPrevented).toBe(false)
    })
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

describe('placeTourCard', () => {
  const view = { w: 844, h: 390 }
  const card = { w: 340, h: 200 }
  const overlaps = (p: { top: number; left: number }, s: { left: number; top: number; right: number; bottom: number }) =>
    p.left < s.right && p.left + card.w > s.left && p.top < s.bottom && p.top + card.h > s.top

  it('puts the card beside the target in landscape instead of over it', () => {
    const spot = { left: 20, top: 70, right: 300, bottom: 320 }
    const p = placeTourCard(card, spot, view, 'right', 16, 12)
    expect(overlaps(p, spot)).toBe(false)
  })

  it('flips to the side with room when the preferred side does not fit', () => {
    const spot = { left: 520, top: 70, right: 820, bottom: 320 }
    const p = placeTourCard(card, spot, view, 'right', 16, 12)
    expect(overlaps(p, spot)).toBe(false)
    expect(p.left + card.w).toBeLessThanOrEqual(spot.left)
  })

  it('stays inside the viewport and picks the least overlap when nothing is free', () => {
    const spot = { left: 8, top: 8, right: 836, bottom: 382 }
    const p = placeTourCard(card, spot, view, 'bottom', 16, 12)
    expect(p.left).toBeGreaterThanOrEqual(16)
    expect(p.top).toBeGreaterThanOrEqual(16)
    expect(p.left + card.w).toBeLessThanOrEqual(view.w - 16)
    expect(p.top + card.h).toBeLessThanOrEqual(view.h - 16)
  })
})
