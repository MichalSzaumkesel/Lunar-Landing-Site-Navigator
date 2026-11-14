import type { MissionRules, ObserverHeightM } from '../lib/types'
import type { Preset } from '../config/presets'

/**
 * Interface level. `simple`: plain language, few controls, one guided scenario (uses scope A's explore texts).
 * `advanced`: every tool (several scenarios, slip, observer height, finder, window map, 3D).
 * Replaces the earlier Planner/Explore split in docs/scope-B-web.md (same idea, clearer names).
 */
export type Mode = 'simple' | 'advanced'

/** One site + date card. The effective window is startUtc + slipDays, lasting durationH. */
export interface Scenario {
  id: string
  siteId: string
  /** Window start before slip, UTC ISO 8601 with Z. */
  startUtc: string
  durationH: number
  /** Slip in days, whole numbers within +-MAX_SLIP_DAYS. */
  slipDays: number
}

export interface AppState {
  mode: Mode
  observerHeightM: ObserverHeightM
  scenarios: Scenario[]
  activeScenarioId: string
  /**
   * Time cursor in hours from the start of each scenario's effective window. All cards share it,
   * so they animate in lockstep (cards with different dates stay comparable).
   */
  cursorH: number
  playing: boolean
  speedHPerSec: number
  /**
   * Mission rules of the window finder and window map. `observerHeightM` inside is ignored:
   * consumers pass `{ ...missionRules, observerHeightM: state.observerHeightM }`.
   */
  missionRules: MissionRules
}

export interface AppActions {
  setMode(mode: Mode): void
  setObserverHeight(h: ObserverHeightM): void
  setMissionRules(patch: Partial<MissionRules>): void
  /** Returns the new scenario id, or null when MAX_SCENARIOS is reached. */
  addScenario(input: { siteId: string } & Partial<Omit<Scenario, 'id' | 'siteId'>>): string | null
  /** The last remaining scenario cannot be removed. */
  removeScenario(id: string): void
  updateScenario(id: string, patch: Partial<Omit<Scenario, 'id'>>): void
  setSlipDays(id: string, days: number): void
  setActiveScenario(id: string): void
  setCursorH(h: number): void
  setPlaying(playing: boolean): void
  togglePlaying(): void
  setSpeed(hPerSec: number): void
  /** Called by the playback loop with the elapsed real seconds. */
  tick(dtSec: number): void
  applyPreset(preset: Preset, opts?: { autoplay?: boolean }): void
}

export type AppStore = AppState & AppActions
