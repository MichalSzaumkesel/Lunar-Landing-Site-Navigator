# Review A6: Test Coverage Gaps Audit

## Summary (Top 5 Findings)
1. HIGH (`src/state/selectors.ts:5`): Pure mission timing logic (`scenarioWindowMs`, `scenarioCursorMs`, `scenarioCursorUtc`) has zero test coverage.
2. HIGH (`src/components/share/shareActions.ts:28`): Scenario CSV export and clipboard URL sharing logic have zero test coverage.
3. HIGH (`src/components/demo/demoState.ts:27`): Demo store state snapshotting and tab/scenario restoration logic have zero test coverage.
4. HIGH (`src/lib/windowMap.ts:77`): `computeWindowMap` with `NaN` timestamp triggers `new Float32Array(NaN)` causing uncaught `RangeError: Invalid array length`.
5. HIGH (`src/components/timeline/chips.ts:17`): `fmtChipTime` and `fmtFull` call `toISOString()` on `NaN` timestamps, throwing uncaught `RangeError: Invalid time value`.

---

## Findings (Ordered by Severity)

### 1. HIGH: Missing unit tests for core timing selectors
- **Location**: `src/state/selectors.ts:5`
- **What is wrong**: Core timing selectors `scenarioWindowMs`, `scenarioCursorMs`, and `scenarioCursorUtc` have zero tests (`src/state/selectors.test.ts` is missing). These functions govern scenario time window conversion, boundary clamping, slip shifts, and ISO timestamp string formatting across the entire app.
- **Evidence**: `src/state/selectors.test.ts` does not exist in the repository.
- **Fix & Proposed Test Cases**:
  - Fix: Create `src/state/selectors.test.ts` testing window bounds, cursor clamping, slip offsets, and invalid dates.
  - Test 1: `scenarioWindowMs: standard window` | Input: `{ startUtc: '2027-01-01T00:00:00Z', durationH: 48, slipDays: 2 }` | Expected: `{ startMs: 1798934400000, endMs: 1799107200000 }`
  - Test 2: `scenarioCursorMs: clamps cursor to bounds` | Input: `scenario` (48h), `cursorH: -5` -> `startMs`; `cursorH: 60` -> `startMs + 48*3600000`
  - Test 3: `scenarioCursorUtc: formats ISO string` | Input: `startUtc: '2027-01-01T00:00:00Z'`, `cursorH: 1.5` | Expected: `'2027-01-01T01:30:00Z'`
  - Test 4: `scenarioWindowMs: fallback on invalid startUtc or NaN duration` | Input: `{ startUtc: 'invalid', durationH: NaN, slipDays: NaN }` | Expected: `startMs: 0, endMs: 3600000`

### 2. HIGH: Missing unit tests for CSV export and clipboard share actions
- **Location**: `src/components/share/shareActions.ts:28`
- **What is wrong**: `exportScenariosCsv` and `copyShareLink` have zero test coverage (`src/components/share/shareActions.test.ts` is missing). Export logic loads site bundles, computes metrics, formats RFC 4180 CSV, formats date-stamped filenames, and handles empty scenario lists and clipboard permissions.
- **Evidence**: `src/components/share/shareActions.test.ts` does not exist.
- **Fix & Proposed Test Cases**:
  - Fix: Add `src/components/share/shareActions.test.ts` mocking `dataSource`, `useAppStore`, and `navigator.clipboard`.
  - Test 1: `exportScenariosCsv: throws when scenario list is empty` | Input: `scenarios: []` | Expected: throws `Error('No scenarios to export.')`
  - Test 2: `exportScenariosCsv: successfully creates CSV with metrics` | Input: `scenarios: [validScenario]`, mock dataSource | Expected: calls `downloadText('lunar-scenarios-YYYYMMDD.csv', <csvString>)`
  - Test 3: `copyShareLink: copies URL to clipboard when API available` | Input: `clipboard.writeText` resolves | Expected: returns `null`
  - Test 4: `copyShareLink: falls back to URL string on clipboard rejection` | Input: `clipboard.writeText` rejects | Expected: returns share URL string

