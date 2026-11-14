import { describe, expect, it } from 'vitest'
import { BOULDERS, CRATER_RIMS, scatterItems, SMALL_ROCKS } from './scatter'

const small = (n: number) => ({ ...SMALL_ROCKS, maxCount: n })

describe('scatterItems', () => {
  it('is deterministic', () => {
    const a = scatterItems(100, -40, small(500))
    const b = scatterItems(100, -40, small(500))
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(100)
  })

  it('respects the count cap and keeps the nearest items', () => {
    const all = scatterItems(0, 0, small(100000))
    const capped = scatterItems(0, 0, small(50))
    expect(capped.length).toBe(50)
    expect(capped).toEqual(all.slice(0, 50))
    for (let i = 1; i < capped.length; i++) {
      expect(capped[i].distM).toBeGreaterThanOrEqual(capped[i - 1].distM)
    }
  })

  it('stays inside the radius and the size range', () => {
    for (const spec of [SMALL_ROCKS, BOULDERS, CRATER_RIMS]) {
      const items = scatterItems(0, 0, { ...spec, maxCount: 100000 })
      expect(items.length).toBeGreaterThan(0)
      for (const it of items) {
        expect(it.distM).toBeLessThanOrEqual(spec.radiusM)
        expect(it.size).toBeGreaterThanOrEqual(spec.minSize - 1e-9)
        expect(it.size).toBeLessThanOrEqual(spec.maxSize + 1e-9)
      }
    }
  })

  it('anchors items to the world: moving the centre keeps the shared items identical', () => {
    const a = scatterItems(0, 0, small(100000))
    const b = scatterItems(30, 10, small(100000))
    const key = (i: { eastM: number; northM: number }) => `${i.eastM.toFixed(6)},${i.northM.toFixed(6)}`
    const inB = new Map(b.map((i) => [key(i), i]))
    let shared = 0
    for (const item of a) {
      const other = inB.get(key(item))
      if (!other) continue
      shared++
      expect(other.size).toBe(item.size)
      expect(other.yawRad).toBe(item.yawRad)
    }
    expect(shared).toBeGreaterThan(a.length * 0.5)
  })

  it('has more small items near the centre than far from it', () => {
    const items = scatterItems(0, 0, small(100000))
    const near = items.filter((i) => i.distM < 60).length / (Math.PI * 60 * 60)
    const far = items.filter((i) => i.distM > 180).length / (Math.PI * (260 * 260 - 180 * 180))
    expect(near).toBeGreaterThan(far * 2)
  })

  it('keeps the total decoration within a few thousand', () => {
    const total =
      scatterItems(0, 0, { ...SMALL_ROCKS, maxCount: 2200 }).length +
      scatterItems(0, 0, { ...BOULDERS, maxCount: 400 }).length +
      scatterItems(0, 0, { ...CRATER_RIMS, maxCount: 250 }).length
    expect(total).toBeLessThanOrEqual(2850)
  })
})
