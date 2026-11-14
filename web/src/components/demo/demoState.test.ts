// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../state/store'
import { useDemoStore } from './demoState'

const original = [
  { id: 'sc1', siteId: 'apollo_11', startUtc: '2027-01-01T00:00:00Z', durationH: 48, slipDays: 3 },
  { id: 'sc2', siteId: 'southpole_landed', startUtc: '2027-02-01T00:00:00Z', durationH: 24, slipDays: 0 },
]

beforeEach(() => {
  useAppStore.setState({
    scenarios: original.map((s) => ({ ...s })),
    activeScenarioId: 'sc2',
    mode: 'advanced',
    cursorH: 12,
    playing: false,
  })
  useDemoStore.setState({ isActive: false, stepIndex: 0, variant: 'normal', snapshot: null })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useDemoStore snapshot and restore', () => {
  it('startDemo snapshots scenarios, mode, cursor and active scenario', () => {
    useDemoStore.getState().startDemo('video30s')
    const d = useDemoStore.getState()
    expect(d.isActive).toBe(true)
    expect(d.variant).toBe('video30s')
    expect(d.stepIndex).toBe(0)
    expect(d.snapshot).toMatchObject({ mode: 'advanced', cursorH: 12, activeScenarioId: 'sc2', activeTabId: null })
    expect(d.snapshot?.scenarios).toEqual(original)
  })

  it('the snapshot is a copy, later edits of the live scenarios do not leak into it', () => {
    useDemoStore.getState().startDemo()
    useAppStore.getState().updateScenario('sc1', { slipDays: 9 })
    expect(useDemoStore.getState().snapshot?.scenarios[0].slipDays).toBe(3)
  })

  it('stopDemo restores the state, stops playback and clears the demo', () => {
    useDemoStore.getState().startDemo()
    useAppStore.setState({
      scenarios: [{ id: 'sc1', siteId: 'x', startUtc: '2027-05-01T00:00:00Z', durationH: 1, slipDays: 0 }],
      activeScenarioId: 'sc1',
      mode: 'simple',
      cursorH: 99,
      playing: true,
    })
    useDemoStore.getState().stopDemo()
    const app = useAppStore.getState()
    expect(app.scenarios).toEqual(original)
    expect(app.activeScenarioId).toBe('sc2')
    expect(app.mode).toBe('advanced')
    expect(app.cursorH).toBe(12)
    expect(app.playing).toBe(false)
    expect(useDemoStore.getState()).toMatchObject({ isActive: false, stepIndex: 0, snapshot: null })
  })

  it('stopDemo without a snapshot only stops playback', () => {
    useAppStore.setState({ playing: true, cursorH: 5 })
    useDemoStore.getState().stopDemo()
    expect(useAppStore.getState().playing).toBe(false)
    expect(useAppStore.getState().cursorH).toBe(5)
  })

  it('re-selects the tab that was selected before the demo', () => {
    document.body.innerHTML =
      '<button role="tab" id="tab-a" aria-selected="true"></button><button role="tab" id="tab-b" aria-selected="false"></button>'
    const a = document.getElementById('tab-a') as HTMLButtonElement
    const b = document.getElementById('tab-b') as HTMLButtonElement
    const clickA = vi.fn()
    a.addEventListener('click', clickA)
    useDemoStore.getState().startDemo()
    expect(useDemoStore.getState().snapshot?.activeTabId).toBe('tab-a')
    a.setAttribute('aria-selected', 'false')
    b.setAttribute('aria-selected', 'true')
    useDemoStore.getState().stopDemo()
    expect(clickA).toHaveBeenCalledTimes(1)
  })

  it('does not click the tab when it is still selected', () => {
    document.body.innerHTML = '<button role="tab" id="tab-a" aria-selected="true"></button>'
    const clickA = vi.fn()
    document.getElementById('tab-a')!.addEventListener('click', clickA)
    useDemoStore.getState().startDemo()
    useDemoStore.getState().stopDemo()
    expect(clickA).not.toHaveBeenCalled()
  })
})

describe('useDemoStore steps', () => {
  it('nextStep wraps around at totalSteps', () => {
    useDemoStore.setState({ stepIndex: 1 })
    useDemoStore.getState().nextStep(3)
    expect(useDemoStore.getState().stepIndex).toBe(2)
    useDemoStore.getState().nextStep(3)
    expect(useDemoStore.getState().stepIndex).toBe(0)
  })

  it('nextStep with zero steps stays at 0', () => {
    useDemoStore.setState({ stepIndex: 2 })
    useDemoStore.getState().nextStep(0)
    expect(useDemoStore.getState().stepIndex).toBe(0)
  })

  it('setVariant resets the step', () => {
    useDemoStore.setState({ stepIndex: 4 })
    useDemoStore.getState().setVariant('video30s')
    expect(useDemoStore.getState()).toMatchObject({ variant: 'video30s', stepIndex: 0 })
  })
})
