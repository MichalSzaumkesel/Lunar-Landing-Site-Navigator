// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { revealSections, sectionsForTarget, selectOpen, useDisclosureStore } from './disclosure'

beforeEach(() => {
  localStorage.clear()
  useDisclosureStore.setState({ stored: {}, forced: [], exploreTab: 'sites' })
})

describe('disclosure store', () => {
  it('is collapsed by default', () => {
    expect(selectOpen(useDisclosureStore.getState(), 'dates')).toBe(false)
  })

  it('remembers the choice per section in localStorage', () => {
    useDisclosureStore.getState().setOpen('metrics', true)
    expect(localStorage.getItem('lunar.disclosure.metrics')).toBe('1')
    useDisclosureStore.setState({ stored: {} })
    expect(selectOpen(useDisclosureStore.getState(), 'metrics')).toBe(true)
    expect(selectOpen(useDisclosureStore.getState(), 'dates')).toBe(false)
  })

  it('survives blocked storage', () => {
    const orig = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    try {
      expect(selectOpen(useDisclosureStore.getState(), 'rules')).toBe(false)
    } finally {
      Storage.prototype.getItem = orig
    }
  })

  it('forces sections open without changing the stored choice', () => {
    revealSections(['timeline'])
    expect(selectOpen(useDisclosureStore.getState(), 'timeline')).toBe(true)
    expect(localStorage.getItem('lunar.disclosure.timeline')).toBeNull()
    revealSections([])
    expect(selectOpen(useDisclosureStore.getState(), 'timeline')).toBe(false)
  })

  it('opens the explore area on a tab', () => {
    useDisclosureStore.getState().openExplore('window-map')
    const s = useDisclosureStore.getState()
    expect(s.exploreTab).toBe('window-map')
    expect(selectOpen(s, 'explore')).toBe(true)
  })
})

describe('sectionsForTarget', () => {
  it('maps tour targets to the sections that hold them', () => {
    expect(sectionsForTarget('[data-tour="timeline"]')).toEqual(['timeline'])
    expect(sectionsForTarget('[data-tour="chips"]')).toEqual(['metrics'])
    expect(sectionsForTarget('[data-tour="scenario-controls"]')).toEqual(['dates'])
    expect(sectionsForTarget('[data-tour="panels"]')).toEqual(['explore'])
    expect(sectionsForTarget('[data-tour="sky-plot"]')).toEqual([])
  })
})
