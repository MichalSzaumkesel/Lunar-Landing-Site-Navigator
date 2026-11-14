/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TerrainFile } from '../lib/types'
import { decodeHeights } from './terrain'
import { horizonFromTerrain, R_MOON_M } from './terrainHorizon'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const mockTerrainDir = resolve(__dirname, '../../public/data/mock/terrain')

describe('horizonFromTerrain', () => {
  it('gives about -0.0864 degrees (tolerance 0.01) for every ray from the centre of a flat grid with observerHeightM = 2', () => {
    const sizePx = 256
    const spacingM = 80
    const heights = new Float32Array(sizePx * sizePx)
    const rays = 720

    const mask = horizonFromTerrain(heights, sizePx, spacingM, 0, 0, 2, { rays })
    expect(mask.length).toBe(rays)

    const expectedFlat = -0.0864
    for (let i = 0; i < rays; i++) {
      expect(Math.abs(mask[i] - expectedFlat)).toBeLessThan(0.01)
    }
  })

  it('computes elevation of a 100 m high wall 1000 m east within tolerance 0.05 and flat value on west ray', () => {
    const sizePx = 256
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)
    const wallCol = 1000 / spacingM + sizePx / 2

    for (let r = 0; r < sizePx; r++) {
      heights[r * sizePx + wallCol] = 100
    }

    const rays = 720
    const eastRayIdx = rays / 4 // 180
    const westRayIdx = (3 * rays) / 4 // 540

    const mask = horizonFromTerrain(heights, sizePx, spacingM, 0, 0, 2, { rays })

    const expectedEast =
      Math.atan((100 - 2 - (1000 * 1000) / (2 * R_MOON_M)) / 1000) * (180 / Math.PI)

    expect(Math.abs(mask[eastRayIdx] - expectedEast)).toBeLessThan(0.05)
    expect(Math.abs(mask[westRayIdx] - -0.0864)).toBeLessThan(0.01)
  })

  it('matches output length to requested rays option', () => {
    const sizePx = 64
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)

    expect(horizonFromTerrain(heights, sizePx, spacingM, 0, 0, 2).length).toBe(720)
    expect(horizonFromTerrain(heights, sizePx, spacingM, 0, 0, 2, { rays: 360 }).length).toBe(360)
    expect(horizonFromTerrain(heights, sizePx, spacingM, 0, 0, 2, { rays: 180 }).length).toBe(180)
  })

  it('throws an Error when observer position is outside the grid', () => {
    const sizePx = 64
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)

    expect(() => horizonFromTerrain(heights, sizePx, spacingM, 5000, 0, 2)).toThrow(
      /outside the terrain grid/,
    )
    expect(() => horizonFromTerrain(heights, sizePx, spacingM, 0, -5000, 2)).toThrow(
      /outside the terrain grid/,
    )
  })

  it('ray i points to azimuth i * 360 / rays (cardinal directions)', () => {
    const sizePx = 128
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)

    // Put single peaks 500m in each cardinal direction
    const half = sizePx / 2
    // North: x = 0, y = 500 -> row = half - 10, col = half
    heights[(half - 10) * sizePx + half] = 50
    // East: x = 500, y = 0 -> row = half, col = half + 10
    heights[half * sizePx + (half + 10)] = 60
    // South: x = 0, y = -500 -> row = half + 10, col = half
    heights[(half + 10) * sizePx + half] = 70
    // West: x = -500, y = 0 -> row = half, col = half - 10
    heights[half * sizePx + (half - 10)] = 80

    const rays = 360
    const mask = horizonFromTerrain(heights, sizePx, spacingM, 0, 0, 2, { rays })

    // Ray indices: 0 = North (0°), 90 = East (90°), 180 = South (180°), 270 = West (270°)
    expect(mask[0]).toBeGreaterThan(2)
    expect(mask[90]).toBeGreaterThan(3)
    expect(mask[180]).toBeGreaterThan(4)
    expect(mask[270]).toBeGreaterThan(5)
  })

  it('assigns smooth-sphere dip when ray has no samples inside grid', () => {
    const sizePx = 64
    const spacingM = 50
    const heights = new Float32Array(sizePx * sizePx)
    // Observer at easternmost valid column (col = 63, x = (63 - 32) * 50 = 1550)
    const xEdge = (sizePx - 1 - sizePx / 2) * spacingM
    const mask = horizonFromTerrain(heights, sizePx, spacingM, xEdge, 0, 2, { rays: 4 })

    const expectedDip = -Math.acos(R_MOON_M / (R_MOON_M + 2)) * (180 / Math.PI)
    // Ray 1 is East (90°): immediately steps outside grid
    expect(mask[1]).toBeCloseTo(expectedDip, 4)
  })

  it('times horizon computation for 720 rays on real mock terrain well under 200 ms', () => {
    const jsonRaw = readFileSync(resolve(mockTerrainDir, 'apollo_11.json'), 'utf-8')
    const terrain = JSON.parse(jsonRaw) as TerrainFile
    const binBuf = readFileSync(resolve(mockTerrainDir, 'apollo_11.bin'))
    const arrayBuffer = binBuf.buffer.slice(
      binBuf.byteOffset,
      binBuf.byteOffset + binBuf.byteLength,
    )
    const heights = decodeHeights(arrayBuffer, terrain)

    const t0 = performance.now()
    const mask = horizonFromTerrain(heights, terrain.size_px, terrain.spacing_m, 0, 0, 2, {
      rays: 720,
    })
    const elapsedMs = performance.now() - t0

    expect(mask.length).toBe(720)
    expect(elapsedMs).toBeLessThan(200)
    // Log measured time for Acceptance reporting
    console.log(`Measured 720 rays time on real mock terrain: ${elapsedMs.toFixed(2)} ms`)
  })
})
