// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrintButton } from './PrintButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PrintButton component', () => {
  let container: HTMLDivElement
  let root: Root
  let printSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    printSpy = vi.fn()
    window.print = printSpy as unknown as () => void
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders button with label "Print brief" and accessible aria-label', () => {
    act(() => {
      root.render(createElement(PrintButton))
    })

    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    expect(button?.textContent).toContain('Print brief')
    expect(button?.getAttribute('aria-label')).toBe('Print brief')
  })

  it('calls window.print when clicked', () => {
    act(() => {
      root.render(createElement(PrintButton))
    })

    const button = container.querySelector('button')
    expect(button).toBeTruthy()

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('does not call window.print when disabled', () => {
    act(() => {
      root.render(createElement(PrintButton, { disabled: true }))
    })

    const button = container.querySelector('button')
    expect(button?.disabled).toBe(true)

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(printSpy).not.toHaveBeenCalled()
  })

  it('renders the hidden PrintBrief container by default', () => {
    act(() => {
      root.render(createElement(PrintButton))
    })

    const brief = container.querySelector('.print-brief-container')
    expect(brief).toBeTruthy()
  })

  it('allows omitting the PrintBrief container via renderBrief={false}', () => {
    act(() => {
      root.render(createElement(PrintButton, { renderBrief: false }))
    })

    const brief = container.querySelector('.print-brief-container')
    expect(brief).toBeNull()
  })

  it('allows custom aria-label and className', () => {
    act(() => {
      root.render(
        createElement(PrintButton, {
          'aria-label': 'Print mission brief report',
          className: 'custom-print-style',
        }),
      )
    })

    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-label')).toBe('Print mission brief report')
    expect(button?.classList.contains('custom-print-style')).toBe(true)
  })
})
