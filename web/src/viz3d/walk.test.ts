// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  applyWalkKey,
  createWalkMotion,
  hasWalkBlockingModifier,
  isTypingTarget,
  walkAxis,
  walkKeyOf,
  walkSpeedScale,
  walkTarget,
  WALK_SPEED_MPS,
} from './walk'
import type { WalkKey } from './walk'

const keys = (...k: WalkKey[]) => new Set<WalkKey>(k)
const S2 = Math.SQRT1_2

describe('walkKeyOf', () => {
  it('maps the physical WASD cluster, the code winning over the character', () => {
    expect(walkKeyOf({ key: 'w', code: 'KeyW' })).toBe('forward')
    expect(walkKeyOf({ key: 'W', code: 'KeyW' })).toBe('forward')
    expect(walkKeyOf({ key: 'a', code: 'KeyA' })).toBe('left')
    expect(walkKeyOf({ key: 's', code: 'KeyS' })).toBe('back')
    expect(walkKeyOf({ key: 'd', code: 'KeyD' })).toBe('right')
    // Another layout: the character "w" on a different physical key is not a walk key.
    expect(walkKeyOf({ key: 'w', code: 'KeyZ' })).toBeNull()
  })

  it('falls back to the character when there is no code, and ignores arrows', () => {
    expect(walkKeyOf({ key: 'W' })).toBe('forward')
    expect(walkKeyOf({ key: 'd' })).toBe('right')
    expect(walkKeyOf({ key: 'ArrowUp', code: 'ArrowUp' })).toBeNull()
    expect(walkKeyOf({ key: 'ArrowUp' })).toBeNull()
    expect(walkKeyOf({ key: 'Shift', code: 'ShiftLeft' })).toBeNull()
  })
})

describe('applyWalkKey', () => {
  it('reports changes only, so key repeat is harmless', () => {
    const held = keys()
    expect(applyWalkKey(held, 'forward', true)).toBe(true)
    expect(applyWalkKey(held, 'forward', true)).toBe(false)
    expect(held.size).toBe(1)
    expect(applyWalkKey(held, 'forward', false)).toBe(true)
    expect(applyWalkKey(held, 'forward', false)).toBe(false)
    expect(held.size).toBe(0)
  })
})

describe('walkAxis', () => {
  it('is zero with no keys and with opposite keys', () => {
    expect(walkAxis(keys())).toEqual({ x: 0, y: 0 })
    expect(walkAxis(keys('forward', 'back'))).toEqual({ x: 0, y: 0 })
    expect(walkAxis(keys('left', 'right'))).toEqual({ x: 0, y: 0 })
  })

  it('normalises diagonals to length 1', () => {
    const a = walkAxis(keys('forward', 'right'))
    expect(a.x).toBeCloseTo(S2, 12)
    expect(a.y).toBeCloseTo(S2, 12)
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 12)
    const bl = walkAxis(keys('back', 'left'))
    expect(bl.x).toBeCloseTo(-S2, 12)
    expect(bl.y).toBeCloseTo(-S2, 12)
  })
})

