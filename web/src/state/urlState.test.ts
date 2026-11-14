import { describe, expect, it } from 'vitest'
import { MAX_SCENARIOS, MAX_SLIP_DAYS } from '../config/dataRange'
import { decodeState, encodeState, type UrlState } from './urlState'

describe('urlState encode / decode', () => {
  it('round trip for a two-scenario state', () => {
    const original: UrlState = {
      mode: 'advanced',
      observerHeightM: 10,
      cursorH: 24.5,
      speedHPerSec: 2,
      scenarios: [
        {
          siteId: 'southpole_landed',
          startUtc: '2027-03-01T00:00:00Z',
          durationH: 168,
          slipDays: 14,
        },
        {
          siteId: 'shackleton',
          startUtc: '2027-06-15T00:00:00Z',
          durationH: 336,
          slipDays: -10,
        },
      ],
    }

    const hash = encodeState(original)
    expect(hash).not.toContain('#')

    const decoded = decodeState(hash)
    expect(decoded).toEqual(original)
  })

  it('round trip for simple mode and 2m height', () => {
    const original: UrlState = {
      mode: 'simple',
      observerHeightM: 2,
      cursorH: 0,
      speedHPerSec: 1,
      scenarios: [
        {
          siteId: 'apollo11',
          startUtc: '2027-01-01T00:00:00Z',
          durationH: 72,
          slipDays: 0,
        },
      ],
    }

    const hash = encodeState(original)
    const decoded = decodeState(hash)
    expect(decoded).toEqual(original)
  })

  it('garbage input gives an empty object without throwing', () => {
    const garbage = 'm=x&h=5&s=Bad Id~2027-13-40~0~999'
    expect(() => decodeState(garbage)).not.toThrow()
    const decoded = decodeState(garbage)
    expect(decoded).toEqual({})
  })

  it('partially valid input retains only the valid parts', () => {
    const partial = 'm=s&h=5&c=12.3&v=-2&s=invalid'
    const decoded = decodeState(partial)
    expect(decoded).toEqual({
      mode: 'simple',
      cursorH: 12.3,
    })
  })

  it('clamping of slipDays to +-MAX_SLIP_DAYS', () => {
    const hash = `m=a&h=10&c=0&v=1&s=site_a~2027-05-10~24~${MAX_SLIP_DAYS + 50};site_b~2027-05-10~24~${-MAX_SLIP_DAYS - 50}`
    const decoded = decodeState(hash)
    expect(decoded.scenarios).toBeDefined()
    expect(decoded.scenarios![0].slipDays).toBe(MAX_SLIP_DAYS)
    expect(decoded.scenarios![1].slipDays).toBe(-MAX_SLIP_DAYS)
  })

  it('the 4-scenario cap', () => {
    const scenariosTokens = [
      'site_1~2027-01-01~24~0',
      'site_2~2027-01-02~24~0',
      'site_3~2027-01-03~24~0',
      'site_4~2027-01-04~24~0',
      'site_5~2027-01-05~24~0',
      'site_6~2027-01-06~24~0',
    ]
    const hash = `m=a&h=2&c=0&v=1&s=${scenariosTokens.join(';')}`
    const decoded = decodeState(hash)
    expect(decoded.scenarios).toBeDefined()
    expect(decoded.scenarios!.length).toBe(MAX_SCENARIOS)
    expect(decoded.scenarios![0].siteId).toBe('site_1')
    expect(decoded.scenarios![3].siteId).toBe('site_4')
  })

  it('leading # is accepted and ignored', () => {
    const hashWithout = 'm=s&h=2&c=5&v=1&s=site_a~2027-01-01~24~0'
    const decodedWithout = decodeState(hashWithout)
    const decodedWith = decodeState('#' + hashWithout)
    expect(decodedWith).toEqual(decodedWithout)
  })

  it('cursorH rounding in encode and parsing', () => {
    const state: UrlState = {
      mode: 'advanced',
      observerHeightM: 2,
      cursorH: 12.3456,
      speedHPerSec: 1,
      scenarios: [],
    }
    const hash = encodeState(state)
    expect(hash).toContain('c=12.3')
    const decoded = decodeState(hash)
    expect(decoded.cursorH).toBe(12.3)
  })

  it('southern-latitude custom site id round-trips through encode and decode', () => {
    const original: UrlState = {
      mode: 'advanced',
      observerHeightM: 2,
      cursorH: 0,
      speedHPerSec: 1,
      scenarios: [
        {
          siteId: 'custom_-89p500_45p000',
          startUtc: '2027-06-01T00:00:00Z',
          durationH: 168,
          slipDays: 0,
        },
      ],
    }
    const hash = encodeState(original)
    const decoded = decodeState(hash)
    expect(decoded.scenarios).toBeDefined()
    expect(decoded.scenarios![0].siteId).toBe('custom_-89p500_45p000')
    expect(decoded).toEqual(original)
  })
})

describe('store tick and scenario duration clamping (Item 1 & 2)', async () => {
  const { useAppStore } = await import('./store')
  const { scenarioCursorUtc } = await import('./selectors')

  it('clamps durationH to >= 1 in addScenario and updateScenario', () => {
    const sId = useAppStore.getState().addScenario({
      siteId: 'test_clamp',
      durationH: -5,
    })
    expect(sId).toBeTruthy()
    const scenario = useAppStore.getState().scenarios.find((x) => x.id === sId)
    expect(scenario?.durationH).toBeGreaterThanOrEqual(1)

    useAppStore.getState().updateScenario(sId!, { durationH: 0 })
    const updated = useAppStore.getState().scenarios.find((x) => x.id === sId)
    expect(updated?.durationH).toBe(1)
  })

  it('tick guards against zero or non-finite loop length and never yields NaN cursor', () => {
    useAppStore.setState({
      scenarios: [
        {
          id: 'sc_zero',
          siteId: 'test',
          startUtc: '2027-01-01T00:00:00Z',
          durationH: 0, // invalid 0 duration
          slipDays: 0,
        },
      ],
      cursorH: 0,
      playing: true,
      speedHPerSec: 1,
    })

    useAppStore.getState().tick(0.5)
    const cursor = useAppStore.getState().cursorH
    expect(Number.isFinite(cursor)).toBe(true)
    expect(Number.isNaN(cursor)).toBe(false)
    expect(cursor).toBe(0.5)
  })

  it('setActiveScenario ignores unknown id and retains valid activeScenarioId', () => {
    const initialId = useAppStore.getState().scenarios[0].id
    useAppStore.getState().setActiveScenario(initialId)
    expect(useAppStore.getState().activeScenarioId).toBe(initialId)

    useAppStore.getState().setActiveScenario('completely_invalid_id')
    expect(useAppStore.getState().activeScenarioId).toBe(initialId)
  })

  it('scenarioCursorUtc formats with fractional millisecond value by rounding to whole seconds', () => {
    const scenario = {
      id: 'sc1',
      siteId: 'test',
      startUtc: '2027-01-01T00:00:00.000Z',
      durationH: 72,
      slipDays: 0,
    }
    // cursorH = 0.0001 h -> 0.36 seconds = 360 ms -> rounds to 00:00:00Z
    const utc1 = scenarioCursorUtc(scenario, 0.0001)
    expect(utc1).toBe('2027-01-01T00:00:00Z')
    expect(utc1).not.toContain('.')

    // cursorH = 0.0002 h -> 0.72 seconds = 720 ms -> rounds to 00:00:01Z
    const utc2 = scenarioCursorUtc(scenario, 0.0002)
    expect(utc2).toBe('2027-01-01T00:00:01Z')
    expect(utc2).not.toContain('.')
  })
})
