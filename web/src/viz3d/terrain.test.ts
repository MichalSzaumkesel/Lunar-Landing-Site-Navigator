/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TerrainFile } from '../lib/types'
import {
  buildTerrainMesh,
  decodeHeights,
  directionEnu,
  heightAt,
  terrainBinUrl,
} from './terrain'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const mockTerrainDir = resolve(__dirname, '../../public/data/mock/terrain')

describe('decodeHeights', () => {
  it('decodes a 2x2 hand-made .bin with known min, max, and site height', () => {
    // 2x2 grid, 4 uint16 values: 0, 65535, 32768, 0
    const buffer = new ArrayBuffer(2 * 2 * 2)
    const view = new DataView(buffer)
    view.setUint16(0, 0, true)
    view.setUint16(2, 65535, true)
    view.setUint16(4, 32768, true)
    view.setUint16(6, 0, true)

    const meta = {
      size_px: 2,
      height_min_m: -100,
      height_max_m: 100,
      site_height_m: 10,
    }

    const heights = decodeHeights(buffer, meta)
    expect(heights).toBeInstanceOf(Float32Array)
    expect(heights.length).toBe(4)

    // v = 0 -> -100 + 0 - 10 = -110
    expect(heights[0]).toBeCloseTo(-110, 4)
    // v = 65535 -> -100 + 200 - 10 = 90
    expect(heights[1]).toBeCloseTo(90, 4)
    // v = 32768 -> -100 + (32768 / 65535) * 200 - 10 = -9.9969...
    const expectedMid = -100 + (32768 / 65535) * 200 - 10
    expect(heights[2]).toBeCloseTo(expectedMid, 4)
    // v = 0 -> -110
    expect(heights[3]).toBeCloseTo(-110, 4)
  })

  it('throws an Error when bin byte length does not match size_px * size_px * 2', () => {
    const wrongBuffer = new ArrayBuffer(7)
    expect(() =>
      decodeHeights(wrongBuffer, {
        size_px: 2,
        height_min_m: 0,
        height_max_m: 10,
        site_height_m: 0,
      }),
    ).toThrow(/Invalid terrain bin size/)
  })

  it('decodes real mock .bin files and centre pixel is ~0 within one quantisation step', () => {
    const siteIds = ['apollo_11', 'artemis_region_1', 'southpole_landed']
    for (const siteId of siteIds) {
      const jsonRaw = readFileSync(resolve(mockTerrainDir, `${siteId}.json`), 'utf-8')
      const terrain = JSON.parse(jsonRaw) as TerrainFile
      const binBuf = readFileSync(resolve(mockTerrainDir, `${siteId}.bin`))
      const arrayBuffer = binBuf.buffer.slice(
        binBuf.byteOffset,
        binBuf.byteOffset + binBuf.byteLength,
      )

      const heights = decodeHeights(arrayBuffer, terrain)
      expect(heights.length).toBe(terrain.size_px * terrain.size_px)

      const centreCol = Math.floor(terrain.size_px / 2)
      const centreRow = Math.floor(terrain.size_px / 2)
      const centreIdx = centreRow * terrain.size_px + centreCol
      const centreHeight = heights[centreIdx]

      const quantStep = (terrain.height_max_m - terrain.height_min_m) / 65535
      expect(Math.abs(centreHeight)).toBeLessThanOrEqual(quantStep + 1e-4)
    }
  })
})

describe('terrainBinUrl', () => {
  const dummyMeta = {
    contract_version: '1.1.1',
    generated_utc: '',
    generator: '',
    inputs: [],
    approximate: false,
  }

  it('handles real terrain with trailing slash', () => {
    const url = terrainBinUrl('https://example.com/moon/', {
      bin: 'terrain/site.bin',
      meta: { ...dummyMeta, synthetic: false },
    })
    expect(url).toBe('https://example.com/moon/data/terrain/site.bin')
  })

  it('handles real terrain without trailing slash', () => {
    const url = terrainBinUrl('https://example.com/moon', {
      bin: 'terrain/site.bin',
      meta: { ...dummyMeta, synthetic: false },
    })
    expect(url).toBe('https://example.com/moon/data/terrain/site.bin')
  })

  it('handles synthetic terrain with trailing slash', () => {
    const url = terrainBinUrl('https://example.com/moon/', {
      bin: 'terrain/apollo_11.bin',
      meta: { ...dummyMeta, synthetic: true },
    })
    expect(url).toBe('https://example.com/moon/data/mock/terrain/apollo_11.bin')
  })

  it('handles synthetic terrain without trailing slash', () => {
    const url = terrainBinUrl('https://example.com/moon', {
      bin: 'terrain/apollo_11.bin',
      meta: { ...dummyMeta, synthetic: true },
    })
    expect(url).toBe('https://example.com/moon/data/mock/terrain/apollo_11.bin')
  })

  it('handles bin path with leading slash properly', () => {
    const url = terrainBinUrl('/', {
      bin: '/terrain/site.bin',
      meta: { ...dummyMeta, synthetic: false },
    })
    expect(url).toBe('/data/terrain/site.bin')
  })
})

