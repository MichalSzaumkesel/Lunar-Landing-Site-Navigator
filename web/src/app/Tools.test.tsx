// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Tools } from './Tools'
import { useAppStore } from '../state/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Tools - Share and export menu', () => {
  let container: HTMLDivElement
  let root: Root
  let printSpy: ReturnType<typeof vi.fn>

  const trigger = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!
  const items = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  const click = (el: Element) =>
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  const key = (el: Element, k: string) =>
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    })

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    printSpy = vi.fn()
    window.print = printSpy as unknown as () => void
    act(() => {
      useAppStore.setState({ mode: 'advanced' })
      root.render(createElement(Tools))
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('shows one button and a closed menu', () => {
    expect(trigger().textContent).toContain('Share and export')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(items()).toHaveLength(0)
  })

  it('opens a menu with four items and focuses the first', () => {
    click(trigger())
    expect(container.querySelector('[role="menu"]')).toBeTruthy()
    expect(items().map((i) => i.querySelector('.share-menu__title')?.textContent)).toEqual([
      'Copy link',
      'Export CSV',
      'Export dossier',
      'Copy Horizons query',
    ])
    expect(document.activeElement).toBe(items()[0])
  })

  it('moves focus with arrow keys and closes on Escape, returning focus', () => {
    click(trigger())
    key(items()[0], 'ArrowDown')
    expect(document.activeElement).toBe(items()[1])
    key(items()[1], 'ArrowUp')
    expect(document.activeElement).toBe(items()[0])
    key(items()[0], 'Escape')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on outside pointerdown', () => {
    click(trigger())
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('Export dossier prints and closes the menu', () => {
    click(trigger())
    click(items()[2])
    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('Copy link writes the share URL and confirms on the button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    click(trigger())
    await act(async () => {
      items()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(trigger().textContent).toContain('Link copied')
  })

  it('disables CSV and dossier in simple mode', () => {
    act(() => useAppStore.setState({ mode: 'simple' }))
    click(trigger())
    expect(items().map((i) => i.disabled)).toEqual([false, true, true, true])
  })

  it('renders the brief as a direct child of body for print', () => {
    expect(document.body.querySelector(':scope > .print-brief-container')).toBeTruthy()
  })
})

describe('print CSS', () => {
  const css = readFileSync(resolve(__dirname, '../components/print/print.css'), 'utf-8')
  const printPart = css.slice(css.indexOf('@media print'))

  it('removes the app from layout instead of using visibility:hidden', () => {
    expect(printPart).toContain('body > *:not(.print-brief-container)')
    expect(printPart).not.toContain('visibility: hidden')
    expect(printPart).not.toContain('position: absolute')
  })

  it('overrides the on-screen display:none with equal specificity', () => {
    expect(printPart).toContain('.print-brief-container:not(.print-brief-container--visible)')
  })
})
