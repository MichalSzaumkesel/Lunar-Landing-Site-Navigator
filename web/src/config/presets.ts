// Presets. Site ids are the fixed demo ids of contract §2.7; coordinates always come from sites.json.
import { DAY_MS } from './dataRange'

export interface PresetScenario {
  siteId: string
  startUtc?: string
  durationH?: number
  slipDays?: number
}

export interface Preset {
  id: string
  label: string
  description: string
  scenarios: PresetScenario[]
}

/**
 * Default window start for demo scenarios, inside the data coverage. Chosen by scanning the real
 * files (observer height 2 m, 30-day windows, daily starts): at this date the Sun is visible 52% of the
 * time at southpole_landed and 32% at artemis_region_1, the disc is cut by the ridge several times, and
 * Earth is in view 85% and 66% of the time. Apollo 11 gets a normal day/night cycle in the same window.
 * Re-scan when the data changes.
 */
export const DEFAULT_START_UTC = '2027-10-06T00:00:00Z'
/**
 * Simple mode opens here instead of at DEFAULT_START_UTC (which starts in the dark at southpole_landed).
 * Chosen by scanning the real files (2 m, 30-day windows, daily starts, all candidate sites): at the first
 * instant the Sun is visible and Earth is in view, the Sun is visible 47.5% and Earth in view 77.2% of the
 * window, the Sun sets after 51 h and Earth sets after 35 h. Re-scan when the data changes.
 */
export const SIMPLE_DEFAULT_START_UTC = '2027-01-26T00:00:00Z'
/** One lunar day is about 29.5 Earth days; a 30-day window shows a full Sun circuit. */
export const DEFAULT_DURATION_H = 30 * 24

export const PRESET_SOUTH_POLE: Preset = {
  id: 'south_pole',
  label: 'South pole',
  description: 'One south-pole site with a jagged horizon.',
  scenarios: [{ siteId: 'southpole_landed' }],
}

export const PRESET_APOLLO_VS_ARTEMIS: Preset = {
  id: 'apollo11_vs_artemis',
  label: 'Apollo 11 vs South Pole',
  description: 'Two cards with the same dates: the Sun high at the equator versus skimming the south pole horizon.',
  scenarios: [{ siteId: 'apollo_11' }, { siteId: 'artemis_region_1' }],
}

/** Slip preset window: 14 days from 2027-01-01; its 6.8 % and 94.0 % Sun visible are pinned in realData.test.ts. */
const SLIP_START_UTC = '2027-01-01T00:00:00Z'
const SLIP_DURATION_H = 336

export const PRESET_SLIP: Preset = {
  id: 'same_site_slip',
  label: 'Same site, 14 days later',
  description: 'The same site with the window slipped by two weeks.',
  scenarios: [
    { siteId: 'southpole_landed', startUtc: SLIP_START_UTC, durationH: SLIP_DURATION_H },
    { siteId: 'southpole_landed', startUtc: SLIP_START_UTC, durationH: SLIP_DURATION_H, slipDays: 14 },
  ],
}

export const PRESETS: Preset[] = [PRESET_APOLLO_VS_ARTEMIS, PRESET_SOUTH_POLE, PRESET_SLIP]

/** The app opens straight into a south-pole scenario. */
export const DEFAULT_PRESET = PRESET_SOUTH_POLE

export const DEFAULT_SPEED_H_PER_SEC = 12
export const SPEEDS_H_PER_SEC = [1, 6, 12, 24, 72, 168] as const

export { DAY_MS }
