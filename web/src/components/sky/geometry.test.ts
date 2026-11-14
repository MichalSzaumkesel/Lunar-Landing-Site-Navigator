import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile } from '../../lib/types'
import {
  CENTER,
  RIM_R,
  azDiff,
  buildSkyModel,
  chooseZoomEl,
  degToPx,
  describeBody,
  discSize,
  elevationToRadius,
  fmtNum,
  polarToXY,
  trackSegments,
  windowSampleRange,
} from './geometry'

const META = {
  contract_version: '1.1.1',
  generated_utc: '2026-11-14T00:00:00Z',
  generator: 'test',
  synthetic: true,
  approximate: false,
  inputs: [],
}

function makeEphem(count: number, sunEl: (k: number) => number, sunAz: (k: number) => number): EphemFile {
  const idx = Array.from({ length: count }, (_, k) => k)
  return {
    meta: META,
    site_id: 't',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count,
    sun: { az: idx.map(sunAz), el: idx.map(sunEl) },
    earth: { az: idx.map(() => 100), el: idx.map(() => 1) },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
  }
}

function makeHorizon(value: (i: number) => number): HorizonFile {
  const mask = Array.from({ length: 720 }, (_, i) => value(i))
  return { meta: META, site_id: 't', az_step_deg: 0.5, n: 720, observer_heights_m: [2], masks: { '2': mask } }
}

describe('chooseZoomEl', () => {
  it('picks the smallest level with a 15 % margin', () => {
    expect(chooseZoomEl(0)).toBe(5)
    expect(chooseZoomEl(4.3)).toBe(5)
    expect(chooseZoomEl(4.35)).toBe(10)
    expect(chooseZoomEl(7.04)).toBe(10)
    expect(chooseZoomEl(8.7)).toBe(20)
    expect(chooseZoomEl(17)).toBe(20)
    expect(chooseZoomEl(39)).toBe(45)
    expect(chooseZoomEl(40)).toBe(90)
  })

  it('never exceeds 90', () => {
    expect(chooseZoomEl(89.9)).toBe(90)
    expect(chooseZoomEl(500)).toBe(90)
  })
})

describe('polar mapping', () => {
  const at = (az: number, el: number, zoom = 10) => polarToXY(az, el, zoom)

  it('puts north up, east right, south down, west left on the rim', () => {
    const n = at(0, 0)
    expect(n.x).toBeCloseTo(CENTER)
    expect(n.y).toBeCloseTo(CENTER - RIM_R)
    const e = at(90, 0)
    expect(e.x).toBeCloseTo(CENTER + RIM_R)
    expect(e.y).toBeCloseTo(CENTER)
    expect(at(180, 0).y).toBeCloseTo(CENTER + RIM_R)
    expect(at(270, 0).x).toBeCloseTo(CENTER - RIM_R)
  })

  it('encodes elevation as radius: rim at 0, centre at the zoom level', () => {
    expect(elevationToRadius(0, 10)).toBe(RIM_R)
    expect(elevationToRadius(5, 10)).toBeCloseTo(RIM_R / 2)
    expect(elevationToRadius(10, 10)).toBe(0)
    const c = at(123, 10)
    expect(c.x).toBeCloseTo(CENTER)
    expect(c.y).toBeCloseTo(CENTER)
  })

  it('lies outside the rim below the horizon and never goes negative', () => {
    expect(elevationToRadius(-2, 10)).toBeCloseTo(RIM_R * 1.2)
    expect(elevationToRadius(15, 10)).toBe(0)
  })

  it('converts degrees to pixels with the current scale', () => {
    expect(degToPx(1, 10)).toBeCloseTo(RIM_R / 10)
    expect(degToPx(1, 5)).toBeCloseTo(RIM_R / 5)
  })
})

describe('discSize', () => {
  it('keeps the true size when it is large enough', () => {
    const d = discSize(0.95, 5)
    expect(d.trueR).toBeCloseTo(47.5)
    expect(d.drawR).toBeCloseTo(47.5)
    expect(d.needsRing).toBe(false)
  })

  it('applies the minimum radius and asks for a true-size ring', () => {
    const d = discSize(0.2666, 90)
    expect(d.trueR).toBeLessThan(1)
    expect(d.drawR).toBe(4)
    expect(d.needsRing).toBe(true)
  })
})

describe('azDiff', () => {
  it('is the shortest signed difference', () => {
    expect(azDiff(10, 30)).toBe(20)
    expect(azDiff(359, 1)).toBe(2)
    expect(azDiff(1, 359)).toBe(-2)
    expect(azDiff(0, 180)).toBe(180)
    expect(azDiff(0, 270)).toBe(-90)
  })
})

describe('windowSampleRange', () => {
  const e = { start_utc: '2026-12-01T00:00:00Z', step_minutes: 60, count: 100 }
  const t0 = Date.parse(e.start_utc)
  const H = 3_600_000

  it('includes both ends of the window', () => {
    expect(windowSampleRange(e, t0 + 2 * H, t0 + 5 * H)).toEqual({ k0: 2, k1: 6 })
  })

  it('clips to the coverage', () => {
    expect(windowSampleRange(e, t0 - 10 * H, t0 + 3 * H)).toEqual({ k0: 0, k1: 4 })
    expect(windowSampleRange(e, t0 + 98 * H, t0 + 500 * H)).toEqual({ k0: 98, k1: 100 })
  })

  it('is empty when the window misses the coverage', () => {
    expect(windowSampleRange(e, t0 + 200 * H, t0 + 300 * H)).toEqual({ k0: 0, k1: 0 })
    expect(windowSampleRange(e, t0 - 300 * H, t0 - 200 * H)).toEqual({ k0: 0, k1: 0 })
  })
})