describe('walkTarget (x east, y north, yaw from north clockwise)', () => {
  it('W goes along the look direction', () => {
    const n = walkTarget(keys('forward'), 0, 8)
    expect(n.x).toBeCloseTo(0, 12)
    expect(n.y).toBeCloseTo(8, 12)
    const e = walkTarget(keys('forward'), 90, 8)
    expect(e.x).toBeCloseTo(8, 12)
    expect(e.y).toBeCloseTo(0, 12)
    const s = walkTarget(keys('forward'), 180, 8)
    expect(s.x).toBeCloseTo(0, 12)
    expect(s.y).toBeCloseTo(-8, 12)
    const ne = walkTarget(keys('forward'), 45, 8)
    expect(ne.x).toBeCloseTo(8 * S2, 12)
    expect(ne.y).toBeCloseTo(8 * S2, 12)
  })

  it('S goes backwards', () => {
    const v = walkTarget(keys('back'), 0, 8)
    expect(v.x).toBeCloseTo(0, 12)
    expect(v.y).toBeCloseTo(-8, 12)
  })

  it('A and D strafe to the left and right of the look direction', () => {
    const d0 = walkTarget(keys('right'), 0, 8)
    expect(d0.x).toBeCloseTo(8, 12)
    expect(d0.y).toBeCloseTo(0, 12)
    const a0 = walkTarget(keys('left'), 0, 8)
    expect(a0.x).toBeCloseTo(-8, 12)
    // Facing east, the right hand points south.
    const d90 = walkTarget(keys('right'), 90, 8)
    expect(d90.x).toBeCloseTo(0, 12)
    expect(d90.y).toBeCloseTo(-8, 12)
  })

  it('a diagonal has the same speed as a straight line', () => {
    for (const yaw of [0, 30, 135, 270]) {
      const v = walkTarget(keys('forward', 'right'), yaw, WALK_SPEED_MPS)
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(WALK_SPEED_MPS, 12)
    }
    const v = walkTarget(keys('forward', 'right'), 0, 8)
    expect(v.x).toBeCloseTo(8 * S2, 12)
    expect(v.y).toBeCloseTo(8 * S2, 12)
  })

  it('Shift is four times as fast', () => {
    expect(walkSpeedScale(false)).toBe(1)
    expect(walkSpeedScale(true)).toBe(4)
    const v = walkTarget(keys('forward'), 0, WALK_SPEED_MPS * walkSpeedScale(true))
    expect(v.y).toBeCloseTo(32, 12)
  })
})