### 3. HIGH: Missing unit tests for demo state store and snapshot restoration
- **Location**: `src/components/demo/demoState.ts:27`
- **What is wrong**: `useDemoStore` contains pre-demo snapshot creation, tab state capture, and state restoration on demo exit (`startDemo`, `stopDemo`, `nextStep`), but has zero dedicated tests (`src/components/demo/demoState.test.ts` is missing).
- **Evidence**: `src/components/demo/demoState.test.ts` does not exist.
- **Fix & Proposed Test Cases**:
  - Fix: Add unit tests for `useDemoStore` testing snapshot preservation and restoration of `scenarios`, `mode`, `cursorH`, and tab elements.
  - Test 1: `startDemo: snapshots existing scenarios and mode` | Input: store with `mode: 'advanced', cursorH: 12` | Expected: `snapshot` matches initial store state, `isActive: true`
  - Test 2: `stopDemo: restores previous scenario list and sets playing false` | Input: modified store state during demo, invoke `stopDemo()` | Expected: app store restored to snapshot values
  - Test 3: `nextStep: wraps around based on totalSteps` | Input: `stepIndex: 2, totalSteps: 3` -> `stepIndex: 0`; `totalSteps: 0` -> `stepIndex: 0`

### 4. HIGH: computeWindowMap crashes on NaN startMs/endMs
- **Location**: `src/lib/windowMap.ts:77`
- **What is wrong**: If `opts.startMs` or `opts.endMs` is `NaN`, `reqStartMs` becomes `NaN`. The check `reqStartMs > reqEndMs` evaluates to `false`. `mMin` and `mMax` evaluate to `NaN`, producing `count = NaN`. Creating `new Float32Array(count)` throws an uncaught `RangeError: Invalid array length`.
- **Evidence**: `computeWindowMap(inputs, rules, { startMs: NaN })` throws `RangeError: Invalid array length` in `new Float32Array(count)`.
- **DECISION**: Should functions encountering NaN epoch timestamps return an empty result or throw a descriptive error? Recommend validating finite numbers and returning empty rows.
- **Fix & Proposed Test Cases**:
  - Fix: Validate `opts.startMs` and `opts.endMs` with `Number.isFinite`.
  - Test 1: `computeWindowMap: returns empty rows when startMs is NaN` | Input: `opts: { startMs: NaN }` | Expected: rows with `count: 0`, empty arrays, no throw
  - Test 2: `computeWindowMap: returns empty rows when endMs is NaN` | Input: `opts: { endMs: NaN }` | Expected: rows with `count: 0`, empty arrays, no throw

### 5. HIGH: Timeline chip formatters throw uncaught RangeError on NaN timestamps
- **Location**: `src/components/timeline/chips.ts:17`
- **What is wrong**: `fmtChipTime(ms)` and `fmtFull(ms)` call `new Date(ms).toISOString()` without validating `Number.isFinite(ms)`. If an event or stretch contains a `NaN` timestamp, `toISOString()` throws an uncaught `RangeError: Invalid time value`, unmounting the timeline component.
- **Evidence**: In `src/components/timeline/chips.ts:18`, `new Date(NaN).toISOString()` throws `RangeError: Invalid time value`. Untested in `chips.test.ts`.
- **Fix & Proposed Test Cases**:
  - Fix: Add finite check and return fallback text (e.g., `'—'`) if `ms` is not finite.
  - Test 1: `fmtChipTime: returns fallback for NaN ms` | Input: `ms: NaN` | Expected: `''` or `'—'` (no exception)
  - Test 2: `eventChip: handles non-finite event timestamp safely` | Input: `{ kind: 'sunset', ms: NaN, utc: '' }` | Expected: valid chip object without throwing `RangeError`

### 6. HIGH: computeMetrics returns NaN metrics instead of null when startMs/endMs is NaN
- **Location**: `src/lib/metrics.ts:59`
- **What is wrong**: In `computeMetrics`, the boundary condition `if (ephem.count <= 0 || input.startMs >= input.endMs)` evaluates to `false` when `startMs` is `NaN`. Consequently, `kStart`, `kEnd`, and `N` compute to `NaN`, `N <= 0` evaluates to `false`, and the function returns an object filled with `NaN` (`pct_sunlit: NaN`, `mean_sun_frac: NaN`) instead of returning `null`.
- **Evidence**: `computeMetrics(bundle, { observerHeightM: 2, startMs: NaN, endMs: 1000 })` returns `{ pct_sunlit: NaN, ... }`.
- **Fix & Proposed Test Cases**:
  - Fix: Add `if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs)) return null` at the start of `computeMetrics`.
  - Test 1: `computeMetrics: returns null when startMs is NaN` | Input: `startMs: NaN, endMs: 1798934400000` | Expected: `null`
  - Test 2: `computeMetrics: returns null when endMs is NaN` | Input: `startMs: 1798934400000, endMs: NaN` | Expected: `null`

