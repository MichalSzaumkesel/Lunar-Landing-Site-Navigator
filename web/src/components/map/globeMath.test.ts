import { SphereGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { subpoint } from '../../lib/moonFrame'
import { cameraPositionFor, globeToLatLon, latLonToGlobe, latLonToImageUV, moonFixedToGlobe, slerpDir } from './globeMath'

describe('globe frame', () => {
  it('puts lon 0 at +X, 90E at -Z, north at +Y', () => {
    const near = (v: number[], w: number[]) => v.forEach((x, i) => expect(x).toBeCloseTo(w[i], 9))
    near(latLonToGlobe(0, 0), [1, 0, 0])
    near(latLonToGlobe(0, 90), [0, 0, -1])
    near(latLonToGlobe(0, -90), [0, 0, 1])
    near(latLonToGlobe(90, 0), [0, 1, 0])
  })

  it('round-trips lat/lon', () => {
    for (const [lat, lon] of [[0.674, 23.473], [-84.791, 29.196], [26.132, 3.633], [-41.6, -153.98], [10, 179.5]]) {
      const r = globeToLatLon(latLonToGlobe(lat, lon))
      expect(r.lat).toBeCloseTo(lat, 9)
      expect(r.lon).toBeCloseTo(lon, 9)
    }
  })

  it('matches the texture coordinates three.js SphereGeometry assigns (image left = lon -180, top = north)', () => {
    const g = new SphereGeometry(1, 72, 36)
    const pos = g.getAttribute('position')
    const uv = g.getAttribute('uv')
    let worst = 0
    for (let i = 0; i < pos.count; i++) {
      const v: [number, number, number] = [pos.getX(i), pos.getY(i), pos.getZ(i)]
      const { lat, lon } = globeToLatLon(v)
      if (Math.abs(lat) > 89) continue // longitude undefined at the poles
      const want = latLonToImageUV(lat, lon)
      // three's uv.y is 1 at the top of the image (flipY texture), so image v = 1 - uv.y
      const du = Math.abs(((uv.getX(i) - want.u + 1.5) % 1) - 0.5)
      const dv = Math.abs(1 - uv.getY(i) - want.v)
      worst = Math.max(worst, du, dv)
    }
    expect(worst).toBeLessThan(1e-6)
    g.dispose()
  })

  it('maps Moon-fixed vectors to the same place as their subpoint lat/lon', () => {
    const km: [number, number, number] = [1000, -2000, 500]
    const sp = subpoint(km)
    const g = moonFixedToGlobe(km)
    const r = globeToLatLon(g)
    expect(r.lat).toBeCloseTo(sp.lat_deg, 9)
    expect(r.lon).toBeCloseTo(sp.lon_deg, 9)
  })

  it('keeps the camera off the pole axis and slerps through opposite directions', () => {
    const c = cameraPositionFor(-90, 0, 3)
    expect(Math.hypot(c[0], c[2])).toBeGreaterThan(0.05)
    const m = slerpDir([1, 0, 0], [-1, 0, 0], 0.5)
    expect(Math.hypot(...m)).toBeCloseTo(1, 6)
  })
})
