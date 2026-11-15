import { useEffect, useRef } from 'react'

/** Length of each bright segment, in percent of the outline. */
const RING_SEGMENT = 22
/** Target chase speeds (percent of the outline per second) and how long each phase lasts. */
const RING_SPEEDS = [26, 58, 34, 70, 22, 48]
const RING_PHASE_MS = [1700, 2200, 1500, 2400, 1900, 2100]

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}

/** Gap between the two segments (percent of the outline) at time t; it breathes slowly. */
function ringGap(tMs: number): number {
  return 50 + 14 * Math.sin(tMs / 3300)
}

/**
 * Outline of the Sunlight map button while the map computes: two bright segments chase each other
 * around the rounded border. The overlay is absolute, so it never changes the button's size.
 * The speed eases towards a new target every ~2 s and never reaches zero.
 */
export function MapButtonRing() {
  const a = useRef<SVGRectElement>(null)
  const b = useRef<SVGRectElement>(null)
  useEffect(() => {
    if (reducedMotion()) return
    let raf = 0
    let last = performance.now()
    let phase = 0
    let phaseLeft = RING_PHASE_MS[0]
    let speed = RING_SPEEDS[0]
    let pos = 0
    let t = 0
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100)
      last = now
      t += dt
      phaseLeft -= dt
      if (phaseLeft <= 0) {
        phase = (phase + 1) % RING_SPEEDS.length
        phaseLeft = RING_PHASE_MS[phase]
      }
      speed += (RING_SPEEDS[phase] - speed) * (1 - Math.exp(-dt / 350))
      pos = (pos + (speed * dt) / 1000) % 100
      a.current?.style.setProperty('stroke-dashoffset', String(-pos))
      b.current?.style.setProperty('stroke-dashoffset', String(-(pos + ringGap(t))))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const dash = `${RING_SEGMENT} ${100 - RING_SEGMENT}`
  return (
    <svg className="surface__mapbtn-ring" aria-hidden="true" focusable="false">
      <rect ref={a} className="surface__mapbtn-seg" pathLength={100} strokeDasharray={dash} />
      <rect ref={b} className="surface__mapbtn-seg" pathLength={100} strokeDasharray={dash} />
    </svg>
  )
}
