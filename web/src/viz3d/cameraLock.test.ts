import { describe, expect, it, vi } from 'vitest'
import {
  createHoldTimer,
  dampAngleDeg,
  dampFactor,
  dampValue,
  holdHint,
  HOLD_MS,
  lockedLabel,
  lockPitchDeg,
  lockReducer,
  shortestDeltaDeg,
  wrapDeg,
} from './cameraLock'

describe('angles', () => {
  it('wraps and takes the shortest way over 0/360', () => {
    expect(wrapDeg(-10)).toBe(350)
    expect(shortestDeltaDeg(350, 10)).toBe(20)
    expect(shortestDeltaDeg(10, 350)).toBe(-20)
    expect(shortestDeltaDeg(0, 180)).toBe(180)
    expect(shortestDeltaDeg(90, 90)).toBe(0)
  })

  it('damps across the wrap without going the long way', () => {
    const a = dampAngleDeg(350, 10, 140)
    expect(shortestDeltaDeg(350, a)).toBeGreaterThan(0)
    expect(shortestDeltaDeg(350, a)).toBeLessThan(20)
    expect(shortestDeltaDeg(10, dampAngleDeg(10, 350, 140))).toBeLessThan(0)
    expect(shortestDeltaDeg(10, dampAngleDeg(10, 350, 140))).toBeGreaterThan(-20)
  })

  it('damping factor is frame-rate independent', () => {
    expect(dampFactor(0)).toBe(0)
    expect(dampFactor(140)).toBeCloseTo(1 - Math.exp(-1), 10)
    const once = dampValue(0, 100, 32)
    const twice = dampValue(dampValue(0, 100, 16), 100, 16)
    expect(twice).toBeCloseTo(once, 8)
  })

  it('pitch follows elevation but stays above the horizon', () => {
    expect(lockPitchDeg(30)).toBe(30)
    expect(lockPitchDeg(-12)).toBe(0)
    expect(lockPitchDeg(95)).toBe(89)
  })
})

describe('hold timer', () => {
  it('fires after the hold time and reports it on release', () => {
    vi.useFakeTimers()
    const onLock = vi.fn()
    const t = createHoldTimer({ onLock })
    t.start()
    vi.advanceTimersByTime(HOLD_MS - 1)
    expect(onLock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onLock).toHaveBeenCalledTimes(1)
    expect(t.cancel()).toBe(true)
    expect(t.cancel()).toBe(false)
    vi.useRealTimers()
  })

  it('a short press is a click and never locks', () => {
    vi.useFakeTimers()
    const onLock = vi.fn()
    const t = createHoldTimer({ onLock })
    t.start()
    vi.advanceTimersByTime(200)
    expect(t.cancel()).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(onLock).not.toHaveBeenCalled()
    expect(t.pending).toBe(false)
    vi.useRealTimers()
  })

  it('shows hold visuals only after the delay and never for a quick click', () => {
    vi.useFakeTimers()
    const onShow = vi.fn()
    const onLock = vi.fn()
    const t = createHoldTimer({ onLock, onShow, showAfterMs: 220 })
    t.start()
    vi.advanceTimersByTime(219)
    expect(onShow).not.toHaveBeenCalled()
    t.cancel()
    vi.advanceTimersByTime(1000)
    expect(onShow).not.toHaveBeenCalled()
    t.start()
    vi.advanceTimersByTime(220)
    expect(onShow).toHaveBeenCalledTimes(1)
    expect(onLock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(HOLD_MS)
    expect(onShow).toHaveBeenCalledTimes(1)
    expect(onLock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('ignores a repeated start while pending', () => {
    vi.useFakeTimers()
    const onLock = vi.fn()
    const t = createHoldTimer({ onLock, holdMs: 100 })
    t.start()
    t.start()
    vi.advanceTimersByTime(500)
    expect(onLock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('lock state', () => {
  it('keeps one lock at a time and toggles off', () => {
    expect(lockReducer(null, { type: 'lock', body: 'sun' })).toBe('sun')
    expect(lockReducer('sun', { type: 'lock', body: 'earth' })).toBe('earth')
    expect(lockReducer('earth', { type: 'toggle', body: 'earth' })).toBeNull()
    expect(lockReducer('earth', { type: 'toggle', body: 'lander' })).toBe('lander')
    expect(lockReducer('lander', { type: 'unlock' })).toBeNull()
  })

  it('has the texts', () => {
    expect(lockedLabel('sun')).toBe('Locked on the Sun')
    expect(lockedLabel('earth')).toBe('Locked on the Earth')
    expect(holdHint('lander')).toBe('Hold to lock the camera on the lander')
  })
})
