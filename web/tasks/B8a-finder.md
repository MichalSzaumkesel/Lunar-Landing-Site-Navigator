# Task B8a: landing window finder (pure TypeScript + tests)

You are a worker for the scope B lead of a Vite + React + TypeScript project (working directory: `web/`). Follow this brief exactly. Where it is silent, choose the simplest option and list the choice under OPEN in your final report.

## 1. Goal

Implement the window finder of the data contract: given a site's horizon and ephemeris and a set of mission rules, return the contiguous ranges of landing times that satisfy every rule. Pure functions, no React, no DOM.

## 2. Writable paths

- `src/lib/finder.ts`, `src/lib/finder.test.ts`

## 3. Read-only references

- `../docs/contract.md`, section 3 (metric definitions and "Window finder rules").
- `src/lib/types.ts`: `MissionRules`, `LandingWindow`, `SiteBundle`. Import with `import type`; do not edit.
- `src/lib/horizon.ts` (`horizonAt`), `src/lib/ephem.ts` (`ephemCoverage`, `sampleAt`). Import and reuse them. Do not copy their logic.
- `tsconfig.app.json` rules apply: `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`. Use the same relative import style as `src/lib/loader.ts` (no `.ts` extension).

## 4. Spec

```ts
export interface FinderRange { startMs: number; endMs: number }   // candidate landing times T with startMs <= T <= endMs
export function findWindows(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  rules: MissionRules,
  range?: FinderRange,            // default: the whole data coverage
): LandingWindow[]
```

Definitions (hourly samples, `stepH = step_minutes / 60`, `D = rules.missionDurationH`, `n = round(D / stepH)` samples per mission):

- For sample `k`: `clear_sun(k) = sun.el[k] - horizonAt(mask, az_step_deg, sun.az[k])`, `sunlit(k) = clear_sun(k) >= 0`; the same for Earth gives `earth_in_view(k)`. The mask is `horizon.masks[String(rules.observerHeightM)]` (fall back to `masks['2']`, then to a flat 0 mask).
- A candidate landing time is sample time `T_k`. It is valid when all of these hold for the mission interval `[T_k, T_k + D)`, which consists of the samples `k .. k + n - 1`:
  1. the whole interval lies inside the data coverage (`k + n - 1 <= count - 1`),
  2. `pct_sunlit >= rules.minPctSunlit`, where `pct_sunlit` is the share of the `n` samples with `sunlit`, times 100,
  3. `longest_dark_h <= rules.maxLongestDarkH`, where it is the longest run of consecutive not-`sunlit` samples times `stepH`,
  4. `pct_earth >= rules.minPctEarth` (share of `earth_in_view`, times 100),
  5. if `rules.earthAtLandingRequired`: `earth_in_view(k)`,
  6. if `rules.minSunElAtLandingDeg` is defined: `sun.el[k] >= rules.minSunElAtLandingDeg` (terrain ignored, the plain elevation).
- Candidates are only the hourly sample times inside `range` (inclusive at both ends; default range is the full coverage).
- Output: maximal runs of consecutive valid candidates, in time order. A run from `T_a` to `T_b` becomes `{ start_utc: iso(T_a), end_utc: iso(T_b) }` where `end_utc` is the last valid candidate time (inclusive). ISO format: UTC with a trailing `Z`, no milliseconds (for example `2027-03-14T06:00:00Z`).
- Edge cases: `missionDurationH <= 0` or `n < 1` returns `[]`; a `range` outside the coverage returns `[]`; `count === 0` returns `[]`.

Performance: for 18288 candidates and `D = 240 h` the whole call must finish in well under 200 ms. Precompute the two boolean arrays (`sunlit`, `earth`) once with typed arrays, then evaluate each candidate with simple loops over its window (O(candidates times n) is fine). No per-candidate allocations.

### Tests (vitest)

Hand-built tiny `horizon` and `ephem` fixtures (flat 0 degree mask, 24 to 72 hourly samples, `sun.el` and `earth.el` written by hand so the answer is known), no random data. Cover: all rules pass everywhere (one window covering the allowed range); a Sun that is below the horizon for a stretch (`maxLongestDarkH` and `minPctSunlit` cut candidates); `earthAtLandingRequired` with Earth rising halfway; `minSunElAtLandingDeg`; a mission longer than the remaining coverage (late candidates are dropped); two separate windows; `range` limiting the candidates; `missionDurationH = 0` returns `[]`; the 10 m mask being used when requested. Add one performance test on a generated 18288-sample ephemeris (sun and Earth elevations from simple sine waves) asserting the call takes under 500 ms (a loose bound to avoid flakiness).

## 5. Acceptance

1. `npm run typecheck` exits 0 (ignore and name errors in files you do not own).
2. `npx vitest run src/lib/finder` exits 0. Report the number of passing tests.
3. No change to any file outside the Writable paths.

## 6. Forbidden

- No git commands that change state (no commit, branch, push, stash, reset).
- No edits outside the Writable paths. Do not edit `types.ts`; if a type is missing or wrong, say so under OPEN.
- No new npm packages. No network access.

## 7. Final report

End with exactly:

```
STATUS: done | blocked
FILES: <one path per line>
COMMANDS: <command> -> <exit code>
NUMBERS: <test count, measured time of the performance test>
OPEN: <questions or deviations from the spec, or "none">
```
