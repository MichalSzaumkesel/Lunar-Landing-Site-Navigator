// Pure definitions and helpers for demo mode narration steps.
import { HOUR_MS } from '../../config/dataRange'
import { PRESET_APOLLO_VS_ARTEMIS, PRESET_SLIP } from '../../config/presets'
import type { SkyEvent } from '../../lib/events'
import type { ScenarioMetrics, SiteBundle } from '../../lib/types'
import { scenarioWindowMs } from '../../state/selectors'
import type { AppStore, Scenario } from '../../state/types'
import { formatDuration } from '../scenario/cardLogic'

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
  run(store: AppStore, ctx?: DemoStepContext): void
  caption(ctx: DemoStepContext): string
}

/** Appends the required (demo data) badge when a scenario bundle is synthetic. */
export function appendDemoDataNotice(text: string, isSynthetic?: boolean): string {
  if (!isSynthetic) return text
  if (text.endsWith('(demo data)')) return text
  return `${text} (demo data)`
}

/** Formats whole hours or 1 decimal place with unit. */
export function formatHoursWithUnit(hours: number): string {
  const norm = Object.is(hours, -0) ? 0 : hours
  return Number.isInteger(norm) ? `${norm} h` : `${norm.toFixed(1)} h`
}

/** Finds cursor offset in hours from window start to the first sunset event. */
export function findFirstSunsetH(
  scenario?: Scenario,
  events?: readonly SkyEvent[] | null,
): number | null {
  if (!scenario || !events || events.length === 0) return null
  const firstSunset = events.find((e) => e.kind === 'sunset')
  if (!firstSunset) return null
  const { startMs } = scenarioWindowMs(scenario)
  return Math.max(0, (firstSunset.ms - startMs) / HOUR_MS)
}

/** Step 1 caption: names both sites from the scenario data. */
export function formatStep1Caption(ctx: DemoStepContext): string {
  const site1 = ctx.bundles[0]?.site.name ?? ctx.scenarios[0]?.siteId ?? 'Apollo 11'
  const site2 = ctx.bundles[1]?.site.name ?? ctx.scenarios[1]?.siteId ?? 'Artemis region'
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
  const siteName = ctx.bundles[1]?.site.name ?? ctx.scenarios[1]?.siteId ?? 'Artemis region'
  const scenario = ctx.scenarios[1]
  const events = ctx.events[1]

  if (scenario && events && events.length > 0) {
    const firstSunset = events.find((e) => e.kind === 'sunset')
    if (firstSunset) {
      const { startMs } = scenarioWindowMs(scenario)
      const hoursUntil = Math.max(0, (firstSunset.ms - startMs) / HOUR_MS)
      const countdownText = formatDuration(hoursUntil)
      return appendDemoDataNotice(`${siteName}: Sun sets in ${countdownText}.`, ctx.isSynthetic)
    }
    return appendDemoDataNotice(`${siteName}: Sun below horizon in data range.`, ctx.isSynthetic)
  }

  return appendDemoDataNotice(`${siteName}: Sun sets in 18 h.`, ctx.isSynthetic)
}

/** Step 4 caption: metrics difference between the two cards. */
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
    return appendDemoDataNotice('Sun visible and Earth in view comparison loading...', isSynthetic)
  }

  const sunH1 = (m1.pct_sunlit / 100) * s1.durationH
  const sunH2 = (m2.pct_sunlit / 100) * s2.durationH
  const sunDiff = Math.abs(sunH1 - sunH2)

  const earthH1 = (m1.pct_earth / 100) * s1.durationH
  const earthH2 = (m2.pct_earth / 100) * s2.durationH
  const earthDiff = Math.abs(earthH1 - earthH2)

  return appendDemoDataNotice(
    `Sun visible: ${formatHoursWithUnit(sunH1)} vs ${formatHoursWithUnit(sunH2)} (${formatHoursWithUnit(sunDiff)} diff); Earth in view: ${formatHoursWithUnit(earthH1)} vs ${formatHoursWithUnit(earthH2)} (${formatHoursWithUnit(earthDiff)} diff).`,
    isSynthetic,
  )
}

/** Step 5 caption: change in Sun-visible hours from the slip preset. */
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
    return appendDemoDataNotice(
      'Same site, 14 days later: calculating Sun visible change...',
      isSynthetic,
    )
  }

  const sunH1 = (m1.pct_sunlit / 100) * s1.durationH
  const sunH2 = (m2.pct_sunlit / 100) * s2.durationH
  const delta = sunH2 - sunH1
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  const absDelta = Math.abs(delta)

  return appendDemoDataNotice(
    `Same site, 14 days later: Sun visible changes by ${sign}${formatHoursWithUnit(absDelta)} (${formatHoursWithUnit(sunH1)} vs ${formatHoursWithUnit(sunH2)}).`,
    isSynthetic,
  )
}

/** Step 6 caption: concluding end card before looping. */
export function formatStep6Caption(ctx: DemoStepContext): string {
  return appendDemoDataNotice(
    'Tour complete. Press Esc or click Stop demo to explore freely.',
    ctx.isSynthetic,
  )
}

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: 'step-1-apollo-vs-artemis',
    durationMs: 6000,
    run(store) {
      store.applyPreset(PRESET_APOLLO_VS_ARTEMIS, { autoplay: false })
      store.setMode('advanced')
      store.setCursorH(0)
      store.setPlaying(false)
    },
    caption(ctx) {
      return formatStep1Caption(ctx)
    },
  },
  {
    id: 'step-2-play-timeline',
    durationMs: 7000,
    run(store) {
      store.setCursorH(0)
      store.setPlaying(true)
    },
    caption(ctx) {
      return formatStep2Caption(ctx)
    },
  },
  {
    id: 'step-3-sunset-countdown',
    durationMs: 6000,
    run(store, ctx) {
      store.setPlaying(false)
      if (ctx && ctx.scenarios[1] && ctx.events[1]) {
        const sunsetH = findFirstSunsetH(ctx.scenarios[1], ctx.events[1])
        if (sunsetH !== null) {
          store.setCursorH(sunsetH)
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
