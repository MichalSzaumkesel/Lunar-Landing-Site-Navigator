import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile, SiteBundle } from './types'
import { listSkyEvents } from './events'

const T0 = Date.parse('2027-01-01T00:00:00Z')
const HOUR_MS = 3_600_000

/** Three hourly samples against a flat 0 deg horizon; the sun elevation is the only input. */
function bundleWithSunEl(sunEl: number[]): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const count = sunEl.length
  const meta = {
    contract_version: '1.1.1',
    generated_utc: '2026-11-14T00:00:00Z',
    generator: 'test',
    synthetic: true,
    approximate: false,
    inputs: [],
  }
  const flat = new Array<number>(360).fill(0)
  const horizon: HorizonFile = {
    meta,
    site_id: 'boundary',
    az_step_deg: 1,
    n: 360,
    observer_heights_m: [2, 10],
    masks: { '2': flat, '10': flat },
  }
  const ephem: EphemFile = {
    meta,
    site_id: 'boundary',
    start_utc: '2027-01-01T00:00:00Z',
    step_minutes: 60,
    count,
    sun: { az: new Array<number>(count).fill(0), el: sunEl },
    earth: { az: new Array<number>(count).fill(90), el: new Array<number>(count).fill(20) },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
  }
  return { horizon, ephem }
}

describe('listSkyEvents at exact sample boundaries', () => {
  it('reports one sunset when the sun touches the horizon from above at a sample', () => {
    // Sun above, exactly on the horizon at k=1, then below.
    const events = listSkyEvents(bundleWithSunEl([1, 0, -1]), 2, T0, T0 + 2 * HOUR_MS)
    const sun = events.filter((e) => e.kind === 'sunset' || e.kind === 'sunrise')

    expect(sun).toHaveLength(1)
    expect(sun[0].kind).toBe('sunset')
    expect(sun[0].ms).toBe(T0 + HOUR_MS)
  })

  it('reports no sun event when the sun only touches the horizon from above and rises again', () => {
    const events = listSkyEvents(bundleWithSunEl([1, 0, 1]), 2, T0, T0 + 2 * HOUR_MS)

    expect(events.filter((e) => e.kind === 'sunset' || e.kind === 'sunrise')).toHaveLength(0)
  })

  it('does not emit a sunrise and a sunset at the same millisecond for a grazing contact from below', () => {
    const events = listSkyEvents(bundleWithSunEl([-1, 0, -1]), 2, T0, T0 + 2 * HOUR_MS)

    expect(events.filter((e) => e.kind === 'sunset' || e.kind === 'sunrise')).toHaveLength(0)
  })

  it('reports a sunset that reaches the horizon exactly at the final sample', () => {
    const events = listSkyEvents(bundleWithSunEl([2, 1, 0]), 2, T0, T0 + 3 * HOUR_MS)
    const sun = events.filter((e) => e.kind === 'sunset' || e.kind === 'sunrise')

    expect(sun.map((e) => e.kind)).toEqual(['sunset'])
    expect(sun[0].ms).toBe(T0 + 2 * HOUR_MS)
  })
})
