// @vitest-environment jsdom
import { act, createElement } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../app/Transport', () => ({ Transport: () => createElement('div', { className: 'transport' }) }))
import { FullscreenStage } from './FullscreenStage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Doc = Record<string, unknown>

describe('FullscreenStage', () => {
  let container: HTMLDivElement
  let root: Root
  let current: Element | null
  const doc = document as unknown as Doc
  const fire = () => act(() => void document.dispatchEvent(new Event('fullscreenchange')))
  const stage = () => container.querySelector('.stage') as HTMLElement

  const render = (slot: 'a' | 'b', onChange?: (a: boolean) => void) =>
    act(() => {
      root.render(
        createElement(
          FullscreenStage,
          {
            className: 'stage',
            persistentExit: true,
            onChange,
            children: (btn: ReactNode) =>
              createElement('div', null, createElement('div', { key: slot, className: `slot-${slot}` }, btn)),
          },
        ),
      )
    })

  beforeEach(() => {
    current = null
    doc.fullscreenEnabled = true
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current })
    doc.exitFullscreen = vi.fn(() => {
      current = null
      return Promise.resolve()
    })
    HTMLElement.prototype.requestFullscreen = vi.fn(function (this: HTMLElement) {
      current = this
      return Promise.resolve()
    }) as never
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

  it('stays fullscreen when the slot the button lives in changes', async () => {
    const onChange = vi.fn()
    render('a', onChange)
    await act(async () => container.querySelector<HTMLButtonElement>('.fs-button')?.click())
    fire()
    expect(stage().getAttribute('data-fullscreen')).toBe('true')
    expect(container.querySelectorAll('.transport')).toHaveLength(1)
    // persistent exit button replaces the slot button
    expect(container.querySelectorAll('.fs-button')).toHaveLength(1)
    expect(container.querySelector('.fs-button--exit')?.getAttribute('aria-pressed')).toBe('true')

    render('b', onChange)
    expect(stage().getAttribute('data-fullscreen')).toBe('true')
    expect(container.querySelectorAll('.transport')).toHaveLength(1)
    expect(onChange).not.toHaveBeenLastCalledWith(false)

    await act(async () => container.querySelector<HTMLButtonElement>('.fs-button--exit')?.click())
    fire()
    expect(stage().hasAttribute('data-fullscreen')).toBe(false)
    expect(container.querySelectorAll('.transport')).toHaveLength(0)
    expect(container.querySelector('.slot-b .fs-button')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('exits fullscreen when the owner unmounts', async () => {
    render('a')
    await act(async () => container.querySelector<HTMLButtonElement>('.fs-button')?.click())
    fire()
    act(() => root.render(createElement('div')))
    expect(document.exitFullscreen).toHaveBeenCalled()
  })

  it('picks up an already active fullscreen on mount', () => {
    render('a')
    current = stage()
    render('a') // no event fired yet
    fire()
    expect(stage().getAttribute('data-fullscreen')).toBe('true')
  })
})
