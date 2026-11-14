// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FullscreenButton } from './FullscreenButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Doc = Record<string, unknown>

describe('FullscreenButton', () => {
  let container: HTMLDivElement
  let target: HTMLDivElement
  let root: Root
  let current: Element | null
  const doc = document as unknown as Doc

  const render = (onChange?: (a: boolean) => void) => {
    const ref = createRef<HTMLDivElement>()
    act(() => {
      root.render(
        createElement('div', { ref }, createElement(FullscreenButton, { targetRef: ref, onChange })),
      )
    })
    target = ref.current as HTMLDivElement
  }
  const button = () => container.querySelector('button')
  const fire = () => act(() => void document.dispatchEvent(new Event('fullscreenchange')))

  const mockApi = (enabled = true) => {
    current = null
    doc.fullscreenEnabled = enabled
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current })
    doc.exitFullscreen = vi.fn(() => {
      current = null
      return Promise.resolve()
    })
    HTMLElement.prototype.requestFullscreen = vi.fn(() => {
      current = target
      return Promise.resolve()
    }) as never
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    delete doc.fullscreenEnabled
    delete doc.exitFullscreen
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen
    delete doc.fullscreenElement
  })

  it('enters and exits, syncing state from the fullscreenchange event', async () => {
    mockApi()
    const onChange = vi.fn()
    render(onChange)
    expect(button()?.getAttribute('aria-label')).toBe('Full screen')
    expect(button()?.getAttribute('aria-pressed')).toBe('false')

    await act(async () => button()?.click())
    expect(target.requestFullscreen).toHaveBeenCalled()
    fire()
    expect(button()?.getAttribute('aria-label')).toBe('Exit full screen')
    expect(button()?.getAttribute('aria-pressed')).toBe('true')
    expect(target.getAttribute('data-fullscreen')).toBe('true')
    expect(onChange).toHaveBeenLastCalledWith(true)

    await act(async () => button()?.click())
    expect(document.exitFullscreen).toHaveBeenCalled()
    fire()
    expect(button()?.getAttribute('aria-pressed')).toBe('false')
    expect(target.hasAttribute('data-fullscreen')).toBe(false)
  })

  it('follows Escape handled by the browser (event only)', async () => {
    mockApi()
    render()
    await act(async () => button()?.click())
    fire()
    current = null
    fire()
    expect(button()?.getAttribute('aria-pressed')).toBe('false')
  })

  it('hides the button when the API is unsupported', () => {
    render()
    expect(button()).toBeNull()
  })

  it('hides the button when fullscreen is disabled by the document', () => {
    mockApi(false)
    render()
    expect(button()).toBeNull()
  })
})
