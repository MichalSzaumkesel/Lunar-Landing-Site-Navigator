/**
 * Throttling decision helper for MapPanel shading & terminator recomputation.
 *
 * During playback, recomputes only when the cursor time has changed by at least
 * 15 simulated minutes AND at least 250 ms of real time have elapsed (whichever is later).
 * Also triggers immediately when there is no previous computation epoch.
 */

export const MIN_SIMULATED_STEP_MS = 15 * 60 * 1000 // 15 simulated minutes (900,000 ms)
export const MIN_REAL_INTERVAL_MS = 250 // 250 ms real time

export function shouldRecomputeShading(
  currentSimMs: number,
  currentRealMs: number,
  lastSimMs: number | null,
  lastRealMs: number | null,
  minSimMs: number = MIN_SIMULATED_STEP_MS,
  minRealMs: number = MIN_REAL_INTERVAL_MS,
): boolean {
  if (lastSimMs === null || lastRealMs === null) {
    return true
  }

  const simDelta = Math.abs(currentSimMs - lastSimMs)
  const realDelta = currentRealMs - lastRealMs

  // Recompute only when simulated time changed by at least minSimMs
  // AND real time changed by at least minRealMs (whichever is later).
  return simDelta >= minSimMs && realDelta >= minRealMs
}
