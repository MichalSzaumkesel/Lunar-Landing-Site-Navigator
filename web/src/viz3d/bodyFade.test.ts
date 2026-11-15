import { describe, expect, it } from 'vitest'
import {
  advanceFade,
  blendOpacity,
  blendScale,
  createBodyFade,
  dampSize,
  fadeFx,
  nextShown,
  retargetFade,
  stepProgress,
} from './bodyFade'

describe('stepProgress', () => {
  it('moves at a constant rate of 1 / FADE_MS per millisecond', () => {
    expect(stepProgress(0, true, 75)).toBe(0.25)
    expect(stepProgress(0.25, true, 75)).toBe(0.5)
    expect(stepProgress(1, false, 150)).toBe(0.5)
  })

  it('clamps at the target and ignores negative steps', () => {
    expect(stepProgress(0.9, true, 1000)).toBe(1)
    expect(stepProgress(0.1, false, 1000)).toBe(0)
    expect(stepProgress(0.4, true, -50)).toBe(0.4)
  })

  it('is frame-rate independent: two 75 ms steps equal one 150 ms step', () => {
    expect(stepProgress(stepProgress(0, true, 75), true, 75)).toBe(stepProgress(0, true, 150))
  })

  it('reverses from where it is when the target flips mid-fade', () => {
    const p = stepProgress(0, true, 150) // 0.5
    expect(stepProgress(p, false, 75)).toBe(0.25)
  })

  it('jumps straight to the target for a zero duration', () => {
    expect(stepProgress(0.3, true, 16, 0)).toBe(1)
  })
})

describe('blendOpacity and blendScale', () => {
  it('ease in and out (cubic) between 0 and 1', () => {
    expect(blendOpacity(0)).toBe(0)
    expect(blendOpacity(0.25)).toBe(0.0625)
    expect(blendOpacity(0.5)).toBe(0.5)
    expect(blendOpacity(0.75)).toBe(0.9375)
    expect(blendOpacity(1)).toBe(1)
  })

  it('scale goes from 0.92 to 1 along the same curve', () => {
    expect(blendScale(0)).toBeCloseTo(0.92, 10)
    expect(blendScale(0.5)).toBeCloseTo(0.96, 10)
    expect(blendScale(1)).toBe(1)
  })
})

describe('nextShown hysteresis', () => {
  // margin = clearance + angRadius; the plain threshold is 0, the dead band is +-0.05 deg.
  it('a shown body stays shown just under the threshold and hides only past the band', () => {
    expect(nextShown(true, -0.2666, 0.2666)).toBe(true) // margin 0
    expect(nextShown(true, -0.31, 0.2666)).toBe(true) // margin -0.0434
    expect(nextShown(true, -0.33, 0.2666)).toBe(false) // margin -0.0634
  })

  it('a hidden body comes back only once it is clearly above the threshold', () => {
    expect(nextShown(false, -0.2, 0.2666)).toBe(true) // margin 0.0666
    expect(nextShown(false, -0.25, 0.2666)).toBe(false) // margin 0.0166
    expect(nextShown(false, -0.04, 0.1)).toBe(true) // margin 0.06
  })

  it('does not flicker when the margin jitters inside the band', () => {
    let shown = true
    for (const margin of [0.03, -0.03, 0.04, -0.04, 0.01, -0.049]) shown = nextShown(shown, margin, 0)
    expect(shown).toBe(true)
    shown = false
    for (const margin of [0.03, -0.03, 0.04, -0.04, 0.01, 0.049]) shown = nextShown(shown, margin, 0)
    expect(shown).toBe(false)
  })
})

describe('dampSize', () => {
  it('follows 1 - exp(-dt / tau) (63.2 percent after one time constant)', () => {
    expect(dampSize(1, 5, 80)).toBeCloseTo(1 + 4 * (1 - Math.exp(-1)), 10) // 3.52848
  })

  it('snaps when close and does not move without time', () => {
    expect(dampSize(4.9995, 5, 16)).toBe(5)
    expect(dampSize(2, 5, 0)).toBe(2)
  })
})

describe('body fade state', () => {
  it('snaps on the first retarget instead of animating', () => {
    const f = createBodyFade()
    retargetFade(f, true, 10, 0.27, 3, false)
    expect(f.p).toBe(1)
    expect(f.size).toBe(3)
    expect(fadeFx(f, 3)).toEqual({ opacity: 1, scale: 1 })
  })

  it('fades out over 300 ms after the disc sinks, then reports it is idle', () => {
    const f = createBodyFade()
    retargetFade(f, true, 10, 0.27, 1, false)
    retargetFade(f, true, -5, 0.27, 1, false)
    expect(f.shown).toBe(false)
    expect(advanceFade(f, 150, 1, false)).toBe(true)
    expect(fadeFx(f, 1).opacity).toBe(0.5)
    expect(advanceFade(f, 150, 1, false)).toBe(false)
    expect(fadeFx(f, 1).opacity).toBe(0)
  })

  it('treats an unknown direction as hidden', () => {
    const f = createBodyFade()
    retargetFade(f, false, 0, 0.27, 1, false)
    expect(f.shown).toBe(false)
    expect(f.p).toBe(0)
  })

  it('eases the size multiplier without touching the fade, and scales the radius by the ratio', () => {
    const f = createBodyFade()
    retargetFade(f, true, 10, 0.27, 1, false)
    retargetFade(f, true, 10, 0.27 * 5, 5, false)
    expect(advanceFade(f, 80, 5, false)).toBe(true)
    const fx = fadeFx(f, 5)
    expect(fx.opacity).toBe(1)
    expect(fx.scale).toBeCloseTo((1 + 4 * (1 - Math.exp(-1))) / 5, 10)
  })

  it('swaps instantly under reduced motion', () => {
    const f = createBodyFade()
    retargetFade(f, true, 10, 0.27, 1, false)
    retargetFade(f, true, -5, 0.27, 4, true)
    expect(f.p).toBe(0)
    expect(f.size).toBe(4)
    expect(advanceFade(f, 16, 4, true)).toBe(false)
  })
})
