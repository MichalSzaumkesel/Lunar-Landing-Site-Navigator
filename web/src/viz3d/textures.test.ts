import { describe, expect, it } from 'vitest'
import { hash2, tileFbm, tileNoise } from './noise'
import { CASCADE_PATCH_OK, cascadedLightsChunk } from './shaderPatches'
import { buildStarData, GRADIENT_RANGE, makeRegolithTexture } from './textures'

describe('noise', () => {
  it('tiles with the unit square', () => {
    for (const [u, v] of [
      [0, 0.3],
      [0.7, 0],
      [0.123, 0.456],
    ]) {
      expect(tileNoise(u, v, 8, 3)).toBeCloseTo(tileNoise(u + 1, v, 8, 3), 9)
      expect(tileNoise(u, v, 8, 3)).toBeCloseTo(tileNoise(u, v + 1, 8, 3), 9)
      expect(tileFbm(u, v, 4, 4, 9)).toBeCloseTo(tileFbm(u + 1, v + 1, 4, 4, 9), 9)
    }
  })

  it('stays in 0..1 and is deterministic', () => {
    for (let i = 0; i < 200; i++) {
      const v = tileFbm(i * 0.0137, i * 0.0291, 5, 4, 2)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5))
  })
})

describe('buildStarData', () => {
  it('is deterministic and has the requested count', () => {
    const a = buildStarData(500)
    const b = buildStarData(500)
    expect(a.positions.length).toBe(1500)
    expect(Array.from(a.positions.slice(0, 30))).toEqual(Array.from(b.positions.slice(0, 30)))
    expect(Array.from(a.sizes)).toEqual(Array.from(b.sizes))
  })

  it('keeps stars on the unit sphere above the horizon band', () => {
    const d = buildStarData(300)
    for (let i = 0; i < 300; i++) {
      const x = d.positions[i * 3]
      const y = d.positions[i * 3 + 1]
      const z = d.positions[i * 3 + 2]
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
      expect(y).toBeGreaterThanOrEqual(-0.1 - 1e-6)
    }
  })

  it('makes bright stars bigger and rarer', () => {
    const d = buildStarData(4000)
    let bright = 0
    let faint = 0
    let brightSize = 0
    let faintSize = 0
    for (let i = 0; i < 4000; i++) {
      if (d.magnitudes[i] < 2) {
        bright++
        brightSize += d.sizes[i]
      } else if (d.magnitudes[i] > 5) {
        faint++
        faintSize += d.sizes[i]
      }
    }
    expect(faint).toBeGreaterThan(bright * 5)
    expect(brightSize / bright).toBeGreaterThan(faintSize / faint)
  })
})

describe('makeRegolithTexture', () => {
  it('is deterministic, full size and has unit-rms slopes inside the encoding range', () => {
    const a = makeRegolithTexture(64, 1)
    const b = makeRegolithTexture(64, 1)
    const da = a.image.data as Uint8Array
    expect(da.length).toBe(64 * 64 * 4)
    expect(Array.from(da.slice(0, 64))).toEqual(Array.from((b.image.data as Uint8Array).slice(0, 64)))
    let sum2 = 0
    let clipped = 0
    for (let i = 0; i < 64 * 64; i++) {
      for (const c of [0, 1]) {
        const g = (da[i * 4 + c] / 255 - 0.5) * 2 * GRADIENT_RANGE
        sum2 += g * g
        if (da[i * 4 + c] === 0 || da[i * 4 + c] === 255) clipped++
      }
    }
    const rms = Math.sqrt(sum2 / (2 * 64 * 64))
    expect(rms).toBeGreaterThan(0.85)
    expect(rms).toBeLessThan(1.15)
    expect(clipped).toBeLessThan(64 * 64 * 0.02)
    a.dispose()
    b.dispose()
  })
})

describe('shader patches', () => {
  it('still match the installed three.js shader chunks', () => {
    expect(CASCADE_PATCH_OK).toBe(true)
    expect(cascadedLightsChunk()).toContain('cascNear')
  })
})
