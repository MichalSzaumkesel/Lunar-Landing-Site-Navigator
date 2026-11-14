// Pure definitions and helpers for demo mode narration steps.
import { HOUR_MS } from '../../config/dataRange'
import { PRESET_APOLLO_VS_ARTEMIS, PRESET_SLIP, type Preset } from '../../config/presets'
import type { SectionKey } from '../../lib/disclosure'
import type { SkyEvent } from '../../lib/events'
import type { ScenarioMetrics, SiteBundle } from '../../lib/types'
import { scenarioWindowMs } from '../../state/selectors'
import type { AppStore, Scenario } from '../../state/types'
import { formatDuration } from '../scenario/cardLogic'
import { fmtHours } from '../sky/geometry'
import { triggerDemoCameraPan } from './cameraControl'
import { useDemoStore } from './demoState'

const MENU_OPEN_MS = 250
const MENU_HIGHLIGHT_MS = 600

/** Shows the Add scenario menu opening and the preset highlighted, then applies it through the store. */
export function showPresetChoice(store: AppStore, preset: Preset): void {
  const apply = () => store.applyPreset(preset, { autoplay: false })
  const toggle =
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLButtonElement>('[data-demo="add-menu-toggle"]')
  if (!toggle) {
    apply()
    return
  }
  const stillRunning = () => useDemoStore.getState().isActive
  if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click()
  setTimeout(() => {
    if (!stillRunning()) return
    const item = document.querySelector<HTMLElement>(`[role="menu"] [data-preset="${preset.id}"]`)
    item?.setAttribute('data-demo-highlight', 'true')
    item?.focus()
    setTimeout(() => {
      if (stillRunning()) apply()
      if (toggle.getAttribute('aria-expanded') === 'true') toggle.click()
    }, MENU_HIGHLIGHT_MS)
  }, MENU_OPEN_MS)
}

export interface DemoStepContext {
  scenarios: readonly Scenario[]
  bundles: readonly (SiteBundle | null)[]
  metrics: readonly (ScenarioMetrics | null)[]
  events: readonly (SkyEvent[] | null)[]
  isSynthetic?: boolean
}

export interface DemoStep {
  id: string
  durationMs: number
  /** Opens the sky loupe on the active card while this step is shown. */
  showLoupe?: boolean
  /** Sections that hold what the step talks about; opened while it is shown. */
  reveal?: readonly SectionKey[]
  run(store: AppStore, ctx?: DemoStepContext): void
  caption(ctx: DemoStepContext): string
}

/** Appends the required (demo data) badge when a scenario bundle is synthetic. */
export function appendDemoDataNotice(text: string, isSynthetic?: boolean): string {
  if (!isSynthetic) return text
  if (text.endsWith('(demo data)')) return text
  return `${text} (demo data)`
}

/** Formats hours with one decimal and a unit, e.g. "24.0 h". */
export function formatHoursWithUnit(hours: number): string {
  return fmtHours(hours)
}

/** Formats a percentage taken from the app's own metrics, one decimal, e.g. "6.8 %". */
export function formatPercent(pct: number): string {
  return `${pct.toFixed(1)} %`
}

/** Finds cursor offset in hours from window start to the first sunset event. */
export function findFirstSunsetH(
  scenario?: Scenario,
  events?: readonly SkyEvent[] | null,
): number | null {
  if (!scenario || !events || events.length === 0) return null
  const { startMs, endMs } = scenarioWindowMs(scenario)
  const firstSunset = events.find((e) => e.kind === 'sunset' && e.ms >= startMs && e.ms <= endMs)
  if (!firstSunset) return null
  return Math.max(0, (firstSunset.ms - startMs) / HOUR_MS)
}

/** The step 3 cursor sits this long before the sunset, so the card shows a countdown, not zero. */
export const SUNSET_LEAD_H = 2

/** Cursor offset in hours for step 3: SUNSET_LEAD_H before the first sunset, never before window start. */
export function findSunsetCursorH(
  scenario?: Scenario,
  events?: readonly SkyEvent[] | null,
): number | null {
  const sunsetH = findFirstSunsetH(scenario, events)
  return sunsetH === null ? null : Math.max(0, sunsetH - SUNSET_LEAD_H)
}

/** Step 1 caption: names both sites from the scenario data. */
export function formatStep1Caption(ctx: DemoStepContext): string {
  const site1 = ctx.bundles[0]?.site.name ?? ctx.scenarios[0]?.siteId ?? 'Apollo 11'
  const site2 = ctx.bundles[1]?.site.name ?? ctx.scenarios[1]?.siteId ?? 'Artemis candidate region'
  return appendDemoDataNotice(
    `Comparing ${site1} and ${site2} under identical dates.`,
    ctx.isSynthetic,
  )
}

/** Step 2 caption: "Sun and Earth over the local horizon". */
export function formatStep2Caption(ctx: DemoStepContext): string {
  return appendDemoDataNotice('Sun and Earth over the local horizon', ctx.isSynthetic)
}

