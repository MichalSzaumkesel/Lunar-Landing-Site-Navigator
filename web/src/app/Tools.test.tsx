// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tools } from './Tools'
import { useAppStore } from '../state/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Tools component - Export dossier wiring', () => {
  let container: HTMLDivElement
  let root: Root
  let printSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    printSpy = vi.fn()
    window.print = printSpy as unknown as () => void
    act(() => {
      useAppStore.setState({ mode: 'advanced' })
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders an "Export dossier" button with accessible attributes', () => {
    act(() => {
      root.render(createElement(Tools))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const dossierBtn = buttons.find((b) => b.textContent?.includes('Export dossier'))
    expect(dossierBtn).toBeDefined()
    expect(dossierBtn?.getAttribute('aria-label')).toBe('Export dossier')
    expect(dossierBtn?.getAttribute('title')).toContain('Export dossier')
    expect(dossierBtn?.disabled).toBe(false)
  })

  it('triggers browser print dialog when "Export dossier" is clicked', () => {
    act(() => {
      root.render(createElement(Tools))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const dossierBtn = buttons.find((b) => b.textContent?.includes('Export dossier'))
    expect(dossierBtn).toBeDefined()

    act(() => {
      dossierBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('disables "Export dossier" button in simple mode', () => {
    act(() => {
      useAppStore.setState({ mode: 'simple' })
    })

    act(() => {
      root.render(createElement(Tools))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const dossierBtn = buttons.find((b) => b.textContent?.includes('Export dossier'))
    expect(dossierBtn).toBeDefined()
    expect(dossierBtn?.disabled).toBe(true)

    act(() => {
      dossierBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(printSpy).not.toHaveBeenCalled()
  })

  it('renders PrintBrief element for media print layout', () => {
    act(() => {
      root.render(createElement(Tools))
    })

    const brief = container.querySelector('.print-brief-container')
    expect(brief).toBeTruthy()
  })
})
