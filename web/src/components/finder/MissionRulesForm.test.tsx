// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../state/store'
import { MissionRulesForm } from './MissionRulesForm'

// Tell React this is an act() environment.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('MissionRulesForm', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    // Reset store to default
    act(() => {
      useAppStore.setState({
        observerHeightM: 2,
        missionRules: {
          observerHeightM: 2,
          missionDurationH: 240,
          minPctSunlit: 70,
          maxLongestDarkH: 48,
          earthAtLandingRequired: true,
          minPctEarth: 50,
          minSunElAtLandingDeg: undefined,
        },
      })
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders form fields with labels, units, and observer height', async () => {
    await act(async () => {
      root.render(createElement(MissionRulesForm))
    })

    const durationInput = container.querySelector('#rule-missionDurationH') as HTMLInputElement
    const sunlitInput = container.querySelector('#rule-minPctSunlit') as HTMLInputElement
    const darkInput = container.querySelector('#rule-maxLongestDarkH') as HTMLInputElement
    const earthCheckbox = container.querySelector('#rule-earthAtLandingRequired') as HTMLInputElement
    const earthInput = container.querySelector('#rule-minPctEarth') as HTMLInputElement
    const sunElInput = container.querySelector('#rule-minSunElAtLandingDeg') as HTMLInputElement

    expect(durationInput).not.toBeNull()
    expect(durationInput.value).toBe('240')
    expect(sunlitInput.value).toBe('70')
    expect(darkInput.value).toBe('48')
    expect(earthCheckbox.checked).toBe(true)
    expect(earthInput.value).toBe('50')
    expect(sunElInput.value).toBe('')

    // Observer height text
    const observerText = container.querySelector('.finder-form__observer')
    expect(observerText?.textContent).toContain('Observer height 2 m, change it in the top bar')
  })

  function setInputValue(input: HTMLInputElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  it('updates store when valid input is entered', async () => {
    await act(async () => {
      root.render(createElement(MissionRulesForm))
    })

    const durationInput = container.querySelector('#rule-missionDurationH') as HTMLInputElement

    await act(async () => {
      setInputValue(durationInput, '120')
    })

    expect(useAppStore.getState().missionRules.missionDurationH).toBe(120)
    expect(container.querySelector('#error-missionDurationH')).toBeNull()
  })

  it('keeps previous store value and shows inline error when invalid number is entered', async () => {
    await act(async () => {
      root.render(createElement(MissionRulesForm))
    })

    const durationInput = container.querySelector('#rule-missionDurationH') as HTMLInputElement

    await act(async () => {
      setInputValue(durationInput, '2000')
    })

    // Store keeps previous valid value
    expect(useAppStore.getState().missionRules.missionDurationH).toBe(240)

    // Shows inline error message
    const errorEl = container.querySelector('#error-missionDurationH')
    expect(errorEl?.textContent).toBe('Must be between 1 and 1440 hours.')
  })

  it('applies quick presets correctly', async () => {
    await act(async () => {
      root.render(createElement(MissionRulesForm))
    })

    const presetButtons = container.querySelectorAll('.finder-form__preset-btn')
    const shortStayBtn = Array.from(presetButtons).find(
      (b) => b.textContent?.trim() === 'Short stay, 3 days'
    ) as HTMLButtonElement

    expect(shortStayBtn).toBeDefined()

    await act(async () => {
      shortStayBtn.click()
    })

    const rules = useAppStore.getState().missionRules
    expect(rules.missionDurationH).toBe(72)
    expect(rules.minPctSunlit).toBe(80)
    expect(rules.maxLongestDarkH).toBe(12)
    expect(rules.earthAtLandingRequired).toBe(true)
    expect(rules.minPctEarth).toBe(60)

    // Lunar day preset
    const lunarDayBtn = Array.from(presetButtons).find(
      (b) => b.textContent?.trim() === 'Lunar day, 14 days'
    ) as HTMLButtonElement

    await act(async () => {
      lunarDayBtn.click()
    })

    const lunarRules = useAppStore.getState().missionRules
    expect(lunarRules.missionDurationH).toBe(336)
    expect(lunarRules.minPctSunlit).toBe(50)
    expect(lunarRules.maxLongestDarkH).toBe(120)
    expect(lunarRules.earthAtLandingRequired).toBe(false)
    expect(lunarRules.minPctEarth).toBe(30)
  })

  it('restores default rules on reset to example mission', async () => {
    // Change state away from default
    act(() => {
      useAppStore.setState({
        missionRules: {
          observerHeightM: 2,
          missionDurationH: 72,
          minPctSunlit: 90,
          maxLongestDarkH: 6,
          earthAtLandingRequired: false,
          minPctEarth: 20,
        },
      })
    })

    await act(async () => {
      root.render(createElement(MissionRulesForm))
    })

    const resetBtn = container.querySelector('.finder-form__reset-btn') as HTMLButtonElement
    expect(resetBtn).not.toBeNull()

    await act(async () => {
      resetBtn.click()
    })

    const rules = useAppStore.getState().missionRules
    expect(rules.missionDurationH).toBe(240)
    expect(rules.minPctSunlit).toBe(70)
    expect(rules.maxLongestDarkH).toBe(48)
    expect(rules.earthAtLandingRequired).toBe(true)
    expect(rules.minPctEarth).toBe(50)
  })
})
