/** Motion helpers shared by JS-driven animations. CSS animations are neutralised by theme.css. */

/** Mirrors --motion-duration-* in app/theme.css; JS timers and the Web Animations API use these. */
export const MOTION_MS = { fast: 120, normal: 180, slow: 240 } as const

/** Same curves as --motion-ease-out and --motion-ease-in-out in app/theme.css. */
export const MOTION_EASE = {
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}
