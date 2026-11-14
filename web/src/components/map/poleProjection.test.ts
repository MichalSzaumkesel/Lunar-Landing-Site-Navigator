import { describe, expect, it } from 'vitest'
import {
  gridImageMatrix,
  MOON_R_M,
  niceLength,
  poleForward,
  poleInverse,
  poleLocalFrame,
  poleScale,
  poleToPixel,
} from './poleProjection'

describe('polar stereographic (Moon sphere)', () => {
  it('puts the pole at the origin and lon 0 on +y, lon 90E on +x', () => {
    const p = poleForward(-90, 0)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(0, 3)
    const a = poleForward(-85, 0)
    expect(a.x).toBeCloseTo(0, 3)
    expect(a.y).toBeGreaterThan(0)
    const b = poleForward(-85, 90)
    expect(b.x).toBeGreaterThan(0)
    expect(b.y).toBeCloseTo(0, 3)
  })

  it('matches rho = 2R tan(45deg + lat/2) at 85S (about 151.8 km)', () => {
    const rho = 2 * MOON_R_M * Math.tan(Math.PI / 4 + (-85 * Math.PI) / 360)
    expect(Math.hypot(poleForward(-85, 40).x, poleForward(-85, 40).y)).toBeCloseTo(rho, 3)
    expect(rho / 1000).toBeGreaterThan(151)
    expect(rho / 1000).toBeLessThan(153)
  })

  it('round-trips lat/lon', () => {
    for (const [lat, lon] of [[-84.791, 29.196], [-80.13, 1.44], [-86.7, -23.7], [-89.5, 179]]) {
      const { x, y } = poleForward(lat, lon)
      const r = poleInverse(x, y)
      expect(r.lat).toBeCloseTo(lat, 6)
      expect(r.lon).toBeCloseTo(lon, 6)
    }
  })

  it('local scale is about 1.002 at 85S', () => {
    expect(poleScale(-85)).toBeCloseTo(1.0019, 3)
  })

  it('north points radially away from the pole, east is perpendicular (counter-clockwise from north)', () => {
    const lat = -84.791
    const lon = 29.196
    const { east, north } = poleLocalFrame(lat, lon)
    const p = poleForward(lat, lon)
    const l = Math.hypot(p.x, p.y)
    expect(north.x).toBeCloseTo(p.x / l, 4)
    expect(north.y).toBeCloseTo(p.y / l, 4)
    expect(east.x * north.x + east.y * north.y).toBeCloseTo(0, 5)
    // looking down on the south pole east is clockwise seen from above the pole: lon 0 -> +y, lon 90 -> +x
    expect(east.x).toBeCloseTo(Math.cos((lon * Math.PI) / 180), 3)
  })

  it('maps projected metres to image pixels with row 0 = top', () => {
    const ext: [number, number, number, number] = [-300000, 300000, -300000, 300000]
    expect(poleToPixel(0, 0, ext, 1000, 1000)).toEqual({ col: 500, row: 500 })
    expect(poleToPixel(-300000, 300000, ext, 1000, 1000)).toEqual({ col: 0, row: 0 })
  })

  it('grid image matrix puts the image centre on the site and its up axis along north', () => {
    const lat = -84.791
    const lon = 29.196
    const [a, b, c, d, e, f] = gridImageMatrix(lat, lon, 200, 21, 21)
    const cx = a * 10.5 + c * 10.5 + e
    const cy = b * 10.5 + d * 10.5 + f
    const p = poleForward(lat, lon)
    expect(cx).toBeCloseTo(p.x, 3)
    expect(cy).toBeCloseTo(-p.y, 3)
    // moving up one row (north) moves away from the pole in projected coords
    const upx = c * -1
    const upy = d * -1
    const l = Math.hypot(p.x, p.y)
    expect(upx / Math.hypot(upx, upy)).toBeCloseTo(p.x / l, 4)
    expect(upy / Math.hypot(upx, upy)).toBeCloseTo(-p.y / l, 4)
  })

  it('niceLength rounds to 1/2/5', () => {
    expect(niceLength(7300)).toBe(5000)
    expect(niceLength(2400)).toBe(2000)
    expect(niceLength(130)).toBe(100)
  })
})

describe('pixel positions verified by the basemap author (2048 px, +-304 km)', () => {
  const ext: [number, number, number, number] = [-304000, 304000, -304000, 304000]
  const cases: Array<[string, number, number, number, number]> = [
    ['southpole_landed', -84.791, 29.196, 1284, 559],
    ['artemis_region_1', -84.3, 30.6, 1321, 522],
    ['im1_odysseus', -80.13, 1.44, 1049, 14],
    ['artemis_region_3', -86.7, -23.7, 888, 715],
  ]
  for (const [id, lat, lon, col, row] of cases) {
    it(id, () => {
      const p = poleForward(lat, lon)
      const px = poleToPixel(p.x, p.y, ext, 2048, 2048)
      expect(Math.abs(px.col - col)).toBeLessThan(3)
      expect(Math.abs(px.row - row)).toBeLessThan(3)
    })
  }
})