### 7. HIGH: sampleAt returns NaN positions when time is NaN
- **Location**: `src/lib/ephem.ts:42`
- **What is wrong**: In `sampleAt`, `if (ms < startMs || ms > endMs)` evaluates to `false` when `ms` is `NaN`. It then computes `kFloat = NaN`, accesses `e.sun.az[NaN]`, and returns `{ sun: { az: NaN, el: NaN }, earth: { az: NaN, el: NaN } }` rather than `null`.
- **Evidence**: `sampleAt(ephem, NaN)` yields `{ sun: { az: NaN, el: NaN }, earth: { az: NaN, el: NaN } }`. `ephem.test.ts` only tests times strictly before `startMs` and after `endMs`.
- **Fix & Proposed Test Cases**:
  - Fix: Add `if (!Number.isFinite(ms)) return null` at the start of `sampleAt`.
  - Test 1: `sampleAt: returns null for NaN ms` | Input: `ms: NaN` | Expected: `null`
  - Test 2: `sampleAt: returns null for Infinity ms` | Input: `ms: Infinity` | Expected: `null`

### 8. HIGH: poleLocalFrame produces zero-vector east at exact South Pole
- **Location**: `src/components/map/poleProjection.ts:44`
- **What is wrong**: In `poleLocalFrame(latDeg, lonDeg)`, when `latDeg === -90`, `poleForward(-90, lonDeg - h)` and `poleForward(-90, lonDeg + h)` both produce `rho = 0` (`x: 0, y: 0`). Consequently `e1.x - e0.x = 0` and `e1.y - e0.y = 0`, causing `norm()` to return `{ x: 0, y: 0 }`. In `gridImageMatrix(-90, lonDeg, ...)`, this yields `a = 0, b = 0`, collapsing the transform matrix.
- **Evidence**: Calling `poleLocalFrame(-90, 0)` returns `{ north: { x: 0, y: 1 }, east: { x: 0, y: 0 } }`.
- **DECISION**: Define canonical orientation fallback at the pole (e.g. east points along `(cos(lon), -sin(lon))` in projected space).
- **Fix & Proposed Test Cases**:
  - Fix: Handle `latDeg <= -90 + 1e-4` specifically, deriving east orthogonal to north via 90-degree rotation.
  - Test 1: `poleLocalFrame: returns unit vector for east at south pole` | Input: `latDeg: -90, lonDeg: 0` | Expected: `Math.hypot(east.x, east.y) === 1`
  - Test 2: `gridImageMatrix: produces non-degenerate matrix at south pole` | Input: `latDeg: -90, lonDeg: 0, spacingM: 200, nx: 21, ny: 21` | Expected: `Math.abs(a * d - b * c) > 0`

### 9. MEDIUM: approximateCustomSite lacks polar coordinate tests and bounds checking
- **Location**: `src/lib/customSite.ts:154`
- **What is wrong**: `approximateCustomSite(lat, lon, ref)` is only tested for equatorial site `(0, 90)` against `(0, 0)`. Polar coordinates (`lat: -90` or `lat: 90`), coordinates with `NaN`, and out-of-range coordinates (`lat: 105`) are completely untested and not validated.
- **Evidence**: `src/lib/customSite.test.ts` contains no polar approximation tests; `approximateCustomSite(NaN, NaN, ref)` proceeds without error, generating `NaN` tracks.
- **Fix & Proposed Test Cases**:
  - Fix: Add boundary validation to `approximateCustomSite` and add test cases for polar sites.
  - Test 1: `approximateCustomSite: south pole approximation` | Input: `lat: -90, lon: 0, reference: southpole_landed` | Expected: returns valid bundle with non-NaN ephemeris tracks
  - Test 2: `approximateCustomSite: throws or rejects on NaN/out-of-bounds coords` | Input: `lat: 100, lon: 0` | Expected: throws `Error`

