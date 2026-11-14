import { describe, expect, it } from 'vitest'
import { earthPhaseText, earthPhaseView, litPartPath, polarRotationDeg, stripRotationDeg } from './earthDisc'

describe('litPartPath', () => {
  it('is empty for a new Earth and a full disc for a full one', () => {
    expect(litPartPath(0)).toBe('')
    expect(litPartPath(1)).toContain('A1,1 0 1 1')
  })

  it('bulges the terminator towards the lit side for a crescent', () => {
    expect(litPartPath(0.25)).toBe('M0,-1A1,1 0 0 1 0,1A0.500,1 0 0 0 0,-1Z')
  })

  it('bulges the terminator towards the dark side for a gibbous disc', () => {
    expect(litPartPath(0.75)).toBe('M0,-1A1,1 0 0 1 0,1A0.500,1 0 0 1 0,-1Z')
  })

  it('is a half disc at 50 %', () => {
    expect(litPartPath(0.5)).toBe('M0,-1A1,1 0 0 1 0,1A0.000,1 0 0 1 0,-1Z')
  })
})

describe('earthPhaseView', () => {
  it('has the lit limb towards the Sun, here straight up', () => {
    const v = earthPhaseView({ sun: { az: 0, el: 60 }, earth: { az: 0, el: 30 } })
    // Sun-Earth angle 30 deg: (1 - cos 30) / 2
    expect(v.fraction).toBeCloseTo(0.0670, 3)
    expect(v.name).toBe('crescent')
    expect(v.dEl).toBeCloseTo(1, 6)
    expect(v.dAz).toBeCloseTo(0, 6)
    expect(stripRotationDeg(v)).toBeCloseTo(-90, 6)
  })

  it('is a half disc at 90 deg with the lit limb towards increasing azimuth', () => {
    const v = earthPhaseView({ sun: { az: 90, el: 0 }, earth: { az: 0, el: 0 } })
    expect(v.fraction).toBeCloseTo(0.5, 6)
    expect(v.name).toBe('half')
    expect(v.dAz).toBeCloseTo(1, 6)
    expect(Math.abs(stripRotationDeg(v))).toBeCloseTo(0, 6)
  })

  it('rotates the limb with the position angle in the polar plot', () => {
    // Earth due east: increasing elevation points towards the plot centre, i.e. to the left.
    const v = earthPhaseView({ sun: { az: 90, el: 60 }, earth: { az: 90, el: 30 } })
    expect(Math.abs(polarRotationDeg(v, 90))).toBeCloseTo(180, 6)
    // Earth due north: increasing elevation points down on screen.
    const n = earthPhaseView({ sun: { az: 0, el: 60 }, earth: { az: 0, el: 30 } })
    expect(polarRotationDeg(n, 0)).toBeCloseTo(90, 6)
  })
})

describe('earthPhaseText', () => {
  it('shows the lit share and the phase name', () => {
    expect(earthPhaseText({ fraction: 0.63, name: 'gibbous' })).toBe('Earth lit 63 %, gibbous')
  })
})