describe('buildTerrainMesh', () => {
  it('computes (0, 0, 1) normals on a flat 3x3 grid', () => {
    const sizePx = 3
    const spacingM = 10
    const heights = new Float32Array(sizePx * sizePx) // all zero
    const mesh = buildTerrainMesh(heights, sizePx, spacingM)

    expect(mesh.vertexCount).toBe(9)
    expect(mesh.triangleCount).toBe(8)
    expect(mesh.zMin).toBe(0)
    expect(mesh.zMax).toBe(0)

    for (let i = 0; i < mesh.vertexCount; i++) {
      const nx = mesh.normals[i * 3]
      const ny = mesh.normals[i * 3 + 1]
      const nz = mesh.normals[i * 3 + 2]
      expect(nx).toBeCloseTo(0, 5)
      expect(ny).toBeCloseTo(0, 5)
      expect(nz).toBeCloseTo(1, 5)
    }
  })

  it('tilts normals with negative x and positive z on a plane tilted 45 deg east', () => {
    const sizePx = 3
    const spacingM = 10
    // Height increases eastwards with slope 1 (45 degrees): z(c) = c * spacingM
    const heights = new Float32Array(sizePx * sizePx)
    for (let r = 0; r < sizePx; r++) {
      for (let c = 0; c < sizePx; c++) {
        heights[r * sizePx + c] = c * spacingM
      }
    }

    const mesh = buildTerrainMesh(heights, sizePx, spacingM)
    for (let i = 0; i < mesh.vertexCount; i++) {
      const nx = mesh.normals[i * 3]
      const ny = mesh.normals[i * 3 + 1]
      const nz = mesh.normals[i * 3 + 2]
      expect(nx).toBeLessThan(0)
      expect(nz).toBeGreaterThan(0)
      expect(nx).toBeCloseTo(-Math.SQRT1_2, 4)
      expect(ny).toBeCloseTo(0, 4)
      expect(nz).toBeCloseTo(Math.SQRT1_2, 4)
    }
  })

  it('produces expected vertex count, triangle count, and corner positions', () => {
    const sizePx = 3
    const spacingM = 10
    const heights = new Float32Array(sizePx * sizePx)
    const mesh = buildTerrainMesh(heights, sizePx, spacingM)

    expect(mesh.vertexCount).toBe(9)
    expect(mesh.triangleCount).toBe((3 - 1) * (3 - 1) * 2)

    // NW corner is row 0, col 0
    const nwX = mesh.positions[0]
    const nwY = mesh.positions[1]
    expect(nwX).toBeLessThan(0)
    expect(nwY).toBeGreaterThan(0)
    expect(nwX).toBeCloseTo(-1.5 * spacingM, 5)
    expect(nwY).toBeCloseTo(1.5 * spacingM, 5)

    // UVs at NW corner (u=0, v=1)
    expect(mesh.uvs[0]).toBeCloseTo(0, 5)
    expect(mesh.uvs[1]).toBeCloseTo(1, 5)
    // UVs at SE corner (row 2, col 2 -> u=1, v=0)
    const seIdx = (2 * 3 + 2) * 2
    expect(mesh.uvs[seIdx]).toBeCloseTo(1, 5)
    expect(mesh.uvs[seIdx + 1]).toBeCloseTo(0, 5)
  })

  it('gives an upward geometric normal for every triangle on a flat grid', () => {
    const sizePx = 4
    const spacingM = 10
    const heights = new Float32Array(sizePx * sizePx)
    const mesh = buildTerrainMesh(heights, sizePx, spacingM)

    for (let t = 0; t < mesh.triangleCount; t++) {
      const i0 = mesh.indices[t * 3]
      const i1 = mesh.indices[t * 3 + 1]
      const i2 = mesh.indices[t * 3 + 2]

      const p0x = mesh.positions[i0 * 3]
      const p0y = mesh.positions[i0 * 3 + 1]
      const p1x = mesh.positions[i1 * 3]
      const p1y = mesh.positions[i1 * 3 + 1]
      const p2x = mesh.positions[i2 * 3]
      const p2y = mesh.positions[i2 * 3 + 1]

      const v1x = p1x - p0x
      const v1y = p1y - p0y
      const v2x = p2x - p0x
      const v2y = p2y - p0y

      // z-component of (p1 - p0) x (p2 - p0)
      const crossZ = v1x * v2y - v1y * v2x
      expect(crossZ).toBeGreaterThan(0)
    }
  })

  it('doubles zMax when verticalExaggeration = 2', () => {
    const sizePx = 3
    const heights = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const mesh1 = buildTerrainMesh(heights, sizePx, 10, 1)
    const mesh2 = buildTerrainMesh(heights, sizePx, 10, 2)

    expect(mesh1.zMax).toBe(9)
    expect(mesh2.zMax).toBe(18)
    expect(mesh2.zMax).toBe(mesh1.zMax * 2)
  })

  it('ensures all indices stay strictly below vertexCount', () => {
    const sizePx = 5
    const heights = new Float32Array(sizePx * sizePx)
    const mesh = buildTerrainMesh(heights, sizePx, 10)

    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeLessThan(mesh.vertexCount)
    }
  })
})