/** Step 3 caption: states the hours until sunset from countdown logic. */
export function formatStep3Caption(ctx: DemoStepContext): string {
  const siteName = ctx.bundles[1]?.site.name ?? ctx.scenarios[1]?.siteId ?? 'Artemis candidate region'
  const scenario = ctx.scenarios[1]
  const events = ctx.events[1]

  if (scenario && events && events.length > 0) {
    const { startMs, endMs } = scenarioWindowMs(scenario)
    const firstSunset = events.find((e) => e.kind === 'sunset' && e.ms >= startMs && e.ms <= endMs)
    if (firstSunset) {
      // Same reference as the card countdown: the cursor position set by step 3.
      const cursorMs = startMs + (findSunsetCursorH(scenario, events) ?? 0) * HOUR_MS
      const hoursUntil = Math.max(0, (firstSunset.ms - cursorMs) / HOUR_MS)
      const countdownText =
        hoursUntil * 60 < 1 ? 'less than a minute' : formatDuration(hoursUntil)
      return appendDemoDataNotice(`${siteName}: Sun sets in ${countdownText}.`, ctx.isSynthetic)
    }
    return appendDemoDataNotice(`${siteName}: No sunset in selected window.`, ctx.isSynthetic)
  }

  return appendDemoDataNotice(`${siteName}: No sunset data for this window.`, ctx.isSynthetic)
}

/** Step 4 caption: Sun visible and Earth in view of the two cards, as shown on them. */
export function formatStep4Caption(
  scenarios: readonly Scenario[],
  metrics: readonly (ScenarioMetrics | null)[],
  isSynthetic?: boolean,
): string {
  const s1 = scenarios[0]
  const s2 = scenarios[1]
  const m1 = metrics[0]
  const m2 = metrics[1]

  if (!s1 || !s2 || !m1 || !m2) {
    return appendDemoDataNotice('Metrics unavailable for selected date range.', isSynthetic)
  }

  return appendDemoDataNotice(
    `Sun visible: ${formatPercent(m1.pct_sunlit)} vs ${formatPercent(m2.pct_sunlit)}; Earth in view: ${formatPercent(m1.pct_earth)} vs ${formatPercent(m2.pct_earth)}.`,
    isSynthetic,
  )
}

/** Step 5 caption: Sun visible before and after the 14-day slip. */
export function formatStep5Caption(
  scenarios: readonly Scenario[],
  metrics: readonly (ScenarioMetrics | null)[],
  isSynthetic?: boolean,
): string {
  const s1 = scenarios[0]
  const s2 = scenarios[1]
  const m1 = metrics[0]
  const m2 = metrics[1]

  if (!s1 || !s2 || !m1 || !m2) {
    return appendDemoDataNotice('Metrics unavailable for selected date range.', isSynthetic)
  }

  return appendDemoDataNotice(
    `Same site, 14 days later: Sun visible changes from ${formatPercent(m1.pct_sunlit)} to ${formatPercent(m2.pct_sunlit)}.`,
    isSynthetic,
  )
}

/** Step 6 caption: concluding end card before looping. */
export function formatStep6Caption(ctx: DemoStepContext): string {
  return appendDemoDataNotice(
    'Demo complete. Press Esc or click Stop demo to explore freely.',
    ctx.isSynthetic,
  )
}

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: 'step-1-apollo-vs-artemis',
    durationMs: 6000,
    run(store) {
      store.setMode('advanced')
      store.setCursorH(0)
      store.setPlaying(false)
      // Wait a tick so the Advanced toolbar (and its menu) is mounted before the menu is shown.
      setTimeout(() => showPresetChoice(store, PRESET_APOLLO_VS_ARTEMIS), 50)
    },
    caption(ctx) {
      return formatStep1Caption(ctx)
    },
  },
  {
    id: 'step-2-play-timeline',
    reveal: ['timeline'],
    durationMs: 7000,
    run(store, ctx) {
      store.setCursorH(0)
      store.setPlaying(true)
      triggerDemoCameraPan(ctx, 7000)
    },
    caption(ctx) {
      return formatStep2Caption(ctx)
    },
  },
  {
    id: 'step-3-sunset-countdown',
    durationMs: 6000,
    showLoupe: true,
    run(store, ctx) {
      store.setPlaying(false)
      if (typeof document !== 'undefined') {
        const polarTab = document.querySelector<HTMLButtonElement>('[role="tab"][id$="-tab-polar"]')
        if (polarTab && polarTab.getAttribute('aria-selected') !== 'true') {
          polarTab.click()
        }
      }
      if (ctx && ctx.scenarios[1] && ctx.events[1]) {
        const cursorH = findSunsetCursorH(ctx.scenarios[1], ctx.events[1])
        if (cursorH !== null) {
          store.setActiveScenario(ctx.scenarios[1].id)
          store.setCursorH(cursorH)
          return
        }
      }
    },
    caption(ctx) {
      return formatStep3Caption(ctx)
    },
  },
  {
    id: 'step-4-metrics-diff',
    reveal: ['metrics'],
    durationMs: 6000,
    run(store) {
      store.setPlaying(false)
    },
    caption(ctx) {
      return formatStep4Caption(ctx.scenarios, ctx.metrics, ctx.isSynthetic)
    },
  },
  {
    id: 'step-5-slip-preset',
    reveal: ['dates'],
    durationMs: 6000,
    run(store) {
      store.applyPreset(PRESET_SLIP, { autoplay: false })
      store.setMode('advanced')
      store.setCursorH(0)
      store.setPlaying(false)
    },
    caption(ctx) {
      return formatStep5Caption(ctx.scenarios, ctx.metrics, ctx.isSynthetic)
    },
  },
  {
    id: 'step-6-end-card',
    durationMs: 5000,
    run(store) {
      store.setPlaying(false)
    },
    caption(ctx) {
      return formatStep6Caption(ctx)
    },
  },
]
