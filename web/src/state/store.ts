import { create } from 'zustand'
import { MAX_SCENARIOS, MAX_SLIP_DAYS } from '../config/dataRange'
import {
  DEFAULT_DURATION_H,
  DEFAULT_PRESET,
  DEFAULT_SPEED_H_PER_SEC,
  DEFAULT_START_UTC,
  type Preset,
  type PresetScenario,
} from '../config/presets'
import type { AppStore, Scenario } from './types'

let counter = 0
const newId = () => `sc${++counter}`

function toScenario(p: PresetScenario): Scenario {
  const durationH =
    p.durationH !== undefined && Number.isFinite(p.durationH)
      ? Math.max(1, p.durationH)
      : DEFAULT_DURATION_H
  return {
    id: newId(),
    siteId: p.siteId,
    startUtc: p.startUtc ?? DEFAULT_START_UTC,
    durationH,
    slipDays: clampSlip(p.slipDays ?? 0),
  }
}

function clampSlip(days: number): number {
  if (!Number.isFinite(days)) return 0
  return Math.max(-MAX_SLIP_DAYS, Math.min(MAX_SLIP_DAYS, Math.round(days)))
}

const initialScenarios = DEFAULT_PRESET.scenarios.map(toScenario)

export const useAppStore = create<AppStore>()((set, get) => ({
  mode: 'advanced', // the demo shows everything; the tour offers Simple to newcomers
  observerHeightM: 2,
  scenarios: initialScenarios,
  activeScenarioId: initialScenarios[0].id,
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

  setMode: (mode) => set({ mode }),
  setObserverHeight: (observerHeightM) => set({ observerHeightM }),
  setMissionRules: (patch) => set((s) => ({ missionRules: { ...s.missionRules, ...patch } })),

  addScenario: (input) => {
    if (get().scenarios.length >= MAX_SCENARIOS) return null
    const scenario = toScenario(input)
    set((s) => ({ scenarios: [...s.scenarios, scenario], activeScenarioId: scenario.id }))
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
  setCursorH: (h) => set({ cursorH: Math.max(0, h) }),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speedHPerSec) => set({ speedHPerSec }),

  tick: (dtSec) =>
    set((s) => {
      if (!s.playing) return s
      // Loop at the shortest window so every card always has the cursor inside its range.
      const durations = s.scenarios.map((x) =>
        Math.max(1, Number.isFinite(x.durationH) ? x.durationH : 1),
      )
      const minDuration = durations.length > 0 ? Math.min(...durations) : 1
      const loopH = Math.max(1, minDuration)
      const next = s.cursorH + dtSec * s.speedHPerSec
      return { cursorH: next >= loopH ? next % loopH : next }
    }),

  applyPreset: (preset: Preset, opts) => {
    const scenarios = preset.scenarios.map(toScenario)
    set({
      scenarios,
      activeScenarioId: scenarios[0].id,
      cursorH: 0,
      playing: opts?.autoplay ?? false,
    })
  },
}))
