# Task B1a: horizon, ephemeris sampling and metrics (pure TypeScript + tests)

You are a worker for the scope B lead of a Vite + React + TypeScript project (working directory: `web/`). Follow this brief exactly. Where it is silent, choose the simplest option and list the choice under OPEN in your final report.

## 1. Goal

Implement three small pure modules the UI builds on, with unit tests. No React, no DOM, no network.

## 2. Writable paths

- `src/lib/horizon.ts`, `src/lib/horizon.test.ts`
- `src/lib/ephem.ts`, `src/lib/ephem.test.ts`
- `src/lib/metrics.ts`, `src/lib/metrics.test.ts`

## 3. Read-only references

- `src/lib/types.ts`: use `EphemFile`, `HorizonFile`, `SiteBundle`, `ScenarioMetrics`, `ObserverHeightM`. Import them with `import type`. Do not redeclare or edit them.
- `../docs/contract.md` section 3 (metric definitions) and section 2.2 / 2.3 (file semantics).
- `tsconfig.app.json` rules apply: `verbatimModuleSyntax`, `erasableSyntaxOnly` (no enums, no parameter properties), `noUnusedLocals`.

## 4. Spec

All angles in degrees in the API. Azimuth is measured from north clockwise. Elevation has no refraction.

### 4.1 `src/lib/horizon.ts`

```ts
export function normalizeAz(azDeg: number): number          // result in [0, 360)
export function horizonAt(mask: readonly number[], azStepDeg: number, azDeg: number): number
```

`horizonAt` interpolates the mask linearly between the two neighbouring samples. Sample `i` is at azimuth `i * azStepDeg`. Wrap around at 360 degrees: the neighbour of the last sample is sample 0. `mask.length` is the number of samples.

### 4.2 `src/lib/ephem.ts`

```ts
export interface SkyPosition { az: number; el: number }
export interface SkySample { sun: SkyPosition; earth: SkyPosition }
export function ephemCoverage(e: Pick<EphemFile, 'start_utc' | 'step_minutes' | 'count'>): { startMs: number; endMs: number }
export function sampleAt(e: EphemFile, ms: number): SkySample | null
```

- Sample `k` is at `start_utc + k * step_minutes`. `endMs` is the time of the last sample (`count - 1`), inclusive.
- `sampleAt` returns `null` when `ms` is outside `[startMs, endMs]`. Otherwise it interpolates linearly in time between the two bracketing samples. Elevation interpolates linearly. Azimuth interpolates along the shortest arc (so 359 and 1 give 0, not 180) and the result is normalised to `[0, 360)`.

### 4.3 `src/lib/metrics.ts`

```ts
export function bodyFraction(clearDeg: number, radiusDeg: number): number
export interface MetricsInput { observerHeightM: ObserverHeightM; startMs: number; endMs: number; refMs?: number }
export function computeMetrics(bundle: Pick<SiteBundle, 'horizon' | 'ephem'>, input: MetricsInput): ScenarioMetrics | null
```

Definitions (from the contract). For a body B (sun or earth) at sample time t:

- `H(az)` is the horizon elevation from `horizon.masks[String(observerHeightM)]` via `horizonAt` with `horizon.az_step_deg`.
- `clear_B(t) = el_B(t) - H(az_B(t))`.
- `r_B` is `sun_ang_radius_deg` or `earth_ang_radius_deg` from the ephemeris file.
- `bodyFraction(clear, r)`: `x = clamp(clear / r, -1, 1)`, result `0.5 + (x * sqrt(1 - x*x) + asin(x)) / PI`. Returns a fraction in 0..1.
- `sunlit(t)` is `frac_sun(t) >= 0.5`, which is the same as `clear_sun(t) >= 0`. `earth_in_view(t)` is `clear_earth(t) >= 0`. `both(t)` is the AND.

`computeMetrics` works on the hourly samples whose time is in `[startMs, endMs)` and inside the data coverage. If no sample qualifies it returns `null` (the UI shows "outside data range"). Let N be the number of qualifying samples and `stepH = step_minutes / 60`.

