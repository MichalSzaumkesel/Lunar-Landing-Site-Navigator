import { describe, expect, it, vi } from 'vitest'
import {
  applyKey,
  createKeyMotion,
  inputAxis,
  speedScale,
  stepVelocity,
  TAU_IN_S,
} from './keyMotion'

describe('applyKey', () => {
  it('adds and removes arrow keys only', () => {
    const s = new Set<string>()
    expect(applyKey(s, 'ArrowLeft', true)).toBe(true)
    expect(applyKey(s, 'ArrowLeft', true)).toBe(false)
    expect(applyKey(s, 'KeyA', true)).toBe(false)
    expect(applyKey(s, 'ArrowLeft', false)).toBe(true)
    expect(s.size).toBe(0)
  })
})

describe('inputAxis', () => {
  it('is zero for opposite keys and normalises diagonals', () => {
    expect(inputAxis(new Set(['ArrowLeft', 'ArrowRight']))).toEqual({ x: 0, y: 0 })
    const d = inputAxis(new Set(['ArrowRight', 'ArrowUp']))
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 10)
    expect(d.x).toBeGreaterThan(0)
    expect(d.y).toBeGreaterThan(0)
  })
})

describe('speedScale', () => {
  it('Shift faster, Alt finer', () => {
    expect(speedScale({ shift: true, alt: false })).toBeGreaterThan(1)
    expect(speedScale({ shift: false, alt: true })).toBeLessThan(1)
    expect(speedScale({ shift: false, alt: false })).toBe(1)
  })
})

describe('stepVelocity', () => {
  const target = { x: 100, y: 0 }
  it('eases in: about 63 % after one time constant, never overshoots', () => {
    let v = { x: 0, y: 0 }
    for (let i = 0; i < 3; i++) v = stepVelocity(v, target, TAU_IN_S / 3)
    expect(v.x).toBeCloseTo(100 * (1 - Math.exp(-1)), 6)
    expect(v.x).toBeLessThan(100)
  })
  it('is independent of the frame rate', () => {
    let a = { x: 0, y: 0 }
    let b = { x: 0, y: 0 }
    for (let i = 0; i < 12; i++) a = stepVelocity(a, target, 1 / 120)
    for (let i = 0; i < 6; i++) b = stepVelocity(b, target, 1 / 60)
    expect(a.x).toBeCloseTo(b.x, 9)
  })
  it('damps to zero without input', () => {
    let v = { x: 100, y: -50 }
    for (let i = 0; i < 60; i++) v = stepVelocity(v, { x: 0, y: 0 }, 1 / 60)
    expect(Math.hypot(v.x, v.y)).toBeLessThan(0.5)
  })
  it('clamps a huge dt', () => {
    const v = stepVelocity({ x: 0, y: 0 }, target, 10)
    expect(v.x).toBeCloseTo(100 * (1 - Math.exp(-0.05 / TAU_IN_S)), 9)
  })
})

function harness(speed: number, reduced = false) {
  let t = 0
  let cb: ((t: number) => void) | null = null
  const moves: number[] = []
  const onStop = vi.fn()
  const km = createKeyMotion({
    speed,
    onMove: (dx) => moves.push(dx),
    onStop,
    reducedMotion: () => reduced,
    now: () => t,
    raf: (f) => {
      cb = f
      return 1
    },
    caf: () => {
      cb = null
    },
  })
  const frame = (ms: number) => {
    t += ms
    const f = cb
    cb = null
    f?.(t)
  }
  return { km, frame, moves, onStop }
}

const right = { key: 'ArrowRight', shiftKey: false, altKey: false }

describe('createKeyMotion', () => {
  it('ignores non-arrow keys', () => {
    const h = harness(100)
    expect(h.km.handleKey({ key: 'a', shiftKey: false, altKey: false }, true)).toBe(false)
    expect(h.km.active).toBe(false)
  })
  it('accelerates smoothly, covers a rate-independent distance and stops on release', () => {
    const dist = (frameMs: number) => {
      const h = harness(100)
      h.km.handleKey(right, true)
      for (let t = 0; t < 1000; t += frameMs) h.frame(frameMs)
      return h.moves.reduce((a, b) => a + b, 0)
    }
    const d60 = dist(1000 / 60)
    const d30 = dist(1000 / 30)
    expect(d60).toBeGreaterThan(80)
    expect(Math.abs(d60 - d30) / d60).toBeLessThan(0.05)

    const h = harness(100)
    h.km.handleKey(right, true)
    for (let i = 0; i < 30; i++) h.frame(16)
    h.km.handleKey(right, false)
    for (let i = 0; i < 100 && h.km.active; i++) h.frame(16)
    expect(h.onStop).toHaveBeenCalledTimes(1)
    expect(h.km.active).toBe(false)
  })
  it('release() eases out like a key up', () => {
    const h = harness(100)
    h.km.handleKey(right, true)
    h.frame(16)
    h.km.release()
    for (let i = 0; i < 100 && h.km.active; i++) h.frame(16)
    expect(h.onStop).toHaveBeenCalled()
  })
  it('reduced motion reaches full speed in the first frame', () => {
    const h = harness(100, true)
    h.km.handleKey(right, true)
    h.frame(10)
    expect(h.moves[0]).toBeCloseTo(1, 9)
  })
  it('dispose stops the loop without onStop', () => {
    const h = harness(100)
    h.km.handleKey(right, true)
    h.km.dispose()
    expect(h.km.active).toBe(false)
    expect(h.onStop).not.toHaveBeenCalled()
  })
})
