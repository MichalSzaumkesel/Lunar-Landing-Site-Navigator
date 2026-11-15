// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHROME_HIDE_MS, useFullscreenChrome } from './useFullscreenChrome'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ rootEl }: { rootEl: HTMLElement }) {
  useFullscreenChrome({ current: rootEl })
  return null
}

describe('useFullscreenChrome', () => {
  let host: HTMLDivElement
  let surface: HTMLDivElement
  let reactRoot: Root

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    surface = document.createElement('div')
    surface.className = 'surface'
    surface.innerHTML = '<div class="surface__frame"></div><div class="surface__side"></div>'
    host.appendChild(surface)
    document.body.appendChild(host)
    reactRoot = createRoot(document.createElement('div'))
  })

  afterEach(() => {
    act(() => reactRoot.unmount())
    host.remove()
    vi.useRealTimers()
  })

  it('does nothing outside full screen', () => {
    act(() => reactRoot.render(createElement(Probe, { rootEl: surface })))
    expect(surface.hasAttribute('data-chrome')).toBe(false)
  })

  it('shows on entering full screen, hides when idle and returns on pointer activity', async () => {
    act(() => reactRoot.render(createElement(Probe, { rootEl: surface })))
    host.setAttribute('data-fullscreen', 'true')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(surface.getAttribute('data-chrome')).toBe('shown')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHROME_HIDE_MS + 50)
    })
    expect(surface.getAttribute('data-chrome')).toBe('hidden')
    act(() => {
      surface.dispatchEvent(new Event('pointermove', { bubbles: true }))
    })
    expect(surface.getAttribute('data-chrome')).toBe('shown')
    host.removeAttribute('data-fullscreen')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(surface.hasAttribute('data-chrome')).toBe(false)
  })
})