| Field | Definition |
|---|---|
| `sun_el_deg` | Sun elevation at `refMs` (default `startMs`), from `sampleAt`, terrain ignored. If `refMs` is outside coverage, use `NaN` is NOT allowed: clamp `refMs` into the coverage. |
| `sun_clearance_deg` | `clear_sun` at `refMs`, using the interpolated position and `horizonAt`. |
| `pct_sunlit` | share of the N samples with `sunlit`, times 100. |
| `mean_sun_frac` | mean of `bodyFraction` for the Sun over the N samples, times 100. |
| `longest_dark_h` | longest run of consecutive not-`sunlit` samples among the N, times `stepH`. |
| `pct_earth` | share of N with `earth_in_view`, times 100. |
| `longest_no_earth_h` | longest run of consecutive not-`earth_in_view` samples, times `stepH`. |
| `pct_both` | share of N with `both`, times 100. |

Transitions use the samples from `refMs` to the **end of the data coverage**, not only the interval. State per sample is `sunlit` or `earth_in_view` as above. Sunset is a change from true to false between consecutive samples `k` and `k+1`. Its time is found by linear interpolation of `clear` between the two samples: `t = t_k + clear_k / (clear_k - clear_{k+1}) * step`. The same for sunrise (false to true) and for Earth (`earthset`, `earthrise`). The reported time is the first transition whose time is `>= refMs`. Return ISO 8601 UTC strings with a trailing `Z` and without milliseconds (for example `2027-03-14T06:12:30Z`; round to the nearest second).

`next_sunset_utc`, `next_sunrise_utc`, `next_earthset_utc`, `next_earthrise_utc`: the ISO string, or `null` when no such transition exists up to the end of coverage. `time_to_sunset_h` and `time_to_earthset_h`: `(event - refMs) / 3600000`, or `null` when the event is `null`. When an event is `null`, set `gaps.<name> = 'beyond_data'` where `<name>` is `sunset`, `sunrise`, `earthset` or `earthrise`; otherwise omit the key. Return `gaps` as `{}` when all four exist.

Performance: one call walks at most about 18300 samples; keep it a single pass per quantity, no per-sample allocations of arrays or objects in the hot loop.

### 4.4 Tests (vitest, `npm test`)

Write small hand-checked cases, no random data:

- `horizonAt`: exact sample hit; midpoint between two samples; wrap between the last and first sample (for example a 720-sample mask where index 719 is 2 and index 0 is 4, azimuth 359.75 gives 3); azimuth values like `-0.25` and `360.25`.
- `sampleAt`: outside coverage gives `null`; exact sample; midpoint; azimuth wrap (359 and 1 gives 0); last sample time is included.
- `bodyFraction`: `x = 0` gives 0.5, `x = 1` and above gives 1, `x = -1` and below gives 0, `clear = 0.5 * r` gives about 0.8045 (tolerance 1e-3).
- `computeMetrics`: build a tiny `EphemFile` and `HorizonFile` by hand (6 to 12 samples, a flat horizon of 0 degrees, one mask for observer height "2"). Cover: a Sun that sets between two samples (check the interpolated time), a body that never sets (event `null` and `gaps.sunset === 'beyond_data'`), a window with no samples (`null`), a window partly outside coverage, the longest dark run, the half-cut disc (`clear = 0` gives `frac = 0.5`), and an azimuth wrap at 359.5 to 0.5.

## 5. Acceptance

1. `npm run typecheck` exits 0. Another worker is writing other files in `src/lib/` (`loader.ts`, `customSite.ts` and their tests) at the same time, so ignore errors in files you do not own, but name them in your report.
2. `npx vitest run src/lib/horizon src/lib/ephem src/lib/metrics` exits 0 (run only your own test files). Report the number of passing tests per file.
3. No change to any file outside the Writable paths.

## 6. Forbidden

- No git commands that change state (no commit, branch, push, stash, reset).
- No edits outside the Writable paths. Do not edit `src/lib/types.ts`; if a type is missing or wrong, say so under OPEN.
- No new npm packages. No network access.
- You may use helpers for parallel work, but this task is small, so do it yourself.

## 7. Final report

End with exactly:

```
STATUS: done | blocked
FILES: <one path per line>
COMMANDS: <command> -> <exit code>
NUMBERS: <test counts per file>
OPEN: <questions or deviations from the spec, or "none">
```
