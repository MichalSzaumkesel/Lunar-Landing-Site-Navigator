import { DAY_MS, HOUR_MS } from '../config/dataRange'
import type { Scenario } from './types'

/** Effective window of a scenario in epoch milliseconds (start shifted by the slip). */
export function scenarioWindowMs(s: Scenario): { startMs: number; endMs: number } {
  const parsed = Date.parse(s.startUtc)
  const baseStart = Number.isFinite(parsed) ? parsed : 0
  const slip = Number.isFinite(s.slipDays) ? s.slipDays : 0
  const duration = Number.isFinite(s.durationH) && s.durationH > 0 ? s.durationH : 1
  const startMs = baseStart + slip * DAY_MS
  return { startMs, endMs: startMs + duration * HOUR_MS }
}

/** Absolute time of the shared cursor for one scenario, clamped to its window. */
export function scenarioCursorMs(s: Scenario, cursorH: number): number {
  const { startMs } = scenarioWindowMs(s)
  const duration = Number.isFinite(s.durationH) && s.durationH > 0 ? s.durationH : 1
  const safeH = Number.isFinite(cursorH) ? cursorH : 0
  const h = Math.min(Math.max(safeH, 0), duration)
  return startMs + h * HOUR_MS
}

export function scenarioCursorUtc(s: Scenario, cursorH: number): string {
  const ms = scenarioCursorMs(s, cursorH)
  if (!Number.isFinite(ms)) {
    return s.startUtc ?? ''
  }
  const roundedMs = Math.round(ms / 1000) * 1000
  try {
    return new Date(roundedMs).toISOString().slice(0, 19) + 'Z'
  } catch {
    return s.startUtc ?? ''
  }
}
