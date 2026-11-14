// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESET_APOLLO_VS_ARTEMIS } from '../../config/presets'
import { useAppStore } from '../../state/store'
import { AddScenarioMenu } from './AddScenarioMenu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('AddScenarioMenu', () => {
  let container: HTMLDivElement
  let root: Root
  const onAdd = vi.fn()

  beforeEach(() => {
    onAdd.mockClear()
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
    act(() =>
      root.render(
        createElement(AddScenarioMenu, {
          full: false,
          onAdd,
          onPreset: (p) => useAppStore.getState().applyPreset(p),
        }),
      ),
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const open = () => act(() => container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.click())

  it('main part adds a card without opening the menu', () => {
    act(() => container.querySelector<HTMLButtonElement>('.add-menu__main')?.click())
    expect(onAdd).toHaveBeenCalledOnce()
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  it('lists Add card and the three presets with descriptions', () => {
    open()
    const items = [...container.querySelectorAll('[role="menuitem"]')]
    expect(items).toHaveLength(4)
    expect(items[0].textContent).toContain('Add card')
    expect(items[0].textContent).toContain('Adds a card for the same site and dates.')
    expect(container.querySelector('[role="separator"]')).not.toBeNull()
    expect(container.textContent).toContain('Presets')
  })

  it('applies the Compare preset from the menu and closes it', () => {
    open()
    const item = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) =>
      b.textContent?.includes(PRESET_APOLLO_VS_ARTEMIS.label),
    )
    expect(item).toBeDefined()
    act(() => item?.click())
    const state = useAppStore.getState()
    expect(state.scenarios.map((s) => s.siteId)).toEqual(['apollo_11', 'artemis_region_1'])
    expect(state.cursorH).toBe(0)
    expect(state.playing).toBe(false)
    expect(container.querySelector('[aria-haspopup="menu"]')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes on Escape', () => {
    open()
    act(() => {
      container
        .querySelector('[role="menu"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('[aria-haspopup="menu"]')?.getAttribute('aria-expanded')).toBe('false')
  })
})
