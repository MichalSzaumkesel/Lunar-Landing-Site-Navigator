import { describe, expect, it } from 'vitest'
import { cameraEase, enuToThree, shouldUpdateShadow } from './scene'

describe('cameraEase easing curve', () => {
  it('eases in and out between 0 and 1 with cubic curve', () => {
    expect(cameraEase(0)).toBe(0)
    expect(cameraEase(1)).toBe(1)
    expect(cameraEase(0.5)).toBe(0.5)
    // ease-in: slower at start
    expect(cameraEase(0.2)).toBeLessThan(0.2)
    // ease-out: slower at end
    expect(cameraEase(0.8)).toBeGreaterThan(0.8)
    // Clamping
    expect(cameraEase(-0.5)).toBe(0)
    expect(cameraEase(1.5)).toBe(1)
  })
})

describe('enuToThree coordinate transform', () => {
  it('maps ENU (+X East, +Y North, +Z Up) to Three.js (+X East, +Y Up, -Z North)', () => {
    expect(enuToThree(10, 20, 30)).toEqual([10, 30, -20])
  })
})

describe('shouldUpdateShadow decision helper', () => {
  it('returns true when there is no previous shadow direction (initial render)', () => {
    expect(
      shouldUpdateShadow({
        hasLastShadow: false,
        angleDeg: 0,
        playing: false,
        timeSinceLastUpdateMs: 0,
      }),
    ).toBe(true)

    expect(
      shouldUpdateShadow({
        hasLastShadow: false,
        angleDeg: 0,
        playing: true,
        timeSinceLastUpdateMs: 0,
      }),
    ).toBe(true)
  })

  it('while paused: updates whenever angle difference exceeds 1e-6 deg', () => {
    // Moved slightly
    expect(
      shouldUpdateShadow({
        hasLastShadow: true,
        angleDeg: 0.001,
        playing: false,
        timeSinceLastUpdateMs: 10,
      }),
    ).toBe(true)

    // Unchanged angle
    expect(
      shouldUpdateShadow({
        hasLastShadow: true,
        angleDeg: 0,
        playing: false,
        timeSinceLastUpdateMs: 500,
      }),
    ).toBe(false)

    expect(
      shouldUpdateShadow({
        hasLastShadow: true,
        angleDeg: 1e-7,
        playing: false,
        timeSinceLastUpdateMs: 500,
      }),
    ).toBe(false)
  })

  it('while playing: updates only when angle >= 0.1 deg AND time >= 100 ms', () => {
    // Both thresholds met
    expect(
      shouldUpdateShadow({
        hasLastShadow: true,
        angleDeg: 0.1,
        playing: true,
        timeSinceLastUpdateMs: 100,
      }),
    ).toBe(true)

    expect(
      shouldUpdateShadow({
        hasLastShadow: true,
        angleDeg: 0.25,
        playing: true,
        timeSinceLastUpdateMs: 150,
      }),
    ).toBe(true)

    // Angle too small (< 0.1 deg)
    expect(
      shouldUpdateShadow({
        hasLastShadow: true,
        angleDeg: 0.09,
        playing: true,
        timeSinceLastUpdateMs: 200,
      }),
    ).toBe(false)

    // Time too short (< 100 ms)
    expect(
      shouldUpdateShadow({
        hasLastShadow: true,
        angleDeg: 0.5,
        playing: true,
        timeSinceLastUpdateMs: 80,
      }),
    ).toBe(false)

    // Neither threshold met
    expect(
      shouldUpdateShadow({
        hasLastShadow: true,
        angleDeg: 0.05,
        playing: true,
        timeSinceLastUpdateMs: 50,
      }),
    ).toBe(false)
  })
})
