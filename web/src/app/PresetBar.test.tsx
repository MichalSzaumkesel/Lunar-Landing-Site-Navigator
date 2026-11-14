// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PRESET_APOLLO_VS_ARTEMIS } from '../config/presets'
import { useAppStore } from '../state/store'
import { PresetBar } from './PresetBar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PresetBar demo hook #1', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useAppStore.setState({
      mode: 'advanced',
      playing: false,
      cursorH: 42,
      scenarios: [
        { id: 'sc1', siteId: 'southpole_landed', startUtc: '2027-08-30T00:00:00Z', durationH: 720, slipDays: 0 },
      ],
      activeScenarioId: 'sc1',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(createElement(PresetBar)))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('applies the Apollo 11 vs South Pole preset with one click', () => {
    const button = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === PRESET_APOLLO_VS_ARTEMIS.label,
    )
    expect(button).toBeDefined()

    act(() => button?.click())

    const state = useAppStore.getState()
    expect(state.scenarios.map((s) => s.siteId)).toEqual(['apollo_11', 'artemis_region_1'])
    expect(state.scenarios.map((s) => s.id)).toEqual(
      [...new Set(state.scenarios.map((s) => s.id))],
    )
    expect(state.activeScenarioId).toBe(state.scenarios[0].id)
    expect(state.cursorH).toBe(0)
    expect(state.playing).toBe(false)
  })

  it('marks the Apollo vs Artemis button as the featured preset', () => {
    const featured = container.querySelector('button.preset-featured')

    expect(featured?.textContent).toBe(PRESET_APOLLO_VS_ARTEMIS.label)
  })
})