### 10. MEDIUM: useHeldCursorKeys keyboard auto-repeat and clamping untested
- **Location**: `src/lib/useHeldCursorKeys.ts:21`
- **What is wrong**: `useHeldCursorKeys` manages keyboard animation frames, key repeat detection, bounds clamping (`[0, maxH]`), and blur/release handling, but has no tests (`useHeldCursorKeys.test.ts` does not exist).
- **Evidence**: No test file exists for `useHeldCursorKeys`.
- **Fix & Proposed Test Cases**:
  - Fix: Create `src/lib/useHeldCursorKeys.test.ts` using mock events and virtual timer/RAF.
  - Test 1: `ignores non-repeat keydown` | Input: `{ key: 'ArrowRight', repeat: false }` | Expected: returns `false`
  - Test 2: `handles repeat arrow keydown and triggers motion` | Input: `{ key: 'ArrowRight', repeat: true }` | Expected: calls `onStart`, prevents default, returns `true`
  - Test 3: `clamps write value between 0 and maxH` | Input: step exceeding `maxH` | Expected: written value clamped to `maxH`

### 11. MEDIUM: tourState store and localStorage persistence fallback untested
- **Location**: `src/components/help/tourState.ts:31`
- **What is wrong**: `getStoredTourStatus` and `setStoredTourStatus` contain `try/catch` logic falling back to `inMemoryDone` Set when `localStorage` throws (e.g. security sandbox or quota exceeded), but neither the store nor the fallback logic has tests.
- **Evidence**: `src/components/help/tourState.test.ts` does not exist.
- **Fix & Proposed Test Cases**:
  - Fix: Create `src/components/help/tourState.test.ts` verifying store actions and storage fallback.
  - Test 1: `getStoredTourStatus: reads from localStorage when available` | Input: `mode: 'simple'` | Expected: stored value
  - Test 2: `setStoredTourStatus: falls back to inMemoryDone when localStorage throws` | Input: mock `localStorage.setItem` throwing `SecurityError` | Expected: `getStoredTourStatus('simple') === 'done'`

### 12. MEDIUM: scrollSettle viewport detection and animation cleanup untested
- **Location**: `src/components/help/scrollSettle.ts:10`
- **What is wrong**: `whenScrollSettled` implements dual-path scrolling detection (`scrollend` event vs polling `getBoundingClientRect` via RAF) and timeout fallback (`MAX_WAIT_MS = 900`), but has no unit tests.
- **Evidence**: `src/components/help/scrollSettle.test.ts` does not exist.
- **Fix & Proposed Test Cases**:
  - Fix: Create `src/components/help/scrollSettle.test.ts`.
  - Test 1: `isFullyInView: returns true when rect inside window bounds` | Input: rect `{ top: 10, left: 10, bottom: 200, right: 300 }` | Expected: `true`
  - Test 2: `whenScrollSettled: triggers done after max timeout fallback` | Input: mock element, advance timer by 900 ms | Expected: `done` called once
  - Test 3: `whenScrollSettled: cancel stops pending RAF and timeouts` | Input: call returned `cancel()` | Expected: `done` never called

### 13. MEDIUM: curatedSites singleton promise caching untested
- **Location**: `src/components/scenario/curatedSites.ts:6`
- **What is wrong**: `loadCuratedSites` caches a module-level singleton `sitesPromise` and clears it on error, while filtering `s.category !== 'custom'`. Untested module state can leak between tests.
- **Evidence**: `src/components/scenario/curatedSites.test.ts` does not exist.
- **Fix & Proposed Test Cases**:
  - Fix: Add unit tests for `loadCuratedSites` verifying caching and filtering.
  - Test 1: `loadCuratedSites: filters custom sites` | Input: sites list with 2 curated and 1 custom | Expected: returns array of length 2
  - Test 2: `loadCuratedSites: resets promise cache on loader failure` | Input: mock rejection | Expected: returns `[]`, next call retries

### 14. MEDIUM: useBasemap loaders and cache map untested
- **Location**: `src/components/map/useBasemap.ts:42`
- **What is wrong**: `loadBasemap` and `loadIllum` load static JSON files, construct bounding extents, and cache promises permanently in global Maps (`basemapCache`, `illumCache`) without any unit tests.
- **Evidence**: Neither `loadBasemap` nor `loadIllum` is referenced in any test file.
- **Fix & Proposed Test Cases**:
  - Fix: Add unit tests mocking `fetch` for valid and invalid basemap / illumination metadata.
  - Test 1: `loadBasemap: parses extent and returns BasemapInfo` | Input: mock `southpole.json` | Expected: object with parsed `extentM` and `imageUrl`
  - Test 2: `loadBasemap: returns null on fetch 404` | Input: fetch returns `ok: false` | Expected: `null`

