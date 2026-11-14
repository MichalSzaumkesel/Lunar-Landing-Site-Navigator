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

  it('renders with label "Sound:" and Off/Ambient/Cues buttons, default Off', async () => {
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

    // No volume slider and no hint when Off
    expect(container.querySelector('[role="slider"]')).toBeNull()
    expect(container.textContent).not.toContain('fade in and out')
  })

  it('stableLayout: the slider mounts inline only while sound is on', async () => {
    const engine = createSoundEngine()
    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })
    expect(container.querySelector('[role="slider"]')).toBeNull()
    const modes = container.querySelector('[role="radiogroup"]')
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('button')[1].click()
    })
    expect(container.querySelector('[role="radiogroup"]')).toBe(modes)
    expect(container.querySelector('[role="slider"]')).not.toBeNull()
  })

  it('switches to Ambient mode on click and persists to localStorage', async () => {
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

    const slider = container.querySelector('[role="slider"]')
    expect(slider?.getAttribute('aria-label')).toBe('Volume')
    expect(slider?.getAttribute('aria-valuemin')).toBe('0')
    expect(slider?.getAttribute('aria-valuemax')).toBe('100')
    expect(slider?.getAttribute('aria-valuenow')).toBe('40')
  })

  it('switches to Cues mode on click', async () => {
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

  it('changes volume with the keyboard, updates engine, and persists', async () => {
    const engine = createSoundEngine()
    engine.setMode('ambient')
    const setVolSpy = vi.spyOn(engine, 'setVolume')

    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })

    const slider = container.querySelector<HTMLElement>('[role="slider"]')!
    const press = async (key: string): Promise<void> => {
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      })
    }

    await press('ArrowRight')
    expect(setVolSpy).toHaveBeenLastCalledWith(0.45)
    expect(slider.getAttribute('aria-valuenow')).toBe('45')
    expect(localStorage.getItem(SOUND_VOLUME_STORAGE_KEY)).toBe('0.45')

    await press('End')
    expect(slider.getAttribute('aria-valuenow')).toBe('100')
    await press('Home')
    expect(slider.getAttribute('aria-valuenow')).toBe('0')
  })

  it('removes the slider after switching back to Off', async () => {
    vi.useFakeTimers()
    const engine = createSoundEngine()
    engine.setMode('cues')

    await act(async () => {
      root.render(createElement(SoundToggle, { engine }))
    })
    expect(container.querySelector('[role="slider"]')).not.toBeNull()

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('button')[0].click()
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(container.querySelector('[role="slider"]')).toBeNull()
    vi.useRealTimers()
  })
})
