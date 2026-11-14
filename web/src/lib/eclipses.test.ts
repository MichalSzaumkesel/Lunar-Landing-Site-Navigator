import { describe, expect, it } from 'vitest'
import type { EphemFile } from './types'
import { listEclipses } from './eclipses'

const H_MS = 3_600_000
const T0_UTC = '2027-01-01T00:00:00Z'
const T0_MS = Date.parse(T0_UTC)

function buildTestEphem(
  sunAz: number[],
  sunEl: number[],
  earthAz: number[],
  earthEl: number[],
  sunRadius = 0.25,
  earthRadius = 1.0,
): EphemFile {
  return {
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
    earth: { az: earthAz, el: earthEl },
    sun_ang_radius_deg: sunRadius,
    earth_ang_radius_deg: earthRadius,
  }
}

describe('listEclipses', () => {
  it('returns empty array when there is no overlap', () => {
    // Separation is 10 deg, radii sum is 1.25 deg
    const count = 10
    const sunAz = new Array(count).fill(0)
    const sunEl = new Array(count).fill(0)
    const earthAz = new Array(count).fill(10)
    const earthEl = new Array(count).fill(0)

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl)
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + count * H_MS)
    expect(eclipses).toEqual([])
  })

  it('detects one eclipse spanning 5 samples', () => {
    // 10 samples: indices 0..1 separated by 10 deg, indices 2..6 separated by 0.5 deg (< 1.25), indices 7..9 separated by 10 deg
    const count = 10
    const sunAz = new Array(count).fill(0)
    const sunEl = new Array(count).fill(0)
    const earthAz = [10, 10, 0.5, 0.5, 0.5, 0.5, 0.5, 10, 10, 10]
    const earthEl = new Array(count).fill(0)

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl, 0.25, 1.0)
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + count * H_MS)

    expect(eclipses).toHaveLength(1)
    const [e] = eclipses
    expect(e.startMs).toBe(T0_MS + 2 * H_MS)
    expect(e.endMs).toBe(T0_MS + 7 * H_MS) // sample after the last (index 6 + 1 = 7)
    // sep = 0.5, (0.25 + 1.0 - 0.5) / (2 * 0.25) = 0.75 / 0.5 = 1.5 -> clamp to 1
    expect(e.maxOverlapFraction).toBe(1)
    expect(e.minSeparationDeg).toBeCloseTo(0.5, 4)
  })

  it('detects two separate eclipses', () => {
    // Samples 1..2 overlap, sample 3 no overlap, samples 4..5 overlap
    const sunAz = [0, 0, 0, 0, 0, 0, 0]
    const sunEl = [0, 0, 0, 0, 0, 0, 0]
    const earthAz = [10, 1.1, 1.1, 10, 1.0, 1.0, 10] // rSum = 1.25
    const earthEl = [0, 0, 0, 0, 0, 0, 0]

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl, 0.25, 1.0)
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + 7 * H_MS)

    expect(eclipses).toHaveLength(2)
    expect(eclipses[0].startMs).toBe(T0_MS + 1 * H_MS)
    expect(eclipses[0].endMs).toBe(T0_MS + 3 * H_MS)
    expect(eclipses[1].startMs).toBe(T0_MS + 4 * H_MS)
    expect(eclipses[1].endMs).toBe(T0_MS + 6 * H_MS)
  })

  it('cuts an eclipse when the window starts or ends inside it', () => {
    // 6 samples, all overlapping (indices 0..5)
    const count = 6
    const sunAz = new Array(count).fill(0)
    const sunEl = new Array(count).fill(0)
    const earthAz = new Array(count).fill(0.5)
    const earthEl = new Array(count).fill(0)

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl, 0.25, 1.0)

    // Window cuts to indices [2, 5) -> samples 2, 3, 4
    const eclipses = listEclipses(ephem, T0_MS + 2 * H_MS, T0_MS + 5 * H_MS)
    expect(eclipses).toHaveLength(1)
    expect(eclipses[0].startMs).toBe(T0_MS + 2 * H_MS)
    expect(eclipses[0].endMs).toBe(T0_MS + 5 * H_MS) // sample after the last (index 4 + 1 = 5)
  })

  it('calculates total overlap fraction 1 when the Sun is fully inside the Earth disc', () => {
    // Sun at az 0 el 0, Earth at az 0 el 0 (center aligned)
    const ephem = buildTestEphem([0], [0], [0], [0], 0.25, 1.0)
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + 1 * H_MS)

    expect(eclipses).toHaveLength(1)
    expect(eclipses[0].maxOverlapFraction).toBe(1)
    expect(eclipses[0].minSeparationDeg).toBe(0)
  })

  it('calculates partial overlap fraction correctly', () => {
    // rSun = 0.5, rEarth = 1.0, sep = 1.2 -> rSum = 1.5
    // frac = (0.5 + 1.0 - 1.2) / (2 * 0.5) = 0.3 / 1.0 = 0.3
    const ephem = buildTestEphem([0], [0], [1.2], [0], 0.5, 1.0)
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + 1 * H_MS)

    expect(eclipses).toHaveLength(1)
    expect(eclipses[0].maxOverlapFraction).toBeCloseTo(0.3, 4)
  })

  it('clamps endMs to the query endMs when an eclipse continues past the query range', () => {
    // 10 continuous overlapping samples
    const count = 10
    const sunAz = new Array(count).fill(0)
    const sunEl = new Array(count).fill(0)
    const earthAz = new Array(count).fill(0.5)
    const earthEl = new Array(count).fill(0)

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl, 0.25, 1.0)

    // Query range cut at 3.5 hours: last included sample is index 3 (at T0 + 3h)
    // Normally curLastSampleMs + stepMs would be T0 + 4h, which exceeds query range
    const queryEndMs = T0_MS + Math.floor(3.5 * H_MS)
    const eclipses = listEclipses(ephem, T0_MS, queryEndMs)

    expect(eclipses).toHaveLength(1)
    expect(eclipses[0].startMs).toBe(T0_MS)
    expect(eclipses[0].endMs).toBe(queryEndMs)
  })
})
