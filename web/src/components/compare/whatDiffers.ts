// Builds the neutral "what differs" sentence above the Compare table.
// It states differences in Sun visible, Earth in view and the longest gaps. It never says which
// scenario is better and never mentions power, energy or links.
import { formatDay, formatSpan, formatWindowPlain } from '../simple/simpleSummary'
import { scenarioWindowMs } from '../../state/selectors'
import type { ScenarioCompareData } from './compareLogic'

export interface DiffSide {
  /** Name used in the sentence, for example the site name. */
  label: string
  pctSun: number | null
  longestDarkH: number | null
  pctEarth: number | null
  longestNoEarthH: number | null
}

export interface DiffInput {
  a: DiffSide
  b: DiffSide
  /** True when either side uses demo data. */
  synthetic?: boolean
}

type Dir = 'same' | 'more' | 'less'

const finite = (v: number | null): v is number => v !== null && Number.isFinite(v)

/** Points (whole percentage points) between two shares; "same" when they round to the same value. */
function pointsDiff(a: number, b: number): { dir: Dir; text: string } {
  const pts = Math.round(Math.abs(b - a))
  if (pts === 0) return { dir: 'same', text: '' }
  return { dir: b > a ? 'more' : 'less', text: `${pts} ${pts === 1 ? 'point' : 'points'}` }
}

/** Difference of two stretches in hours; "same" under 1 h once rounded. */
function stretchDiff(a: number, b: number): { dir: Dir; text: string } {
  const h = Math.round(Math.abs(b - a))
  if (h === 0) return { dir: 'same', text: '' }
  return { dir: b > a ? 'more' : 'less', text: formatSpan(h) }
}

/**
 * One sentence for one body: share of the window and longest gap of B relative to A.
 * `shareNoun` is "Sun visible" or "Earth in view"; `gapNoun` is "dark stretch" or "stretch without Earth".
 */
function bodySentence(
  a: DiffSide,
  b: DiffSide,
  aShare: number | null,
  bShare: number | null,
  aGap: number | null,
  bGap: number | null,
  shareNoun: string,
  gapNoun: string,
  named: boolean,
): string | null {
  const share = finite(aShare) && finite(bShare) ? pointsDiff(aShare, bShare) : null
  const gap = finite(aGap) && finite(bGap) ? stretchDiff(aGap, bGap) : null
  if (!share && !gap) return null

  // Later sentences say "It" instead of repeating a long site name.
  const subj = named ? b.label : 'It'
  const shareWord = (d: Dir) => (d === 'more' ? 'more' : 'less')
  const gapWord = (d: Dir) => (d === 'more' ? 'longer' : 'shorter')

  if (share && gap) {
    if (share.dir === 'same' && gap.dir === 'same') {
      return named
        ? `${b.label} and ${a.label} have about the same ${shareNoun} and ${gapNoun}.`
        : `They have about the same ${shareNoun} and ${gapNoun}.`
    }
    if (share.dir === 'same') {
      return `${subj} has about the same ${shareNoun} as ${a.label}, with a ${gapNoun} ${gap.text} ${gapWord(gap.dir)}.`
    }
    if (gap.dir === 'same') {
      return `${subj} has ${share.text} ${shareWord(share.dir)} ${shareNoun} than ${a.label}, with a similar ${gapNoun}.`
    }
    return `${subj} has ${share.text} ${shareWord(share.dir)} ${shareNoun} and a ${gapNoun} ${gap.text} ${gapWord(gap.dir)} than ${a.label}.`
  }
  if (share) {
    return share.dir === 'same'
      ? `${subj} has about the same ${shareNoun} as ${a.label}.`
      : `${subj} has ${share.text} ${shareWord(share.dir)} ${shareNoun} than ${a.label}.`
  }
  // Only the gap is known.
  return gap!.dir === 'same'
    ? `${subj} has a similar ${gapNoun} to ${a.label}.`
    : `${subj} has a ${gapNoun} ${gap!.text} ${gapWord(gap!.dir)} than ${a.label}.`
}

/**
 * Neutral plain-English comparison of scenario B against scenario A, or null when nothing can be said
 * (values missing for both bodies). Sun first, then Earth; demo data is flagged at the end.
 */
export function whatDiffersSentence(input: DiffInput): string | null {
  const { a, b } = input
  const sun = bodySentence(a, b, a.pctSun, b.pctSun, a.longestDarkH, b.longestDarkH, 'Sun visible', 'dark stretch', true)
  const earth = bodySentence(
    a,
    b,
    a.pctEarth,
    b.pctEarth,
    a.longestNoEarthH,
    b.longestNoEarthH,
    'Earth in view',
    'stretch without Earth',
    sun === null,
  )
  const parts = [sun, earth].filter((p): p is string => p !== null)
  if (parts.length === 0) return null
  if (input.synthetic) parts.push('Based on demo data.')
  return parts.join(' ')
}

function baseLabel(d: ScenarioCompareData): string {
  return d.bundle?.site.name ?? d.scenario.siteId
}

/** Names for two scenarios; when the sites match, the window tells them apart. */
export function diffLabels(a: ScenarioCompareData, b: ScenarioCompareData): [string, string] {
  const la = baseLabel(a)
  const lb = baseLabel(b)
  if (la !== lb) return [la, lb]
  const wa = scenarioWindowMs(a.scenario)
  const wb = scenarioWindowMs(b.scenario)
  const sa = `${la} (${formatWindowPlain(wa.startMs, wa.endMs)})`
  const sb = `${lb} (${formatWindowPlain(wb.startMs, wb.endMs)})`
  if (sa !== sb) return [sa, sb]
  return [`${la} (${formatDay(a.scenario.startUtc)}, first)`, `${lb} (${formatDay(b.scenario.startUtc)}, second)`]
}

/**
 * The pair to describe: the active scenario against the first other one, or the first two scenarios
 * when none is active. Null with fewer than two ready scenarios.
 */
export function pickDiffPair(
  data: readonly ScenarioCompareData[],
  activeId: string | null,
): [ScenarioCompareData, ScenarioCompareData] | null {
  if (data.length < 2) return null
  const active = data.find((d) => d.scenario.id === activeId)
  const a = active ?? data[0]
  const b = data.find((d) => d !== a)
  return b ? [a, b] : null
}

/** The sentence for a pair of computed scenarios, or null when either is not ready. */
export function whatDiffersFor(a: ScenarioCompareData, b: ScenarioCompareData): string | null {
  if (a.status !== 'ready' || b.status !== 'ready') return null
  const [la, lb] = diffLabels(a, b)
  const side = (d: ScenarioCompareData, label: string): DiffSide => ({
    label,
    pctSun: d.values.pct_sunlit,
    longestDarkH: d.values.longest_dark_h,
    pctEarth: d.values.pct_earth,
    longestNoEarthH: d.values.longest_no_earth_h,
  })
  return whatDiffersSentence({
    a: side(a, la),
    b: side(b, lb),
    synthetic: Boolean(a.bundle?.synthetic || b.bundle?.synthetic),
  })
}
