// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSoundEngine, SOUND_STORAGE_KEY, SOUND_VOLUME_STORAGE_KEY } from '../../lib/sound'
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

  it('renders with visible label "Sound:", three-state buttons (Off/Ambient/Cues) with default Off, and volume slider', async () => {
    const engine = createSoundEngine()

    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })

    const label = container.querySelector('#sound-mode-label')
    expect(label?.textContent?.trim()).toBe('Sound:')

    const buttons = container.querySelectorAll<HTMLButtonElement>('button')
    expect(buttons.length).toBe(3)
    expect(buttons[0].textContent?.trim()).toBe('Off')
    expect(buttons[1].textContent?.trim()).toBe('Ambient')
    expect(buttons[2].textContent?.trim()).toBe('Cues')

    // Default Off is active
    expect(buttons[0].getAttribute('aria-checked')).toBe('true')
    expect(buttons[1].getAttribute('aria-checked')).toBe('false')
    expect(buttons[2].getAttribute('aria-checked')).toBe('false')

    // Volume slider defaults to 40%
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')
    expect(slider).not.toBeNull()
    expect(slider?.value).toBe('40')
    expect(slider?.getAttribute('aria-label')).toBe('Sound volume')

    // No hint visible when Off
    expect(container.querySelector('.sound-control__hint')).toBeNull()
  })

  it('switches to Ambient mode on click, displays one-line hint, and persists to localStorage', async () => {
    const engine = createSoundEngine()
    const setModeSpy = vi.spyOn(engine, 'setMode')

    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })

    const ambientBtn = container.querySelectorAll<HTMLButtonElement>('button')[1]

    await act(async () => {
      ambientBtn.click()
    })

    expect(setModeSpy).toHaveBeenCalledWith('ambient')
    expect(engine.getMode()).toBe('ambient')
    expect(engine.isEnabled()).toBe(true)
    expect(ambientBtn.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('ambient')

    // Hint appears when Ambient is selected
    const hint = container.querySelector('.sound-control__hint')
    expect(hint?.textContent?.trim()).toBe(
      'Sun and Earth fade in and out with visibility.',
    )
  })

  it('switches to Cues mode on click and hides the ambient hint', async () => {
    const engine = createSoundEngine()
    const setModeSpy = vi.spyOn(engine, 'setMode')

    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })

    const cuesBtn = container.querySelectorAll<HTMLButtonElement>('button')[2]

    await act(async () => {
      cuesBtn.click()
    })

    expect(setModeSpy).toHaveBeenCalledWith('cues')
    expect(engine.getMode()).toBe('cues')
    expect(engine.isEnabled()).toBe(true)
    expect(cuesBtn.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('cues')
    expect(container.querySelector('.sound-control__hint')).toBeNull()
  })

  it('switches back to Off mode on click', async () => {
    const engine = createSoundEngine()
    engine.setMode('ambient')

    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })

    const offBtn = container.querySelectorAll<HTMLButtonElement>('button')[0]

    await act(async () => {
      offBtn.click()
    })

    expect(engine.getMode()).toBe('off')
    expect(engine.isEnabled()).toBe(false)
    expect(offBtn.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('off')
  })

  it('adjusts volume slider, updates engine, and persists to localStorage', async () => {
    const engine = createSoundEngine()
    const setVolSpy = vi.spyOn(engine, 'setVolume')

    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })

    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      valueSetter?.call(slider, '70')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(setVolSpy).toHaveBeenCalledWith(0.7)
    expect(slider.value).toBe('70')
    expect(localStorage.getItem(SOUND_VOLUME_STORAGE_KEY)).toBe('0.7')
  })
})
