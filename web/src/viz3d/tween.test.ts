import { describe, expect, it } from 'vitest'
import { easeInOutCubic, lerpOffset, startTween } from './tween'

function fakeClock() {
  let t = 0
  let next = 1
  const queue = new Map<number, (t: number) => void>()
  return {
    now: () => t,
    raf: (cb: (t: number) => void) => {
      const id = next++
      queue.set(id, cb)
      return id
    },
    caf: (id: number) => void queue.delete(id),
    tick(ms: number) {
      t += ms
      const cbs = [...queue.values()]
      queue.clear()
      cbs.forEach((cb) => cb(t))
    },
    pending: () => queue.size,
  }
}

describe('easeInOutCubic', () => {
  it('has fixed endpoints, midpoint and clamps', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12)
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 12)
    expect(easeInOutCubic(-3)).toBe(0)
    expect(easeInOutCubic(9)).toBe(1)
  })
})

describe('lerpOffset', () => {
  it('interpolates both axes', () => {
    expect(lerpOffset({ eastM: 0, northM: 100 }, { eastM: 200, northM: -100 }, 0.25)).toEqual({
      eastM: 50,
      northM: 50,
    })
  })
})

describe('startTween', () => {
  it('runs to exactly 1 and reports finished once', () => {
    const c = fakeClock()
    const frames: number[] = []
    const ends: boolean[] = []
    startTween({ durationMs: 100, onFrame: (e) => frames.push(e), onEnd: (f) => ends.push(f), ...c })
    c.tick(50)
    c.tick(60)
    c.tick(60)
    expect(frames[frames.length - 1]).toBe(1)
    expect(frames[0]).toBeCloseTo(0.5, 12)
    expect(ends).toEqual([true])
    expect(c.pending()).toBe(0)
  })

  it('cancel stops frames, reports unfinished and leaves no pending frame', () => {
    const c = fakeClock()
    const frames: number[] = []
    const ends: boolean[] = []
    const cancel = startTween({ durationMs: 100, onFrame: (e) => frames.push(e), onEnd: (f) => ends.push(f), ...c })
    c.tick(20)
    cancel()
    cancel()
    c.tick(200)
    expect(frames).toHaveLength(1)
    expect(ends).toEqual([false])
    expect(c.pending()).toBe(0)
  })

  it('a zero duration finishes on the first frame', () => {
    const c = fakeClock()
    const frames: number[] = []
    startTween({ durationMs: 0, onFrame: (e) => frames.push(e), ...c })
    c.tick(1)
    expect(frames).toEqual([1])
  })
})