describe('directionEnu', () => {
  it('gives north horizon (0, 1, 0)', () => {
    const [x, y, z] = directionEnu(0, 0)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(1, 6)
    expect(z).toBeCloseTo(0, 6)
  })

  it('gives east horizon (1, 0, 0)', () => {
    const [x, y, z] = directionEnu(90, 0)
    expect(x).toBeCloseTo(1, 6)
    expect(y).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(0, 6)
  })

  it('gives zenith (0, 0, 1)', () => {
    const [x, y, z] = directionEnu(0, 90)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(1, 6)
  })

  it('has unit length for arbitrary angles', () => {
    const testAngles = [
      [37.2, 18.5],
      [123.4, -45.6],
      [280.1, 72.3],
      [180, 0],
      [270, -30],
      [45, 45],
    ]
    for (const [az, el] of testAngles) {
      const [x, y, z] = directionEnu(az, el)
      const len = Math.hypot(x, y, z)
      expect(len).toBeCloseTo(1, 6)
    }
  })
})

describe('heightAt', () => {
  const sizePx = 3
  const spacingM = 10
  // 3x3 grid with distinct heights
  // row 0: 10, 20, 30
  // row 1: 40, 50, 60
  // row 2: 70, 80, 90
  const heights = new Float32Array([10, 20, 30, 40, 50, 60, 70, 80, 90])

  it('returns exact height at integer pixel positions', () => {
    // Center pixel: r=1, c=1 -> ENU x = (1 - 1.5) * 10 = -5, y = (1.5 - 1) * 10 = 5
    const hCenter = heightAt(heights, sizePx, spacingM, -5, 5)
    expect(hCenter).toBeCloseTo(50, 5)

    // NW pixel: r=0, c=0 -> x = -15, y = 15
    const hNw = heightAt(heights, sizePx, spacingM, -15, 15)
    expect(hNw).toBeCloseTo(10, 5)

    // SE pixel: r=2, c=2 -> x = 5, y = -5
    const hSe = heightAt(heights, sizePx, spacingM, 5, -5)
    expect(hSe).toBeCloseTo(90, 5)
  })

  it('interpolates bilinear midpoint', () => {
    // Midpoint between (0, 0) and (0, 1): r=0, c=0.5 -> heights 10 and 20 -> expected 15
    // col = 0.5 -> x = (0.5 - 1.5) * 10 = -10, row = 0 -> y = 15
    const hMidX = heightAt(heights, sizePx, spacingM, -10, 15)
    expect(hMidX).toBeCloseTo(15, 5)

    // Midpoint between 4 pixels (0,0), (0,1), (1,0), (1,1):
    // r=0.5, c=0.5 -> avg(10, 20, 40, 50) = 30
    // col = 0.5 -> x = -10, row = 0.5 -> y = (1.5 - 0.5) * 10 = 10
    const hMid4 = heightAt(heights, sizePx, spacingM, -10, 10)
    expect(hMid4).toBeCloseTo(30, 5)
  })

  it('returns null outside the grid', () => {
    // West of grid: col < 0 -> x < -15
    expect(heightAt(heights, sizePx, spacingM, -15.1, 0)).toBeNull()
    // East of grid: col > 2 -> x > 5
    expect(heightAt(heights, sizePx, spacingM, 5.1, 0)).toBeNull()
    // North of grid: row < 0 -> y > 15
    expect(heightAt(heights, sizePx, spacingM, 0, 15.1)).toBeNull()
    // South of grid: row > 2 -> y < -5
    expect(heightAt(heights, sizePx, spacingM, 0, -5.1)).toBeNull()
  })
})

describe('performance and real mock mesh building', () => {
  it('builds a 256x256 mesh from a real mock bin in under 500 ms', () => {
    const jsonRaw = readFileSync(
      resolve(mockTerrainDir, 'apollo_11.json'),
      'utf-8',
    )
    const terrain = JSON.parse(jsonRaw) as TerrainFile
    const binBuf = readFileSync(resolve(mockTerrainDir, 'apollo_11.bin'))
    const arrayBuffer = binBuf.buffer.slice(
      binBuf.byteOffset,
      binBuf.byteOffset + binBuf.byteLength,
    )

    const heights = decodeHeights(arrayBuffer, terrain)

    const t0 = performance.now()
    const mesh = buildTerrainMesh(heights, terrain.size_px, terrain.spacing_m)
    const dtMs = performance.now() - t0

    expect(dtMs).toBeLessThan(500)
    expect(mesh.vertexCount).toBe(256 * 256)
    expect(mesh.triangleCount).toBe(255 * 255 * 2)
    expect(mesh.positions.length).toBe(256 * 256 * 3)
    expect(mesh.normals.length).toBe(256 * 256 * 3)
    expect(mesh.uvs.length).toBe(256 * 256 * 2)
    expect(mesh.indices.length).toBe(255 * 255 * 2 * 3)

    // Log the time for visibility
    console.log(`Measured mesh build time (256x256): ${dtMs.toFixed(2)} ms`)
  })
})
