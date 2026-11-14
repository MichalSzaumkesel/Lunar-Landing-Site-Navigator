// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSoundEngine, SOUND_STORAGE_KEY } from '../../lib/sound'
import { SoundToggle } from './SoundToggle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SoundToggle', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.clear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders with default off state, aria-pressed=false, and contract tooltip', async () => {
    const engine = createSoundEngine()

    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })

    const button = container.querySelector('button')
    expect(button?.textContent).toBe('Sound off')
    expect(button?.getAttribute('aria-pressed')).toBe('false')
    expect(button?.title).toBe(
      'Short tones when the Sun or Earth rises or sets during Play',
    )
  })

  it('toggles engine state and updates localStorage on user click', async () => {
    const engine = createSoundEngine()
    const enableSpy = vi.spyOn(engine, 'enable')
    const disableSpy = vi.spyOn(engine, 'disable')

    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })

    const button = container.querySelector('button')!

    // Click 1: Turn ON
    await act(async () => {
      button.click()
    })

    expect(enableSpy).toHaveBeenCalled()
    expect(engine.isEnabled()).toBe(true)
    expect(button.textContent).toBe('Sound on')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('true')

    // Click 2: Turn OFF
    await act(async () => {
      button.click()
    })

    expect(disableSpy).toHaveBeenCalled()
    expect(engine.isEnabled()).toBe(false)
    expect(button.textContent).toBe('Sound off')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('false')
  })
})
