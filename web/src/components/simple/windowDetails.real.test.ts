/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { computeMetrics } from '../../lib/metrics'
import { mastDelta } from '../../lib/mastDelta'
import type { EphemFile, HorizonFile } from '../../lib/types'
import { computeWindowDetails } from './windowDetails'

// Independent recomputation of the Simple card extras from the real ephemeris and horizon files.

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/data')
const hasReal = existsSync(resolve(dataDir, 'sites.json'))
const read = <T>(rel: string): T => JSON.parse(readFileSync(resolve(dataDir, rel), 'utf-8')) as T

const RAD = Math.PI / 180
const WINDOWS = [
  { label: '10 d from 2027-01-26', start: '2027-01-26T00:00:00Z', hours: 240 },
  { label: '30 d from 2027-10-06', start: '2027-10-06T00:00:00Z', hours: 720 },
]

/** Straight linear interpolation of a circular mask. */
function maskAt(mask: number[], step: number, az: number): number {
  const x = (((az % 360) + 360) % 360) / step
  const i = Math.floor(x)
  const f = x - i
  return mask[i % mask.length] * (1 - f) + mask[(i + 1) % mask.length] * f
}

/** Visible fraction of a disc of radius r whose centre is `clear` above a straight edge. */
function visibleFraction(clear: number, r: number): number {
  const x = Math.max(-1, Math.min(1, clear / r))
  return 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / Math.PI
}

describe.skipIf(!hasReal)('windowDetails against real data', () => {
  for (const id of ['southpole_landed', 'apollo_11', 'artemis_region_1']) {
    for (const w of WINDOWS) {
      it(`${id}, ${w.label}`, () => {
        const e = read<EphemFile>(`ephem/${id}.json`)
        const h = read<HorizonFile>(`horizon/${id}.json`)
        const mask = h.masks['2']
        const t0 = Date.parse(e.start_utc)
        const step = e.step_minutes * 60_000
        const startMs = Date.parse(w.start)
        const endMs = startMs + w.hours * 3_600_000

        let maxSun = -Infinity
        let maxEarth = -Infinity
        let sunlit = 0
        let partial = 0
        let litSum = 0
        let n = 0
        for (let k = 0; k < e.count; k++) {
          const t = t0 + k * step
          if (t < startMs || t >= endMs) continue
          n++
          const sEl = e.sun.el[k]
          const eEl = e.earth.el[k]
          maxSun = Math.max(maxSun, sEl)
          maxEarth = Math.max(maxEarth, eEl)
          const clear = sEl - maskAt(mask, h.az_step_deg, e.sun.az[k])
          if (clear >= 0) {
            sunlit++
            const f = visibleFraction(clear, e.sun_ang_radius_deg)
            if (f > 0 && f < 1 - 1e-12) partial++
          }
          const cosE =
            Math.sin(sEl * RAD) * Math.sin(eEl * RAD) +
            Math.cos(sEl * RAD) * Math.cos(eEl * RAD) * Math.cos((e.sun.az[k] - e.earth.az[k]) * RAD)
          litSum += (1 - cosE) / 2
        }
        const maxHill = Math.max(...mask)
        const expectedPartial = (partial / sunlit) * 100

        const d = computeWindowDetails({ horizon: h, ephem: e }, 2, startMs, endMs)
        const m = computeMetrics({ horizon: h, ephem: e }, { observerHeightM: 2, startMs, endMs })!
        const md = mastDelta({ horizon: h, ephem: e }, startMs, endMs)

        console.log(
          id,
          w.label,
          `maxSun ${d.maxSunElDeg?.toFixed(2)}/${maxSun.toFixed(2)}`,
          `partial ${d.sunPartlyHiddenPct?.toFixed(2)}/${expectedPartial.toFixed(2)}`,
          `maxEarth ${d.maxEarthElDeg?.toFixed(2)}/${maxEarth.toFixed(2)}`,
          `lit ${d.earthLitPct?.toFixed(2)}/${((litSum / n) * 100).toFixed(2)}`,
          `hill ${d.maxHillDeg?.toFixed(2)}/${maxHill.toFixed(2)}`,
          `sunlit ${m.pct_sunlit.toFixed(2)}/${((sunlit / n) * 100).toFixed(2)}`,
        )

        expect(Math.abs(d.maxSunElDeg! - maxSun)).toBeLessThan(0.05)
        expect(Math.abs(d.maxEarthElDeg! - maxEarth)).toBeLessThan(0.05)
        expect(Math.abs(d.maxHillDeg! - maxHill)).toBeLessThan(0.05)
        expect(Math.abs(d.earthLitPct! - (litSum / n) * 100)).toBeLessThan(0.1)
        expect(Math.abs(d.sunPartlyHiddenPct! - expectedPartial)).toBeLessThan(0.1)
        // Consistency with computeMetrics: same sample set and the same "Sun visible" share.
        expect(Math.abs(m.pct_sunlit - (sunlit / n) * 100)).toBeLessThan(0.1)
        expect(d.mastGainH).toBeCloseTo(md!.gainH, 9)
        expect(Math.abs(md!.sunHours2 - (sunlit * e.step_minutes) / 60)).toBeLessThan(0.01)
      })
    }
  }
})
