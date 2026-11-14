// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SkyHelp } from './SkyHelp'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SkyHelp', () => {
  let container: HTMLDivElement
  let root: Root

  const render = (centreText: string) => {
    act(() => {
      root.render(createElement(SkyHelp, { centreText }))
    })
  }
  const marker = () => container.querySelector('button') as HTMLButtonElement
  const tip = () => container.querySelector('[role="tooltip"]')

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders a focusable marker with an accessible name and no tooltip', () => {
    render('straight up')
    expect(marker().type).toBe('button')
    expect(marker().getAttribute('aria-label')).toBe('What does this diagram show?')
    expect(tip()).toBeNull()
  })

  it('shows the text on hover and hides it on mouse leave', () => {
    render('straight up')
    const wrap = container.querySelector('.sky-help') as HTMLElement
    act(() => {
      wrap.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    expect(tip()?.textContent).toBe('Sky seen from the ground. Gold circle: the Sun. Blue circle: the Earth. Grey: hills that block the sky. Centre: straight up. Edge: the horizon.')
    expect(marker().getAttribute('aria-describedby')).toBe(tip()?.id)
    act(() => {
      wrap.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    })
    expect(tip()?.getAttribute('data-state')).toBe('closed')
  })

  it('shows the text on focus and closes on Escape', () => {
    render('20° above the horizon (the plot is zoomed in)')
    act(() => marker().focus())
    expect(tip()?.textContent).toContain('Centre: 20° above the horizon (the plot is zoomed in). Edge: the horizon.')
    act(() => {
      marker().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(tip()?.getAttribute('data-state')).toBe('closed')
  })

  it('toggles on tap', () => {
    render('straight up')
    act(() => marker().click())
    expect(tip()?.getAttribute('data-state')).toBe('open')
    act(() => marker().click())
    expect(tip()?.getAttribute('data-state')).toBe('closed')
  })
})
