import { create } from 'zustand'
import { MAX_SCENARIOS, MAX_SLIP_DAYS } from '../config/dataRange'
import {
  DEFAULT_DURATION_H,
  DEFAULT_PRESET,
  DEFAULT_SPEED_H_PER_SEC,
  DEFAULT_START_UTC,
  SIMPLE_DEFAULT_START_UTC,
  type Preset,
  type PresetScenario,
} from '../config/presets'
import type { AppStore, Scenario } from './types'

function clampSlip(days: number): number {
  if (!Number.isFinite(days)) return 0
  return Math.max(-MAX_SLIP_DAYS, Math.min(MAX_SLIP_DAYS, Math.round(days)))
}

/**
 * Generate a deterministic scenario ID ('sc1', 'sc2', ...) that does not collide
 * with any existing scenario in the list.
 */
export function generateScenarioId(existingScenarios: readonly Scenario[]): string {
  const existing = new Set(existingScenarios.map((s) => s.id))
  let n = 1
  while (existing.has(`sc${n}`)) n++
  return `sc${n}`
}

/**
 * Assign unique non-colliding IDs to a list of preset scenarios.
 */
export function assignScenarioIds(
  items: readonly PresetScenario[],
  existing: readonly Scenario[] = [],
): Scenario[] {
  const used = new Set(existing.map((s) => s.id))
  let n = 1
  return items.map((p) => {
    while (used.has(`sc${n}`)) n++
    const id = `sc${n}`
    used.add(id)
    const durationH =
      p.durationH !== undefined && Number.isFinite(p.durationH)
        ? Math.max(1, p.durationH)
        : DEFAULT_DURATION_H
    return {
      id,
      siteId: p.siteId,
      startUtc: p.startUtc ?? DEFAULT_START_UTC,
      durationH,
      slipDays: clampSlip(p.slipDays ?? 0),
    }
  })
}

/** Swaps the untouched default scenario for the Simple one (a start with both Sun and Earth up); anything else stays. */
export function withSimpleDefault(scenarios: Scenario[]): Scenario[] {
  const base = DEFAULT_PRESET.scenarios[0]
  const [only] = scenarios
  const untouched =
    scenarios.length === 1 &&
    only.siteId === base.siteId &&
    only.startUtc === DEFAULT_START_UTC &&
    only.durationH === DEFAULT_DURATION_H &&
    only.slipDays === 0
  return untouched ? [{ ...only, startUtc: SIMPLE_DEFAULT_START_UTC }] : scenarios
}

const initialScenarios = assignScenarioIds(DEFAULT_PRESET.scenarios)

export const useAppStore = create<AppStore>()((set, get) => ({
  mode: 'simple', // a link without m= opens Simple; the demo switches to Advanced itself and restores the mode on exit
  observerHeightM: 2,
  scenarios: initialScenarios,
  activeScenarioId: initialScenarios[0]?.id ?? '',
  cursorH: 0,
  playing: false,
  speedHPerSec: DEFAULT_SPEED_H_PER_SEC,
  // Example mission: 10 days on the surface, mostly lit, Earth in view at landing.
  missionRules: {
    observerHeightM: 2,
    missionDurationH: 240,
    minPctSunlit: 70,
    maxLongestDarkH: 48,
    earthAtLandingRequired: true,
    minPctEarth: 50,
  },

  setMode: (mode) =>
    set((s) => ({
      mode,
      scenarios:
        mode === 'simple'
          ? withSimpleDefault(s.scenarios.map((sc) => (sc.slipDays !== 0 ? { ...sc, slipDays: 0 } : sc)))
          : s.scenarios,
    })),
  setObserverHeight: (observerHeightM) =>
    set((s) => ({
      observerHeightM,
      missionRules: { ...s.missionRules, observerHeightM },
    })),
  setMissionRules: (patch) => set((s) => ({ missionRules: { ...s.missionRules, ...patch } })),

  addScenario: (input) => {
    const current = get().scenarios
    if (current.length >= MAX_SCENARIOS) return null
    const id = generateScenarioId(current)
    const durationH =
      input.durationH !== undefined && Number.isFinite(input.durationH)
        ? Math.max(1, input.durationH)
        : DEFAULT_DURATION_H
    const scenario: Scenario = {
      id,
      siteId: input.siteId,
      startUtc: input.startUtc ?? DEFAULT_START_UTC,
      durationH,
      slipDays: clampSlip(input.slipDays ?? 0),
    }
    set({ scenarios: [...current, scenario], activeScenarioId: scenario.id })
    return scenario.id
  },

  removeScenario: (id) =>
    set((s) => {
      if (s.scenarios.length <= 1) return s
      const scenarios = s.scenarios.filter((x) => x.id !== id)
      const activeScenarioId = scenarios.some((x) => x.id === s.activeScenarioId)
        ? s.activeScenarioId
        : scenarios[0].id
      return { scenarios, activeScenarioId }
    }),

  updateScenario: (id, patch) =>
    set((s) => ({
      scenarios: s.scenarios.map((x) =>
        x.id === id
          ? {
              ...x,
              ...patch,
              durationH:
                patch.durationH !== undefined
                  ? Math.max(1, Number.isFinite(patch.durationH) ? patch.durationH : 1)
                  : x.durationH,
              slipDays: clampSlip(patch.slipDays ?? x.slipDays),
            }
          : x,
      ),
    })),

  setSlipDays: (id, days) =>
    set((s) => ({
      scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, slipDays: clampSlip(days) } : x)),
    })),

  setActiveScenario: (activeScenarioId) =>
    set((s) =>
      s.scenarios.some((x) => x.id === activeScenarioId)
        ? { activeScenarioId }
        : s,
    ),
  setCursorH: (h) =>
    set((s) => ({
      cursorH: Number.isFinite(h) ? Math.max(0, h) : Number.isFinite(s.cursorH) ? s.cursorH : 0,
    })),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speedHPerSec) => set({ speedHPerSec }),

  tick: (dtSec) =>
    set((s) => {
      if (!s.playing) return s
      // Loop at the shortest window so every card always has the cursor inside its range.
      let minDuration = Infinity
      for (let i = 0; i < s.scenarios.length; i++) {
        const d = s.scenarios[i].durationH
        if (Number.isFinite(d) && d > 0 && d < minDuration) minDuration = d
      }
      const loopH = Number.isFinite(minDuration) ? Math.max(1, minDuration) : 1
      const next = s.cursorH >= loopH ? 0 : s.cursorH + dtSec * s.speedHPerSec
      return { cursorH: next >= loopH ? next % loopH : next }
    }),

  applyPreset: (preset: Preset, opts) => {
    const scenarios = assignScenarioIds(preset.scenarios)
    set({
      scenarios,
      activeScenarioId: scenarios[0]?.id ?? '',
      cursorH: 0,
      playing: opts?.autoplay ?? false,
    })
  },
}))
