import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile } from '../../lib/types'
import {
  LOUPE_SIZE,
  PANO_H,
  PANO_W,
  azToX,
  buildPanoramaModel,
  elToY,
  inLoupeWindow,
  isBelowStrip,
  loupeTerrainPath,
  loupeX,
  loupeY,
  stripSegments,
} from './panoramaGeometry'

const META = {
  contract_version: '1.1.1',
  generated_utc: '2026-11-14T00:00:00Z',
  generator: 'test',
  synthetic: true,
  approximate: false,
  inputs: [],
}

const horizon: HorizonFile = {
  meta: META,
  site_id: 't',
  az_step_deg: 0.5,
  n: 720,
  observer_heights_m: [2],
  masks: { '2': Array.from({ length: 720 }, () => 2) },
}

const ephem: EphemFile = {
  meta: META,
  site_id: 't',
  start_utc: '2027-01-01T00:00:00Z',
  step_minutes: 60,
  count: 3,
  sun: { az: [10, 20, 30], el: [1, 2, 3] },
  earth: { az: [100, 100, 100], el: [1, 1, 1] },
  sun_ang_radius_deg: 0.2666,
  earth_ang_radius_deg: 0.95,
}

describe('strip mapping', () => {
  it('maps azimuth to x and elevation to y', () => {
    expect(azToX(180)).toBe(PANO_W / 2)
    expect(azToX(360)).toBe(PANO_W)
    expect(elToY(0, 5)).toBe(PANO_H)
    expect(elToY(5, 5)).toBe(0)
    expect(elToY(2.5, 5)).toBe(PANO_H / 2)
  })

  it('marks bodies more than 1 deg below the horizon', () => {
    expect(isBelowStrip(-1.5)).toBe(true)
    expect(isBelowStrip(-0.5)).toBe(false)
  })
})

describe('stripSegments', () => {
  it('breaks the line at the 360 to 0 wrap', () => {
    const d = stripSegments([350, 355, 359, 1, 5], [1, 1, 1, 1, 1], 0, 5, 5)
    expect(d.startsWith('M700.0,144.0')).toBe(true)
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d.match(/L/g)).toHaveLength(3)
  })

  it('breaks the line below the horizon', () => {
    const d = stripSegments([10, 11, 12], [1, -5, 1], 0, 3, 5)
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d).not.toContain('L')
  })
})

describe('buildPanoramaModel', () => {
  const t0 = Date.parse('2027-01-01T00:00:00Z')
  const model = buildPanoramaModel({ horizon, ephem }, 2, t0, t0 + 3 * 3_600_000)

  it('shares the polar zoom and scales the axes', () => {
    expect(model.zoomEl).toBe(5)
    expect(model.xPerDeg).toBe(2)
    expect(model.yPerDeg).toBe(36)
    expect(model.ticks.map((t) => t.el)).toEqual([1, 2, 3, 4])
  })

  it('draws the terrain closed to the bottom edge', () => {
    expect(model.terrainPath.startsWith('M0.0,108.0')).toBe(true)
    expect(model.terrainPath.endsWith(`L${PANO_W},${PANO_H}L0,${PANO_H}Z`)).toBe(true)
  })

  it('builds a track per body', () => {
    expect(model.sunTrackPath.startsWith('M')).toBe(true)
    expect(model.earthTrackPath.startsWith('M')).toBe(true)
  })
})

describe('loupe', () => {
  it('maps the 6 degree window to the square', () => {
    expect(loupeX(-3)).toBe(0)
    expect(loupeX(3)).toBe(LOUPE_SIZE)
    expect(loupeY(5)).toBe(0)
    expect(loupeY(-1)).toBe(LOUPE_SIZE)
  })

  it('tests whether a body centre is in the window', () => {
    expect(inLoupeWindow(0, 0)).toBe(true)
    expect(inLoupeWindow(3.1, 0)).toBe(false)
    expect(inLoupeWindow(0, 5.5)).toBe(false)
    expect(inLoupeWindow(0, -1.5)).toBe(false)
  })

  it('draws a flat horizon as a straight line', () => {
    const mask = Array.from({ length: 720 }, () => 1)
    const { edge, fill } = loupeTerrainPath(mask, 0.5, 100)
    // 1 deg elevation is 4 deg below the top of the window: y = 4 * 40
    expect(edge.startsWith('M0.0,160.0')).toBe(true)
    expect(edge.endsWith(`L${LOUPE_SIZE}.0,160.0`)).toBe(true)
    expect(fill.endsWith(`L${LOUPE_SIZE},${LOUPE_SIZE}L0,${LOUPE_SIZE}Z`)).toBe(true)
  })

  it('returns nothing without a mask', () => {
    expect(loupeTerrainPath([], 0.5, 0)).toEqual({ fill: '', edge: '' })
  })
})
