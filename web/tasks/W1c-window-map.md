# Task W1c: window map computation, sites by landing dates (pure TypeScript + worker wrapper + tests)

## Goal

Compute, for several sites at once, how good each landing date is for a given mission, so the UI can draw a grid (rows are sites, columns are landing dates) and the user sees at a glance which site and date work. Heavy work runs in a Web Worker; the core is a pure function.

## Writable paths

`src/lib/windowMap.ts`, `src/lib/windowMap.test.ts`, `src/lib/windowMap.worker.ts`, `src/lib/windowMapClient.ts`

## Read-only references

`src/lib/types.ts` (`MissionRules`, `SiteBundle`), `src/lib/finder.ts` (the validity rules; your `valid` must match `findWindows`), `src/lib/horizon.ts`, `src/lib/ephem.ts`, `src/lib/metrics.ts`.

## Spec

### `src/lib/windowMap.ts` (pure)

```ts
export interface WindowMapInput { siteId: string; bundle: Pick<SiteBundle, 'horizon' | 'ephem'> }
export interface WindowMapRow {
  siteId: string
  startMs: number        // landing time of column 0
  stepMs: number         // distance between columns (dayStepH hours)
  count: number          // number of columns
  pctSunlit: Float32Array   // pct_sunlit (0..100) of the mission interval starting at each column
  pctEarth: Float32Array    // pct_earth (0..100) of the same interval
  longestDarkH: Float32Array
  valid: Uint8Array      // 1 when every MissionRules rule holds for a landing at that column time, else 0; 255 when the interval leaves the data coverage
}
export function computeWindowMap(inputs: WindowMapInput[], rules: MissionRules, opts?: { dayStepH?: number; startMs?: number; endMs?: number }): WindowMapRow[]
```

- Candidates are the sample times of the first site's ephemeris grid at every `dayStepH` hours (default 24), counted from the ephemeris start, restricted to `[startMs, endMs]` (default the whole coverage). Each site uses its own ephemeris; sites share the same coverage in practice, so build the column times from the first input and sample each site at the same absolute times by index arithmetic from its own `start_utc` (if a site's coverage does not contain the mission interval, mark `valid = 255` and fill metrics with 0).
- Rules and metric definitions are identical to `src/lib/finder.ts` (hourly samples, `sunlit` when sun clearance >= 0, `earth_in_view` when Earth clearance >= 0, mission interval of `round(missionDurationH / stepH)` samples starting at the candidate, rules on `pct_sunlit`, `longest_dark_h`, `pct_earth`, optional Earth at landing and minimum Sun elevation at landing).
- Efficiency: compute the two boolean arrays once per site; use prefix sums for the two percentages; for `longestDarkH` use a simple loop over the interval (fine for the sizes involved) or a sliding approach. 3 sites, 730 columns, a 240 h mission must finish in well under 300 ms.

### `src/lib/windowMap.worker.ts` and `src/lib/windowMapClient.ts`

The worker receives `{ inputs, rules, opts }` (plain objects, the bundles' `horizon` and `ephem` are structured-cloned) and posts back the `WindowMapRow[]` using transferable typed arrays. The client exposes `computeWindowMapAsync(inputs, rules, opts): Promise<WindowMapRow[]>` that creates the worker with `new Worker(new URL('./windowMap.worker.ts', import.meta.url), { type: 'module' })`, falls back to calling `computeWindowMap` directly when `Worker` is undefined, supports cancelling a stale request (a newer call terminates the previous worker run and the older promise rejects with an `Error('cancelled')`), and rejects when the worker errors. No tests for the worker or the client, but both must typecheck (`DedicatedWorkerGlobalScope` typing: use `self as unknown as { onmessage: ..., postMessage: ... }`-style narrow typing instead of adding a new tsconfig lib).

## Tests (vitest, pure function only)

- Hand-built tiny ephemeris and flat mask (about 120 hourly samples, sun and Earth elevations written by hand): known `pctSunlit`, `pctEarth`, `longestDarkH` for a few columns; `valid` flags for each rule (min sunlit, max dark run, min Earth, Earth at landing, min Sun elevation); `255` when the mission interval leaves the coverage; `dayStepH = 12`; `startMs`/`endMs` restriction.
- Agreement with `findWindows` on the real mock files (read `public/data/mock/horizon|ephem/<id>.json` with `node:fs`): for each of the three sites and two rule sets of your choice, every column time where `valid === 1` lies inside a window returned by `findWindows` for the same rules, and every column time that lies inside a `findWindows` window has `valid === 1` (compare on the 24-hour columns).
- Timing: the three real mock sites, 240 h mission, 24 h step, whole coverage, under 300 ms (loose bound 1000 ms in the test).

## Acceptance

`npm run typecheck` exits 0; `npx vitest run src/lib/windowMap` exits 0. Report the test count and the measured time.
