# Task W1a: Earth phase and sky events (pure TypeScript + tests)

## Goal

Two small pure modules used by the sky plot and the timeline: the lit fraction of Earth as seen from the Moon, and the list of sunset, sunrise, Earthset and Earthrise events inside a time window.

## Writable paths

`src/lib/earthPhase.ts`, `src/lib/earthPhase.test.ts`, `src/lib/events.ts`, `src/lib/events.test.ts`

## Read-only references

`src/lib/types.ts`, `src/lib/ephem.ts` (`SkyPosition`, `ephemCoverage`, `sampleAt`), `src/lib/horizon.ts` (`horizonAt`), `src/lib/metrics.ts` (same transition definition, `next_*` fields; read how it interpolates).

## Spec

### `src/lib/earthPhase.ts`

```ts
export function angularSeparationDeg(a: SkyPosition, b: SkyPosition): number
export function earthIlluminatedFraction(sun: SkyPosition, earth: SkyPosition): number   // 0..1
export type EarthPhaseName = 'new' | 'crescent' | 'half' | 'gibbous' | 'full'
export function earthPhaseName(fraction: number): EarthPhaseName
export function brightLimbDirection(earth: SkyPosition, sun: SkyPosition): [number, number, number]
```

- Directions are unit vectors in the local frame: `(sin az * cos el, cos az * cos el, sin el)` as (east, north, up). `angularSeparationDeg` is the angle between the two vectors in degrees (clamp the dot product into [-1, 1]).
- Seen from the Moon the Earth's phase angle is 180 degrees minus the Sun-Earth separation `e`, so the lit fraction is `(1 - cos e) / 2`. Check: Sun and Earth in opposite directions (`e = 180`) gives 1 (full Earth, which happens at new Moon seen from Earth); the same direction (`e = 0`) gives 0.
- `earthPhaseName`: `< 0.05` new, `< 0.45` crescent, `<= 0.55` half, `< 0.95` gibbous, otherwise full.
- `brightLimbDirection`: unit vector (east, north, up) pointing from the Earth's centre towards the lit limb: the Sun direction with its component along the Earth direction removed, normalised. If the result is degenerate (Sun and Earth collinear) return `[0, 0, 0]`.

### `src/lib/events.ts`

```ts
export type SkyEventKind = 'sunset' | 'sunrise' | 'earthset' | 'earthrise'
export interface SkyEvent { kind: SkyEventKind; ms: number; utc: string }
export interface SkyStretch { kind: 'longest_dark' | 'longest_no_earth'; startMs: number; endMs: number; hours: number }
export function listSkyEvents(bundle: Pick<SiteBundle, 'horizon' | 'ephem'>, observerHeightM: ObserverHeightM, startMs: number, endMs: number): SkyEvent[]
export function longestStretches(bundle: Pick<SiteBundle, 'horizon' | 'ephem'>, observerHeightM: ObserverHeightM, startMs: number, endMs: number): SkyStretch[]
```

- Clearance and state definitions are those of `src/lib/metrics.ts`: `clear = el - horizonAt(mask, az_step_deg, az)`, the body counts as above the horizon when `clear >= 0`; mask `horizon.masks[String(observerHeightM)]` (fall back to `masks['2']`, then a flat 0 mask).
- `listSkyEvents`: every transition between consecutive hourly samples whose interpolated time lies in `[startMs, endMs)`. Time by linear interpolation of `clear` between the two samples (`t = t_k + clear_k / (clear_k - clear_{k+1}) * step`), like `metrics.ts`. Sunset and Earthset are true to false, sunrise and Earthrise false to true. `utc` is ISO 8601 with a trailing `Z`, no milliseconds, rounded to the second. Sorted by time. Only samples inside the data coverage are used.
- `longestStretches`: among the samples with sample time in `[startMs, endMs)`, the longest run of consecutive Sun-below-horizon samples (`longest_dark`) and the longest run of consecutive Earth-below-horizon samples (`longest_no_earth`). `startMs` is the first sample of the run, `endMs` is the sample time after the last sample of the run, `hours = (endMs - startMs) / 3600000`. Omit a stretch kind when no such run exists. First longest wins ties.
- Performance: one pass over at most 18300 samples, no per-sample object allocation.

## Tests

- `earthPhase`: separation of identical directions is 0 and of opposite directions 180; fractions 1 (opposite), 0 (same), 0.5 (90 degrees apart); phase name thresholds at the boundaries; `brightLimbDirection` for Earth at the zenith and Sun on the eastern horizon gives `(1, 0, 0)`; degenerate input gives zeros.
- `events`: hand-built tiny ephemeris and flat mask (set by hand, 12 to 30 samples) with one sunset between two samples at a known interpolated time, one sunrise, an Earth that never sets (no Earth events), window boundaries (an event exactly at `endMs` is excluded), the 10 m mask being used. A regression test on the real mock files `public/data/mock/horizon|ephem/<id>.json` (read with `node:fs`): over the **full coverage** with observer height 2, the number of `sunset` events is 26 for `apollo_11`, 97 for `southpole_landed` and 50 for `artemis_region_1`; for `apollo_11` there are no Earth events. The first sunset after `2027-08-30T00:00:00Z` from `listSkyEvents` equals `computeMetrics(...).next_sunset_utc` for the same bundle (use `refMs` and a window from that time). `longestStretches` over the full coverage for `southpole_landed` returns a `longest_dark` whose `hours` is at least 24 (sanity), and `computeMetrics` over the same window reports the same `longest_dark_h`.

## Acceptance

`npm run typecheck` exits 0; `npx vitest run src/lib/earthPhase src/lib/events` exits 0. Report test counts and the three sunset counts you measured.
