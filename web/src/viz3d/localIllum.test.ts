/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { EphemFile, TerrainFile } from '../lib/types'
import { localSunlitGrid } from './localIllum'
import { decodeHeights } from './terrain'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const mockDataDir = resolve(__dirname, '../../public/data/mock')

function makeDummyEphem(
  count: number,
  sunAz: number[],
  sunEl: number[],
  startUtc = '2026-01-01T00:00:00Z',
  stepMinutes = 60,
): EphemFile {
  return {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-01-01T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test_site',
    start_utc: startUtc,
    step_minutes: stepMinutes,
    count,
    sun: { az: sunAz, el: sunEl },
    earth: { az: new Array(count).fill(0), el: new Array(count).fill(0) },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
  }
}

describe('localSunlitGrid', () => {
  it('gives 25 at every point on flat terrain with 25% of 24 ephemeris samples above horizon', () => {
    const sizePx = 32
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)

    const sunAz = new Array(24).fill(0)
    const sunEl = new Array(24).fill(-5)
    // 6 out of 24 samples (25%) above flat horizon (~ -0.086°)
    for (let i = 0; i < 6; i++) {
      sunEl[i] = 5
    }

    const startUtc = '2026-01-01T00:00:00Z'
    const ephem = makeDummyEphem(24, sunAz, sunEl, startUtc, 60)
    const startMs = Date.parse(startUtc)
    const endMs = startMs + 24 * 60 * 60_000

    const grid = localSunlitGrid({
      heights,
      sizePx,
      spacingM,
      ephem,
      observerHeightM: 2,
      startMs,
      endMs,
      gridN: 5,
      extentM: 500,
      rays: 360,
    })

    expect(grid.length).toBe(25)
    for (let i = 0; i < grid.length; i++) {
      expect(grid[i]).toBeCloseTo(25, 4)
    }
  })

  it('gives lower values on points just west of an east wall than on points east of it', () => {
    const sizePx = 64
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)

    // Place a 100 m wall at col = 40 (x = (40 - 32) * 50 = 400 m East)
    const wallCol = 40
    for (let r = 0; r < sizePx; r++) {
      heights[r * sizePx + wallCol] = 100
    }

    // Sun always East (90°), low elevation (2°)
    const count = 24
    const sunAz = new Array(count).fill(90)
    const sunEl = new Array(count).fill(2.0)

    const startUtc = '2026-01-01T00:00:00Z'
    const ephem = makeDummyEphem(count, sunAz, sunEl, startUtc, 60)
    const startMs = Date.parse(startUtc)
    const endMs = startMs + count * 60 * 60_000

    // Grid centered at origin, extent 1000m: x from -500 to +500
    // West of wall (e.g. col 0..2) vs East of wall (col 4)
    const gridN = 5
    const grid = localSunlitGrid({
      heights,
      sizePx,
      spacingM,
      ephem,
      observerHeightM: 2,
      startMs,
      endMs,
      gridN,
      extentM: 1000,
      rays: 360,
    })

    // Compare points along central row (r = 2)
    // Cell centres: x = -500 + (c + 0.5) * 200 -> c=0: -400, c=1: -200, c=2: 0, c=3: +200, c=4: +400
    // All points with x < 400 look East and hit the wall (h=100m), blocking Sun at 2°
    const westOfWall = grid[2 * gridN + 1] // x = -200
    const eastOfWall = grid[2 * gridN + 4] // x = +400 (at the wall or beyond it looking east)

    expect(westOfWall).toBe(0)
    expect(eastOfWall).toBe(100)
    expect(westOfWall).toBeLessThan(eastOfWall)
  })

  it('produces NaN for points outside the terrain grid', () => {
    const sizePx = 32
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)

    const ephem = makeDummyEphem(12, new Array(12).fill(0), new Array(12).fill(10))
    const startMs = Date.parse('2026-01-01T00:00:00Z')
    const endMs = startMs + 12 * 60 * 60_000

    // Terrain grid width is 32 * 50 = 1600 m (-800 to +750 m)
    // Extent of 4000 m extends far beyond the terrain grid
    const gridN = 5
    const grid = localSunlitGrid({
      heights,
      sizePx,
      spacingM,
      ephem,
      observerHeightM: 2,
      startMs,
      endMs,
      gridN,
      extentM: 4000,
    })

    // Corner points must be NaN
    expect(Number.isNaN(grid[0])).toBe(true) // top-left (NW)
    expect(Number.isNaN(grid[gridN - 1])).toBe(true) // top-right (NE)
    expect(Number.isNaN(grid[gridN * (gridN - 1)])).toBe(true) // bottom-left (SW)
    expect(Number.isNaN(grid[gridN * gridN - 1])).toBe(true) // bottom-right (SE)
    // Center point (0, 0) is inside terrain grid
    expect(Number.isNaN(grid[2 * gridN + 2])).toBe(false)
  })

  it('outputs length equal to gridN * gridN', () => {
    const sizePx = 32
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)

    const ephem = makeDummyEphem(10, new Array(10).fill(0), new Array(10).fill(10))
    const startMs = Date.parse('2026-01-01T00:00:00Z')
    const endMs = startMs + 10 * 60 * 60_000

    expect(
      localSunlitGrid({
        heights,
        sizePx,
        spacingM,
        ephem,
        observerHeightM: 2,
        startMs,
        endMs,
        gridN: 3,
        extentM: 300,
      }).length,
    ).toBe(9)

    expect(
      localSunlitGrid({
        heights,
        sizePx,
        spacingM,
        ephem,
        observerHeightM: 2,
        startMs,
        endMs,
        gridN: 7,
        extentM: 500,
      }).length,
    ).toBe(49)
  })

  it('returns NaN for every point when no ephemeris sample falls inside the window', () => {
    const sizePx = 32
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)

    const ephem = makeDummyEphem(10, new Array(10).fill(0), new Array(10).fill(10), '2027-01-01T00:00:00Z', 60)
    // Request window strictly before the ephemeris coverage
    const startMs = Date.parse('2026-01-01T00:00:00Z')
    const endMs = Date.parse('2026-01-02T00:00:00Z')

    const gridN = 5
    const grid = localSunlitGrid({
      heights,
      sizePx,
      spacingM,
      ephem,
      observerHeightM: 2,
      startMs,
      endMs,
      gridN,
      extentM: 500,
    })

    expect(grid.length).toBe(25)
    for (let i = 0; i < grid.length; i++) {
      expect(Number.isNaN(grid[i])).toBe(true)
    }
  })

  it('orders row-major with north row first', () => {
    const sizePx = 64
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)

    // Place a 100 m wall across row 24 (y = (32 - 24) * 50 = +400 m North)
    const wallRow = 24
    for (let c = 0; c < sizePx; c++) {
      heights[wallRow * sizePx + c] = 100
    }

    // Sun always North (0°), low elevation (2°)
    const count = 12
    const sunAz = new Array(count).fill(0)
    const sunEl = new Array(count).fill(2.0)

    const startUtc = '2026-01-01T00:00:00Z'
    const ephem = makeDummyEphem(count, sunAz, sunEl, startUtc, 60)
    const startMs = Date.parse(startUtc)
    const endMs = startMs + count * 60 * 60_000

    const gridN = 5
    const grid = localSunlitGrid({
      heights,
      sizePx,
      spacingM,
      ephem,
      observerHeightM: 2,
      startMs,
      endMs,
      gridN,
      extentM: 1000,
      rays: 360,
    })

    // North row (r = 0, y = +400 looking north sees clear flat terrain)
    const northRowVal = grid[2]
    // South row (r = 4, y = -400 looking north hits the wall at y = +400)
    const southRowVal = grid[4 * gridN + 2]

    expect(northRowVal).toBe(100)
    expect(southRowVal).toBe(0)
    expect(northRowVal).toBeGreaterThan(southRowVal)
  })

  it('evaluates a 41 by 41 grid with 360 rays and 30 days of samples without hanging (generous limit, the machine may be loaded)', () => {
    const jsonRaw = readFileSync(resolve(mockDataDir, 'terrain/apollo_11.json'), 'utf-8')
    const terrain = JSON.parse(jsonRaw) as TerrainFile
    const binBuf = readFileSync(resolve(mockDataDir, 'terrain/apollo_11.bin'))
    const arrayBuffer = binBuf.buffer.slice(
      binBuf.byteOffset,
      binBuf.byteOffset + binBuf.byteLength,
    )
    const heights = decodeHeights(arrayBuffer, terrain)

    // Ephem with 30 days of hourly samples = 720 samples
    const count = 720
    const sunAz: number[] = new Array(count)
    const sunEl: number[] = new Array(count)
    for (let k = 0; k < count; k++) {
      sunAz[k] = (k * 15) % 360
      sunEl[k] = 2.0 * Math.sin((k * Math.PI) / 12)
    }

    const startUtc = '2026-01-01T00:00:00Z'
    const ephem = makeDummyEphem(count, sunAz, sunEl, startUtc, 60)
    const startMs = Date.parse(startUtc)
    const endMs = startMs + count * 60 * 60_000

    const t0 = performance.now()
    const grid = localSunlitGrid({
      heights,
      sizePx: terrain.size_px,
      spacingM: terrain.spacing_m,
      ephem,
      observerHeightM: 2,
      startMs,
      endMs,
      gridN: 41,
      extentM: 4000,
      rays: 360,
    })
    const elapsedMs = performance.now() - t0

    expect(grid.length).toBe(41 * 41)
    expect(elapsedMs).toBeLessThan(30_000)
    console.log(`Measured 41x41 grid computation time (360 rays, 30 days): ${elapsedMs.toFixed(2)} ms`)
  })
})