### 15. MEDIUM: loadEarthOrientation has zero tests
- **Location**: `src/lib/earthOrientation.ts:134`
- **What is wrong**: `loadEarthOrientation` fetches `data/earth_orientation.json`, validates with `isValidEarthOrientation`, and caches the promise. Although pure rotation math is tested, the loader itself has zero tests.
- **Evidence**: `src/lib/earthOrientation.test.ts` does not import or test `loadEarthOrientation`.
- **Fix & Proposed Test Cases**:
  - Fix: Add loader tests with mocked fetch.
  - Test 1: `loadEarthOrientation: loads and validates file` | Input: mock valid JSON | Expected: valid `EarthOrientationFile`
  - Test 2: `loadEarthOrientation: returns null on network failure` | Input: mock fetch reject | Expected: `null`

### 16. MEDIUM: findWindows range option with NaN bounds is untested
- **Location**: `src/lib/finder.ts:228`
- **What is wrong**: When `range.startMs` or `range.endMs` is `NaN`, checks `range.startMs > range.endMs` and `range.startMs > covEndMs` evaluate to `false`. Calculations `k0` and `k1` become `NaN`. The loop condition `k0 > k1` evaluates to `false`, leaving unhandled non-finite indices.
- **Evidence**: In `src/lib/finder.test.ts`, there are no tests passing non-finite values in `range`.
- **Fix & Proposed Test Cases**:
  - Fix: Validate `Number.isFinite(range.startMs) && Number.isFinite(range.endMs)`.
  - Test 1: `findWindows: returns empty array when range.startMs is NaN` | Input: `range: { startMs: NaN, endMs: 1000 }` | Expected: `[]`
  - Test 2: `findWindows: returns empty array when range.endMs is NaN` | Input: `range: { startMs: 1000, endMs: NaN }` | Expected: `[]`

### 17. MEDIUM: formatWindowPlain outputs undefined NaN on invalid timestamps
- **Location**: `src/components/simple/simpleSummary.ts:66`
- **What is wrong**: `formatWindowPlain(startMs, endMs)` creates `new Date(startMs)` without checking `Number.isFinite`. On `NaN`, `a.getUTCMonth()` returns `NaN`, indexing `MONTHS[NaN]` which evaluates to `undefined`, outputting `"undefined NaN – undefined NaN, NaN"`.
- **Evidence**: `formatWindowPlain(NaN, NaN)` returns `"undefined NaN – undefined NaN, NaN"`.
- **Fix & Proposed Test Cases**:
  - Fix: Check `Number.isFinite` on inputs and return a fallback string like `'—'`.
  - Test 1: `formatWindowPlain: handles NaN timestamps safely` | Input: `startMs: NaN, endMs: NaN` | Expected: `'—'` or `'Date unavailable'`

### 18. MEDIUM: computeElevationSeries does not guard against NaN range hours
- **Location**: `src/components/chart/elevationSeries.ts:136`
- **What is wrong**: In `computeElevationSeries`, `endH < startH` evaluates to `false` when `startH` or `endH` is `NaN`. `totalHours` calculates to `NaN`, and the loop fails to execute cleanly.
- **Evidence**: In `src/components/chart/elevationSeries.test.ts`, only valid integer and fractional hour ranges are tested.
- **Fix & Proposed Test Cases**:
  - Fix: Add finite validation for `startH` and `endH`.
  - Test 1: `computeElevationSeries: returns empty array for NaN startH` | Input: `startH: NaN, endH: 24` | Expected: `[]`
  - Test 2: `computeElevationSeries: returns empty array for NaN endH` | Input: `startH: 0, endH: NaN` | Expected: `[]`

### 19. MEDIUM: planVideoSteps duration calculation with non-positive or NaN totalMs
- **Location**: `src/components/demo/videoScript.ts:23`
- **What is wrong**: `planVideoSteps(totalMs)` does not guard against `totalMs <= 0` or `NaN`. With `NaN`, `scaled` computes to `NaN`, returning steps with `durationMs: NaN`.
- **Evidence**: `planVideoSteps(NaN)[0].durationMs` is `NaN`.
- **Fix & Proposed Test Cases**:
  - Fix: Default to 30000 ms if `!Number.isFinite(totalMs) || totalMs <= 0`.
  - Test 1: `planVideoSteps: falls back to default 30000 ms on NaN` | Input: `totalMs: NaN` | Expected: steps summing to 30000 ms
  - Test 2: `planVideoSteps: falls back to default on negative duration` | Input: `totalMs: -100` | Expected: steps summing to 30000 ms

