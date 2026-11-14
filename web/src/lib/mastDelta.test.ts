import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile, SiteBundle } from './types'
import { mastDelta } from './mastDelta'

const H_MS = 3_600_000
const T0_UTC = '2027-01-01T00:00:00Z'
const T0_MS = Date.parse(T0_UTC)

function buildTestBundle(
  mask2Elevation: number[],
  mask10Elevation: number[] | null,
  sunAz: number[],
  sunEl: number[],
): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const masks: Record<string, number[]> = {
    '2': mask2Elevation,
  }
  if (mask10Elevation) {
    masks['10'] = mask10Elevation
  }

  const horizon: HorizonFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test_site',
    az_step_deg: 1,
    n: mask2Elevation.length,
    observer_heights_m: mask10Elevation ? [2, 10] : [2],
    masks,
  }

  const ephem: EphemFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test_site',
    start_utc: T0_UTC,
    step_minutes: 60,
    count: sunAz.length,
    sun: { az: sunAz, el: sunEl },
    earth: { az: new Array(sunAz.length).fill(0), el: new Array(sunAz.length).fill(10) },
    sun_ang_radius_deg: 0.25,
    earth_ang_radius_deg: 1.0,
  }

  return { horizon, ephem }
}

describe('mastDelta', () => {
  it('computes gain when 10 m mask is 0.1 degrees lower', () => {
    // 360 points in azimuth, mask2 = 1.0 deg, mask10 = 0.9 deg
    const mask2 = new Array(360).fill(1.0)
    const mask10 = new Array(360).fill(0.9)

    // 10 samples:
    // First 4 samples: sun el = 0.95 deg (above 0.9, below 1.0) -> dark for 2m, sunlit for 10m
    // Next 6 samples: sun el = 2.0 deg -> sunlit for both
    const count = 10
    const sunAz = new Array(count).fill(0)
    const sunEl = [0.95, 0.95, 0.95, 0.95, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0]

    const bundle = buildTestBundle(mask2, mask10, sunAz, sunEl)
    const delta = mastDelta(bundle, T0_MS, T0_MS + count * H_MS)

    expect(delta).not.toBeNull()
    expect(delta!.sunHours2).toBe(6)
    expect(delta!.sunHours10).toBe(10)
    expect(delta!.gainH).toBe(4)
    expect(delta!.longestDark2H).toBe(4)
    expect(delta!.longestDark10H).toBe(0)
  })

  it('reports zero gain when 2 m and 10 m masks yield identical visibility', () => {
    const mask2 = new Array(360).fill(1.0)
    const mask10 = new Array(360).fill(0.9)

    // Sun is always high above both (5.0 deg)
    const count = 8
    const sunAz = new Array(count).fill(0)
    const sunEl = new Array(count).fill(5.0)

    const bundle = buildTestBundle(mask2, mask10, sunAz, sunEl)
    const delta = mastDelta(bundle, T0_MS, T0_MS + count * H_MS)

    expect(delta).not.toBeNull()
    expect(delta!.sunHours2).toBe(8)
    expect(delta!.sunHours10).toBe(8)
    expect(delta!.gainH).toBe(0)
    expect(delta!.longestDark2H).toBe(0)
    expect(delta!.longestDark10H).toBe(0)
  })

  it('returns null when mask 10 is missing', () => {
    const mask2 = new Array(360).fill(1.0)
    const bundle = buildTestBundle(mask2, null, [0, 0], [2, 2])
    const delta = mastDelta(bundle, T0_MS, T0_MS + 2 * H_MS)
    expect(delta).toBeNull()
  })

  it('returns null when mask 2 is missing', () => {
    const bundle = buildTestBundle([1], [0.9], [0], [2])
    delete bundle.horizon.masks['2']
    const delta = mastDelta(bundle, T0_MS, T0_MS + 1 * H_MS)
    expect(delta).toBeNull()
  })

  it('returns null when startMs >= endMs or outside coverage', () => {
    const mask2 = new Array(360).fill(1.0)
    const mask10 = new Array(360).fill(0.9)
    const bundle = buildTestBundle(mask2, mask10, [0], [2])

    expect(mastDelta(bundle, T0_MS + 10 * H_MS, T0_MS)).toBeNull()
    expect(mastDelta(bundle, T0_MS + 100 * H_MS, T0_MS + 101 * H_MS)).toBeNull()
  })
})