describe('trackSegments', () => {
  it('breaks where the body is more than 2 deg below the horizon', () => {
    const el = [1, 0.5, -1, -3, -4, -1.5, 0.5, 2]
    const az = el.map((_, i) => 10 + i)
    const segs = trackSegments(az, el, 0, el.length)
    expect(segs.map((s) => s.length)).toEqual([3, 3])
    expect(segs[1][0].el).toBe(-1.5)
  })

  it('drops single-point runs', () => {
    const el = [1, -5, 1, -5, 1, 1]
    const segs = trackSegments(el.map(() => 0), el, 0, el.length)
    expect(segs.map((s) => s.length)).toEqual([2])
  })

  it('does not break on the 359 to 1 wrap', () => {
    const az = [358, 359, 0, 1, 2]
    const segs = trackSegments(az, az.map(() => 1), 0, az.length)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toHaveLength(5)
  })

  it('breaks on an azimuth jump above the threshold', () => {
    const az = [10, 20, 130, 140]
    const el = az.map(() => 1)
    expect(trackSegments(az, el, 0, 4, 2, 90).map((s) => s.length)).toEqual([2, 2])
    expect(trackSegments(az, el, 0, 4)).toHaveLength(1)
  })

  it('respects the sample range', () => {
    const el = [1, 1, 1, 1, 1, 1]
    const segs = trackSegments(el.map((_, i) => i), el, 2, 5)
    expect(segs[0].map((p) => p.az)).toEqual([2, 3, 4])
  })
})

describe('buildSkyModel', () => {
  const H = 3_600_000
  const t0 = Date.parse('2026-12-01T00:00:00Z')

  it('takes the zoom from the horizon and from the bodies inside the window', () => {
    const horizon = makeHorizon(() => 3)
    // Sun peaks at 8 deg, but only after the window ends.
    const ephem = makeEphem(100, (k) => (k < 50 ? 2 : 8), () => 90)
    const low = buildSkyModel({ horizon, ephem }, 2, t0, t0 + 40 * H)
    expect(low.zoomEl).toBe(5) // 3 * 1.15 = 3.45
    const high = buildSkyModel({ horizon, ephem }, 2, t0, t0 + 80 * H)
    expect(high.zoomEl).toBe(10) // 8 * 1.15 = 9.2
  })

  it('uses 90 for a body that reaches the zenith', () => {
    const horizon = makeHorizon(() => 0.2)
    const ephem = makeEphem(24, (k) => k * 3.9, () => 90)
    expect(buildSkyModel({ horizon, ephem }, 2, t0, t0 + 23 * H).zoomEl).toBe(90)
  })

  it('builds terrain as rim plus horizon polygon, and rings inside the scale', () => {
    const horizon = makeHorizon((i) => 1 + (i % 2))
    const ephem = makeEphem(48, () => 1, () => 45)
    const m = buildSkyModel({ horizon, ephem }, 2, t0, t0 + 47 * H)
    expect(m.zoomEl).toBe(5)
    expect(m.terrainPath.startsWith('M250,0A')).toBe(true)
    expect(m.terrainPath.endsWith('Z')).toBe(true)
    expect(m.terrainPath.length).toBeGreaterThan(m.horizonPath.length)
    expect(m.rings.map((r) => r.el)).toEqual([1, 2, 3, 4])
    expect(m.sunTrackPath.startsWith('M')).toBe(true)
  })

  it('falls back to the first mask when the height is missing', () => {
    const horizon = makeHorizon(() => 1)
    const ephem = makeEphem(4, () => 0, () => 0)
    expect(buildSkyModel({ horizon, ephem }, 10, t0, t0 + 3 * H).mask).toBe(horizon.masks['2'])
  })
})

describe('describeBody', () => {
  const mask = Array.from({ length: 720 }, () => 2)

  it('reports a half-cut disc at zero clearance', () => {
    const b = describeBody({ az: 40, el: 2 }, mask, 0.5, 0.2666)
    expect(b.clearance).toBeCloseTo(0)
    expect(b.fraction).toBeCloseTo(0.5)
    expect(b.visible).toBe(true)
  })

  it('is visible when the centre is above the terrain, not when below', () => {
    expect(describeBody({ az: 40, el: 2.1 }, mask, 0.5, 0.2666).visible).toBe(true)
    const below = describeBody({ az: 40, el: 1.9 }, mask, 0.5, 0.2666)
    expect(below.visible).toBe(false)
    expect(below.fraction).toBeGreaterThan(0)
    expect(below.fraction).toBeLessThan(0.5)
    expect(describeBody({ az: 40, el: 1.0 }, mask, 0.5, 0.2666).fraction).toBe(0)
  })
})

describe('fmtNum', () => {
  it('uses a typographic minus and optional plus', () => {
    expect(fmtNum(-1.234, 2)).toBe('−1.23')
    expect(fmtNum(1.234, 2, true)).toBe('+1.23')
    expect(fmtNum(1.234, 1)).toBe('1.2')
  })

  it('does not show a signed zero', () => {
    expect(fmtNum(-0.001, 2, true)).toBe('0.00')
    expect(fmtNum(0, 1, true)).toBe('0.0')
  })
})