### 20. MEDIUM: Leaked fake timers and stubbed globals in exportCsv.test.ts
- **Location**: `src/lib/exportCsv.test.ts:252`
- **What is wrong**: In `downloadText` test, `vi.unstubAllGlobals()` and `vi.useRealTimers()` are called at the end of the test function body instead of in an `afterEach` hook. If an assertion fails prior to line 252, fake timers and stubbed `document`/`URL` leak into subsequent test suites running on that worker.
- **Evidence**: Lines 252-253 are after assertions in `it('creates an anchor with blob URL...')`.
- **Fix & Proposed Test Cases**:
  - Fix: Move `vi.unstubAllGlobals()` and `vi.useRealTimers()` to `afterEach` in `exportCsv.test.ts`.
  - Test 1: Ensure timer and global restore occurs in `afterEach` hook.

### 21. MEDIUM: Flaky wall-clock benchmark in moonFrame.test.ts
- **Location**: `src/lib/moonFrame.test.ts:180`
- **What is wrong**: Test `elevationGrid performance bound under 20 ms for 180 by 90 cells` measures real wall-clock elapsed time with `performance.now()` and asserts `expect(elapsedPerRun).toBeLessThan(20)`. Under CPU contention or on slow CI machines, this threshold intermittently fails.
- **Evidence**: `src/lib/moonFrame.test.ts:193`: `expect(elapsedPerRun).toBeLessThan(20)`.
- **Fix & Proposed Test Cases**:
  - Fix: Either remove strict millisecond threshold from unit tests or relax threshold to an order-of-magnitude sanity check (e.g. `< 500 ms`).
  - Test 1: `elevationGrid: computes grid dimensions and non-NaN values without timing flakiness` | Input: 90x180 | Expected: `grid.length === 16200` and all values finite

### 22. MEDIUM: Flaky wall-clock benchmark in finder.test.ts
- **Location**: `src/lib/finder.test.ts:458`
- **What is wrong**: Test `findWindows performance: full year run (18288 samples) completes well under 500 ms` asserts `expect(durationMs).toBeLessThan(500)`. Wall-clock assertions fail intermittently when background tasks or GC pauses occur during test runs.
- **Evidence**: `src/lib/finder.test.ts:465`: `expect(durationMs).toBeLessThan(500)`.
- **Fix & Proposed Test Cases**:
  - Fix: Remove or relax threshold to `< 5000 ms` to avoid test flakiness.

### 23. MEDIUM: Flaky wall-clock benchmark in windowMap.test.ts
- **Location**: `src/lib/windowMap.test.ts:376`
- **What is wrong**: Test `computeWindowMap performance: full year run completes well under 1 s` asserts `expect(elapsedMs).toBeLessThan(1000)`. Benchmark tests in unit test suites cause non-deterministic failures.
- **Evidence**: `src/lib/windowMap.test.ts:388`: `expect(elapsedMs).toBeLessThan(1000)`.
- **Fix & Proposed Test Cases**:
  - Fix: Relax threshold to `< 5000 ms` or separate benchmark into a dedicated benchmark suite.

### 24. MEDIUM: Flaky wall-clock benchmarks in realData.test.ts
- **Location**: `src/lib/realData.test.ts:178`
- **What is wrong**: Tests assert `expect(ms).toBeLessThan(20_000)` and `expect(mapMs + hourlyMs).toBeLessThan(10_000)`. These heavy computations can time out or exceed thresholds on slower test runners.
- **Evidence**: `src/lib/realData.test.ts:178` and line 263.
- **Fix & Proposed Test Cases**:
  - Fix: Relax timing thresholds or use vitest benchmark framework instead of asserting elapsed wall-clock milliseconds.

### 25. LOW: normalizeAz and horizonAt with non-finite azimuth inputs untested
- **Location**: `src/lib/horizon.ts:28`
- **What is wrong**: In `normalizeAz`, `azDeg % 360` with `NaN` or `Infinity` returns `NaN`. `horizonAt` does not validate finite `azDeg`, producing `NaN` array index and returning `NaN`.
- **Evidence**: `horizonAt([1, 2], 1, NaN)` returns `NaN`. Untested in `horizon.test.ts`.
- **Fix & Proposed Test Cases**:
  - Fix: Add finite checks to `normalizeAz` and `horizonAt`.
  - Test 1: `normalizeAz: handles NaN` | Input: `azDeg: NaN` | Expected: `0`
  - Test 2: `horizonAt: handles NaN azimuth` | Input: `mask: [5], azStepDeg: 1, azDeg: NaN` | Expected: `5` or `0`
