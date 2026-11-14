import { DAY_MS, HOUR_MS } from '../config/dataRange'
import type { Scenario } from './types'

/** Effective window of a scenario in epoch milliseconds (start shifted by the slip). */
export function scenarioWindowMs(s: Scenario): { startMs: number; endMs: number } {
  const startMs = Date.parse(s.startUtc) + s.slipDays * DAY_MS
  return { startMs, endMs: startMs + s.durationH * HOUR_MS }
}

/** Absolute time of the shared cursor for one scenario, clamped to its window. */
export function scenarioCursorMs(s: Scenario, cursorH: number): number {
  const { startMs } = scenarioWindowMs(s)
  const h = Math.min(Math.max(cursorH, 0), s.durationH)
  return startMs + h * HOUR_MS
}

export function scenarioCursorUtc(s: Scenario, cursorH: number): string {
  const ms = scenarioCursorMs(s, cursorH)
  const roundedMs = Math.round(ms / 1000) * 1000
  return new Date(roundedMs).toISOString().slice(0, 19) + 'Z'
}
