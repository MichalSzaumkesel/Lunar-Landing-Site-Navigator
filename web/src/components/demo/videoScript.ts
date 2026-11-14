import type { DemoStep, DemoStepContext } from './demoSteps'
import { DEMO_STEPS, appendDemoDataNotice } from './demoSteps'
import { triggerDemoCameraPan } from './cameraControl'

/**
 * Base durations table for narration steps.
 * Step 1: Apollo vs Artemis comparison (6 s)
 * Step 2: 3D Sun and Earth camera pan with timeline playback (7 s)
 * Step 3: Sunset countdown moment (6 s)
 * Step 4: Metrics difference (6 s)
 * Step 5: 14-day slip preset comparison (6 s)
 * Step 6: End card (5 s)
 */
export const BASE_STEP_DURATIONS: readonly number[] = [6000, 7000, 6000, 6000, 6000, 5000]

export const VIDEO_END_CARD_TITLE = 'Lunar Landing Site Navigator — NASA Space Apps 2026'

/**
 * Pure function that scales step durations to totalMs and returns the planned video steps.
 * The durations sum to totalMs within 1 ms, and the final step is the end card showing
 * the project name and "NASA Space Apps 2026".
 */
export function planVideoSteps(totalMs: number = 30000): readonly DemoStep[] {
  const baseTotal = BASE_STEP_DURATIONS.reduce((a, b) => a + b, 0)
  let accumulated = 0
  const durations = BASE_STEP_DURATIONS.map((baseD, i) => {
    if (i === BASE_STEP_DURATIONS.length - 1) {
      return totalMs - accumulated
    }
    const scaled = Math.round((baseD / baseTotal) * totalMs)
    accumulated += scaled
    return scaled
  })

  return DEMO_STEPS.map((baseStep, i) => {
    const durationMs = durations[i]
    if (i === 1) {
      // Step 2: cinematic camera pan timed to this step's duration
      return {
        ...baseStep,
        durationMs,
        run(store, ctx) {
          store.setCursorH(0)
          store.setPlaying(true)
          triggerDemoCameraPan(ctx, durationMs)
        },
      }
    }
    if (i === DEMO_STEPS.length - 1) {
      // Step 6: End card showing project name and NASA Space Apps 2026
      return {
        ...baseStep,
        id: 'step-6-end-card',
        durationMs,
        run(store) {
          store.setPlaying(false)
        },
        caption(ctx: DemoStepContext) {
          return appendDemoDataNotice(VIDEO_END_CARD_TITLE, ctx.isSynthetic)
        },
      }
    }
    return {
      ...baseStep,
      durationMs,
    }
  })
}
