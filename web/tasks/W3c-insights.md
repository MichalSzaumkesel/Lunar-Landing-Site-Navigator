# Task W3c: insights, shortcuts and 3D shadow cost

Write the files first, then test (see `_common.md`). Also read `tasks/UI-guidelines.md`. Wording rule: "Sun visible", "Earth in view"; never claim power, energy yield or link availability. Reviews for background (do not re-audit): `tasks/reviews/R4-visionary.md` ideas 1, 3, 5; `tasks/reviews/R5-build-perf-tests.md` (3D shadow finding).

## Writable paths

`src/lib/eclipses.ts` + test, `src/lib/mastDelta.ts` + test, `src/lib/useScenarioEvents.ts`, `src/components/timeline/EventChips.tsx`, `chips.ts` + test, `src/components/scenario/MetricsPanel.tsx`, `src/components/sky/SkyReadout.tsx`, `src/components/finder/WindowMap.tsx`, `src/components/finder/windowMapView.ts` + test, `src/app/useShortcuts.ts` + test, `src/viz3d/scene.ts`, `src/viz3d/SurfaceView.tsx`. Nothing else.

## 1. Earth in front of the Sun (`lib/eclipses.ts`)

`listEclipses(ephem: EphemFile, startMs: number, endMs: number): Eclipse[]` with `Eclipse = { startMs; endMs; maxOverlapFraction; minSeparationDeg }`. Per hourly sample the angular separation between the Sun and the Earth directions (use `angularSeparationDeg` from `lib/earthPhase.ts`); the discs overlap geometrically when `separation < sun_ang_radius_deg + earth_ang_radius_deg`. Merge consecutive overlapping samples into one eclipse (`startMs` is the first overlapping sample, `endMs` the sample after the last); `maxOverlapFraction` is the largest of `clamp((rSun + rEarth - separation) / (2 * rSun), 0, 1)`. Only samples with time in `[startMs, endMs)`. The terrain is ignored on purpose (documented in a comment). Tests with a hand-built ephemeris: no overlap, one eclipse of 5 samples, two eclipses, the window cutting an eclipse, total overlap fraction 1 when the Sun is fully inside the Earth disc. The synthetic mocks never produce one; do not assert anything about them.
UI: `useScenarioEvents` also returns the eclipses of the scenario window; `EventChips` shows a chip "Earth in front of the Sun" with the UTC start time (same chip behaviour: click sets the cursor, tooltip "Geometric overlap of the Earth and Sun discs seen from this site; terrain and Earth's atmosphere are not modelled."); `SkyReadout` adds a line "Earth in front of the Sun, X % of the Sun covered" only while the cursor lies inside an eclipse. Add the chip logic to `chips.ts` with tests.

## 2. Mast height delta (`lib/mastDelta.ts`)

`mastDelta(bundle: Pick<SiteBundle,'horizon'|'ephem'>, startMs, endMs): { sunHours2: number; sunHours10: number; gainH: number; longestDark2H: number; longestDark10H: number } | null` using `computeMetrics` for observer heights 2 and 10 (`sunHours = pct_sunlit / 100 * windowHours` where `windowHours = (endMs - startMs) / 3600000` clipped to the data coverage; use the number of samples times the step instead if `computeMetrics` exposes it indirectly; otherwise compute from `pct_sunlit` and the sample count you derive from the ephemeris step). Null when either mask or the metrics are missing. Tests with a hand-built horizon where the 10 m mask is 0.1 degrees lower. UI: one extra row in `MetricsPanel`: "10 m mast vs 2 m: +X h Sun visible" (or "no difference"), tooltip "Extra hours with the Sun centre above the terrain horizon when the observer stands 10 m above the ground instead of 2 m." Never mention power.

## 3. Slip buffer in the window map

In `windowMapView.ts` add `slipBufferH(window: { start_utc: string; end_utc: string }): number` = half of the window length in hours (`(end - start) / 2 / 3600000`, rounded to 0.5 h), with tests. In `WindowMap.tsx` each listed window gets the suffix " · slip buffer ±X h" with a tooltip "Any landing in this range meets the rules; a landing in the middle of it tolerates a slip of this many hours either way."; a window shorter than 6 h gets the tag "fragile".

## 4. Keyboard shortcuts (`app/useShortcuts.ts`)

A pure function `shortcutAction(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; targetTag: string; targetRole: string | null; targetEditable: boolean }): null | { type: 'toggle-play' } | { type: 'seek'; deltaH: number }` and a hook `useShortcuts()` that listens to `keydown` on `window` and applies the action to the store (`togglePlaying`, `setCursorH(cursorH + deltaH)` clamped at 0, pausing is not needed). Space toggles Play; ArrowRight and ArrowLeft seek by +1 h and -1 h, with Shift by +24 h and -24 h. Ignore (return null) when ctrl, meta or alt is pressed, when the target is an `input`, `textarea`, `select`, `button`, `a`, or has role `slider`, `tab`, `tablist`, `menu`, or is editable. Call `preventDefault` only when an action applies. Tests for the pure function. Do not mount the hook; the lead does.

## 5. 3D shadow cost

In `viz3d/scene.ts`: `SHADOW_MAP = 2048`; recompute the shadow camera fit and let three redraw the shadow map only when the Sun direction changed by at least 0.1 degrees since the last update (compare unit vectors), and while Play is running (the store's `playing`) at most every 100 ms; a manual change when paused always updates. Keep the rest. In `SurfaceView.tsx` remove the duplicate `Synthetic data` badge (the scenario card header already shows it) and keep the data legend line.

## Acceptance

`npm run typecheck`, `npm run lint` and `npm test` exit 0 (report failures in files you do not own instead of fixing them). Report per item: done or why not, and test counts.
