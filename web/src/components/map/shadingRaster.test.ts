import { describe, expect, it } from 'vitest'
import { NIGHT_MAX_ALPHA, NO_EARTH_MAX_ALPHA, nightAlpha, noEarthAlpha, renderShading, sampleGrid } from './shadingRaster'

describe('shadingRaster', () => {
  it('night alpha is monotone, half-strength at the terminator', () => {
    expect(nightAlpha(10)).toBe(0)
    expect(nightAlpha(-10)).toBeCloseTo(NIGHT_MAX_ALPHA)
    expect(nightAlpha(0)).toBeCloseTo(NIGHT_MAX_ALPHA / 2)
    expect(nightAlpha(1)).toBeLessThan(nightAlpha(-1))
  })
  it('no-Earth tint only when Earth is below the horizon', () => {
    expect(noEarthAlpha(20)).toBe(0)
    expect(noEarthAlpha(-20)).toBeCloseTo(NO_EARTH_MAX_ALPHA)
  })
  it('wraps longitude when sampling', () => {
    const g = new Float32Array([1, 2, 3, 4]) // 1 row x 4 cols
    const edge = sampleGrid(g, 1, 4, 0, 0, 8, 1)
    expect(edge).toBeGreaterThan(1)
    expect(edge).toBeLessThan(4)
  })
  it('renders transparent for a fully lit, Earth-visible grid', () => {
    const g = new Float32Array(4 * 4).fill(30)
    const out = new Uint8ClampedArray(8 * 4 * 4)
    renderShading(out, g, g, 4, 4, 8, 4)
    expect(Array.from(out).filter((_, i) => i % 4 === 3).every((a) => a === 0)).toBe(true)
  })
})
