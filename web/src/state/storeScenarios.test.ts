import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_SCENARIOS } from '../config/dataRange'
import { useAppStore } from './store'
import type { Scenario } from './types'

function scenario(id: string, durationH = 720): Scenario {
  return { id, siteId: 'apollo_11', startUtc: '2027-08-30T00:00:00Z', durationH, slipDays: 0 }
}

function setScenarios(list: Scenario[], activeScenarioId: string): void {
  useAppStore.setState({
    scenarios: list,
    activeScenarioId,
    cursorH: 0,
    playing: false,
    speedHPerSec: 1,
  })
}

describe('useAppStore scenarios', () => {
  beforeEach(() => {
    setScenarios([scenario('sc1')], 'sc1')
  })

  it('refuses to add a scenario beyond MAX_SCENARIOS', () => {
    const full = Array.from({ length: MAX_SCENARIOS }, (_, i) => scenario(`sc${i + 1}`))
    setScenarios(full, 'sc1')

    expect(useAppStore.getState().addScenario({ siteId: 'apollo_11' })).toBeNull()
    expect(useAppStore.getState().scenarios).toHaveLength(MAX_SCENARIOS)
  })

  it('appends a scenario below the cap and makes it active', () => {
    setScenarios([scenario('sc1'), scenario('sc2')], 'sc1')

    const id = useAppStore.getState().addScenario({ siteId: 'artemis_region_1', durationH: 168 })

    expect(id).not.toBeNull()
    const state = useAppStore.getState()
    expect(state.scenarios).toHaveLength(3)
    expect(state.scenarios[2]).toMatchObject({ id, siteId: 'artemis_region_1', durationH: 168 })
    expect(state.activeScenarioId).toBe(id)
  })

  it('falls back to the first remaining scenario when the active one is removed', () => {
    setScenarios([scenario('sc1'), scenario('sc2')], 'sc2')

    useAppStore.getState().removeScenario('sc2')

    const state = useAppStore.getState()
    expect(state.scenarios.map((s) => s.id)).toEqual(['sc1'])
    expect(state.activeScenarioId).toBe('sc1')
  })

  it('never removes the last remaining scenario', () => {
    setScenarios([scenario('sc1')], 'sc1')

    useAppStore.getState().removeScenario('sc1')

    expect(useAppStore.getState().scenarios.map((s) => s.id)).toEqual(['sc1'])
  })
})

describe('useAppStore playback tick', () => {
  beforeEach(() => {
    setScenarios([scenario('sc1', 720)], 'sc1')
  })

  it('advances cursorH by dt times speed while playing', () => {
    useAppStore.setState({ playing: true, cursorH: 10, speedHPerSec: 6 })

    useAppStore.getState().tick(0.5)

    expect(useAppStore.getState().cursorH).toBeCloseTo(13, 10)
  })

  it('does not move the cursor while paused', () => {
    useAppStore.setState({ playing: false, cursorH: 10, speedHPerSec: 6 })

    useAppStore.getState().tick(1)

    expect(useAppStore.getState().cursorH).toBe(10)
  })

  it('wraps at the shortest scenario duration', () => {
    setScenarios([scenario('sc1', 720), scenario('sc2', 168)], 'sc1')
    useAppStore.setState({ playing: true, cursorH: 167, speedHPerSec: 2 })

    useAppStore.getState().tick(1)

    // 167 + 2 = 169, and 169 % 168 = 1
    expect(useAppStore.getState().cursorH).toBe(1)
  })
})