describe('modifiers and focus', () => {
  it('Ctrl, Meta and Alt block walking, Shift does not', () => {
    expect(hasWalkBlockingModifier({ ctrlKey: true })).toBe(true)
    expect(hasWalkBlockingModifier({ metaKey: true })).toBe(true)
    expect(hasWalkBlockingModifier({ altKey: true })).toBe(true)
    expect(hasWalkBlockingModifier({})).toBe(false)
  })

  it('inputs, selects, sliders and menus use the letter keys themselves', () => {
    const mk = (html: string) => {
      const d = document.createElement('div')
      d.innerHTML = html
      return d.firstElementChild as HTMLElement
    }
    expect(isTypingTarget(mk('<input type="text">'))).toBe(true)
    expect(isTypingTarget(mk('<select><option>a</option></select>'))).toBe(true)
    expect(isTypingTarget(mk('<textarea></textarea>'))).toBe(true)
    expect(isTypingTarget(mk('<div role="slider" tabindex="0"></div>'))).toBe(true)
    expect(isTypingTarget(mk('<div role="menu"><button>x</button></div>').querySelector('button'))).toBe(true)
    expect(isTypingTarget(mk('<div contenteditable="true"></div>'))).toBe(true)
    expect(isTypingTarget(mk('<canvas></canvas>'))).toBe(false)
    expect(isTypingTarget(mk('<div tabindex="0"></div>'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

/** A manual clock and frame queue, so a walk runs deterministically. */
function harness(over: { yawDeg?: number; reduced?: boolean } = {}) {
  let t = 0
  let cb: ((t: number) => void) | null = null
  let nextId = 1
  const moves: Array<[number, number]> = []
  const onStart = vi.fn()
  const onStop = vi.fn()
  const m = createWalkMotion({
    getFrame: () => ({ yawDeg: over.yawDeg ?? 0, speedMps: 8 }),
    onMove: (de, dn) => moves.push([de, dn]),
    onStart,
    onStop,
    reducedMotion: () => over.reduced ?? false,
    now: () => t,
    raf: (f) => {
      cb = f
      return nextId++
    },
    caf: () => {
      cb = null
    },
  })
  const run = (seconds: number, stepMs: number) => {
    for (let i = 0; i < Math.round((seconds * 1000) / stepMs); i++) {
      t += stepMs
      const f = cb
      cb = null
      f?.(t)
    }
  }
  const total = () => moves.reduce((a, [e, n]) => [a[0] + e, a[1] + n], [0, 0])
  return { m, run, moves, total, onStart, onStop, pending: () => cb !== null }
}
const down = (code: string, extra: object = {}) => ({ key: code.slice(3).toLowerCase(), code, shiftKey: false, ...extra })

describe('createWalkMotion', () => {
  it('walks 8 m in 1 s at full speed (reduced motion: no easing)', () => {
    const h = harness({ reduced: true })
    expect(h.m.handleKey(down('KeyW'), true)).toBe(true)
    h.run(1, 50)
    const [e, n] = h.total()
    expect(e).toBeCloseTo(0, 9)
    expect(n).toBeCloseTo(8, 9)
    expect(h.onStart).toHaveBeenCalledTimes(1)
  })

  it('eases in, and the distance hardly depends on the frame rate', () => {
    const a = harness()
    a.m.handleKey(down('KeyW'), true)
    a.run(1, 50)
    const b = harness()
    b.m.handleKey(down('KeyW'), true)
    b.run(1, 10)
    // Closed form: 8 * (1 - 0.05 * (1 - e^-20)) = 7.6 m after 1 s with a 50 ms ease-in.
    expect(a.total()[1]).toBeGreaterThan(7.3)
    expect(a.total()[1]).toBeLessThan(7.9)
    expect(Math.abs(a.total()[1] - b.total()[1])).toBeLessThan(0.15)
    // The first frame moves less than the steady state.
    expect(a.moves[0][1]).toBeLessThan(8 * 0.05 * 0.7)
  })

  it('Shift makes it four times as fast', () => {
    const h = harness({ reduced: true })
    h.m.handleKey(down('KeyW', { shiftKey: true }), true)
    h.run(1, 50)
    expect(h.total()[1]).toBeCloseTo(32, 9)
  })

  it('strafes and walks diagonally relative to the yaw', () => {
    const h = harness({ reduced: true, yawDeg: 90 })
    h.m.handleKey(down('KeyW'), true)
    h.m.handleKey(down('KeyD'), true)
    h.run(1, 50)
    // Facing east: forward is east, right is south, each scaled by 1/sqrt(2).
    expect(h.total()[0]).toBeCloseTo(8 * S2, 9)
    expect(h.total()[1]).toBeCloseTo(-8 * S2, 9)
  })

  it('key repeat does not restart or speed up the walk', () => {
    const h = harness({ reduced: true })
    for (let i = 0; i < 5; i++) h.m.handleKey(down('KeyW'), true)
    h.run(1, 50)
    expect(h.total()[1]).toBeCloseTo(8, 9)
    expect(h.onStart).toHaveBeenCalledTimes(1)
  })

  it('ignores keydown with Ctrl, Meta or Alt, and non-walk keys', () => {
    const h = harness()
    expect(h.m.handleKey(down('KeyW', { ctrlKey: true }), true)).toBe(false)
    expect(h.m.handleKey(down('KeyW', { metaKey: true }), true)).toBe(false)
    expect(h.m.handleKey(down('KeyA', { altKey: true }), true)).toBe(false)
    expect(h.m.handleKey({ key: 'ArrowUp', code: 'ArrowUp', shiftKey: false }, true)).toBe(false)
    expect(h.pending()).toBe(false)
    expect(h.m.active).toBe(false)
    expect(h.onStart).not.toHaveBeenCalled()
  })

  it('releasing the key eases out and then stops once', () => {
    const h = harness()
    h.m.handleKey(down('KeyW'), true)
    h.run(0.5, 20)
    h.m.handleKey(down('KeyW'), false)
    h.run(2, 20)
    expect(h.onStop).toHaveBeenCalledTimes(1)
    expect(h.m.active).toBe(false)
    expect(h.pending()).toBe(false)
    const before = h.moves.length
    h.run(1, 20)
    expect(h.moves.length).toBe(before)
  })

  it('stop() (blur, hidden tab, mode switch) halts at once and reports it', () => {
    const h = harness()
    h.m.handleKey(down('KeyW'), true)
    h.run(0.3, 20)
    const before = h.moves.length
    h.m.stop()
    expect(h.onStop).toHaveBeenCalledTimes(1)
    expect(h.m.active).toBe(false)
    h.run(1, 20)
    expect(h.moves.length).toBe(before)
    // A fresh press after the stop starts cleanly from rest.
    h.m.handleKey(down('KeyW'), true)
    expect(h.onStart).toHaveBeenCalledTimes(2)
    h.m.stop()
    h.m.stop()
    expect(h.onStop).toHaveBeenCalledTimes(2)
  })

  it('a long stall moves at most 0.1 s worth', () => {
    const h = harness({ reduced: true })
    h.m.handleKey(down('KeyW'), true)
    h.run(5, 5000)
    expect(h.total()[1]).toBeCloseTo(0.8, 9)
  })
})
