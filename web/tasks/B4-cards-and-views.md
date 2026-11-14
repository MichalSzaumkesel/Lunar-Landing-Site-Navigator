# Task B4: scenario cards, panorama, loupe, Earth phase, event chips (role `ui-core`, round 2)

Read first: `web/tasks/_common.md` (it points to `RULES-quality.md` and `UI-guidelines.md`; follow both), `docs/contract.md` section 3, and the finished UI from round 1: `web/src/components/sky/` (`SkyPlot.tsx`, `geometry.ts`, `sky.css`), `web/src/components/timeline/`, `web/src/lib/useSiteBundle.ts`, `web/src/components/scenario/ScenarioBoard.tsx`, `web/src/state/store.ts` and `selectors.ts`, `web/src/lib/metrics.ts`. Round 1 reports are summarised: the sky plot and timeline work and are memoised; keep that discipline.

## Writable paths

`web/src/components/sky/**`, `web/src/components/timeline/**`, `web/src/components/scenario/**`, `web/src/lib/useSiteBundle.ts`, new files under `web/src/lib/` whose names start with `useScenario` (hooks only). Do not touch `state/`, `app/`, `config/`, `lib/types.ts` or any finished pure module; other workers are writing `lib/windowMap*`, `lib/moonFrame.ts`, `state/urlState.ts`, `viz3d/*` right now.

## Part 1: scenario card (B4)

Rewrite `ScenarioCard` in `ScenarioBoard.tsx` (keep the exported names and props):
- Header: `bundle.site.name` (not the raw id), a one-line subtitle with the site category and, for custom sites, the coordinates; the window dates in UTC; badges `Synthetic data` and `Approximate` from the bundle (move the badges from the sky plot to the card header and keep one source of truth). A "Remove" button (store `removeScenario`, hidden when only one card) and, on the board, an "Add scenario" button (store `addScenario` with the same site as the active card; hidden at 4 cards).
- Controls per card: a date input for the window start (UTC date; writes `startUtc` as `<date>T00:00:00Z` through `updateScenario`, clamped to the data coverage), the window length select (14, 30, 60 days -> `durationH`), and a slip slider (range input, -60..+60 days, step 1, store `setSlipDays`) with a readout "slip +14 d" and a "Reset slip" button.
- Metrics panel (computed with `computeMetrics` for the scenario window, observer height from the store, memoised on bundle, height, window; the cursor must not recompute it): a compact two-column grid with all fields of contract section 3 that apply: Sun elevation and clearance at the cursor time, share of time Sun visible (`pct_sunlit`), mean visible disc, longest dark stretch, Earth in view share, longest no-Earth stretch, both. Each with unit and a tooltip carrying the contract definition. When `computeMetrics` returns `null` show "Outside data range" instead of numbers.
- Countdowns (the headline numbers, large type): "Sun sets in X h" / "Sun rises in X h" and "Earth sets in X h" / "Earth rises in X h", relative to the cursor time, formatted as days and hours above 48 h. States: "No sunset in data range" when none exists up to the end of coverage, "Outside data range". Use `listSkyEvents` (see Part 3) once per bundle, height and window extended to the end of coverage, then pick the next event after the cursor by binary search, so nothing is rescanned per frame.
- Layout: the card is a single column: header, sky view, readout, timeline, countdowns, metrics, controls. Use theme tokens and the spacing scale from the guidelines; one primary action only.

## Part 2: panorama and loupe (new views of the sky)

- `components/sky/Panorama.tsx`: a 360 degree strip. x is azimuth 0..360 (N at the left edge and again at the right, labels N E S W N), y is elevation from the horizon up to the same zoom elevation as the polar plot (reuse the zoom choice from `geometry.ts`). Draw the terrain silhouette from the horizon mask (filled below the horizon curve), the Sun and Earth discs at true angular size at the cursor, and a faint track of each body over the window (break lines at the azimuth wrap). Sun and Earth state text like the polar readout. Same memoisation rules.
- `components/sky/Loupe.tsx`: a small square inset that magnifies the horizon around the Sun (or the Earth, with a toggle) at the cursor time: a window of +-3 degrees around the body azimuth and from -1 to +5 degrees of elevation, terrain silhouette from the mask, the disc drawn at true size so the ridge visibly cuts it, plus the visible disc percentage from `bodyFraction`. It is the "disc half-cut" proof.
- A view switcher in the card above the sky area: tabs `Polar`, `Panorama` and, when `src/viz3d/SurfaceView.tsx` exists, `3D` (lazy-loaded with `React.lazy`, only mounted when its tab is selected). Tabs use `role="tablist"`, arrow-key navigation. The Loupe sits beside or below the polar plot as part of the `Polar` tab, collapsible.

## Part 3: Earth phase and event chips (needs `src/lib/earthPhase.ts` and `src/lib/events.ts`)

Another worker is finishing these two modules now (APIs: `earthIlluminatedFraction(sun, earth)`, `earthPhaseName`, `brightLimbDirection`; `listSkyEvents(bundle, observerHeightM, startMs, endMs)`, `longestStretches(...)`). Do Parts 1 and 2 first; before Part 3 check that both files exist and their tests pass (`npx vitest run src/lib/earthPhase src/lib/events`). If they are still missing after Parts 1 and 2, report that and stop.
- Earth phase: in the sky readout add "Earth lit 63 %" with the phase name, with a tooltip saying it is derived from the Sun-Earth angle as seen from the site. Draw the Earth disc in the polar plot, panorama and loupe with its phase (a dark disc with the lit part towards the Sun: use `brightLimbDirection` mapped to screen orientation; a simple crescent drawn as the difference of two circles is enough; do not over-engineer).
- Event chips on the timeline: below the bands, small chips for the events in the window (sunset, sunrise, Earth set, Earth rise) and for the longest dark stretch and longest no-Earth stretch. Each chip shows an icon-free label and the UTC time, is a button that sets the cursor to that event (and pauses Play), and has a tooltip. Collapse into a count ("+12 more") when there are more than about 8 chips in view; the chip row must not cause layout jumps.

## Acceptance

1. `npm run typecheck`, `npm run lint` and `npm test` exit 0.
2. Browser check (preview server `spaceapps-web`, port 5173): the default south-pole scenario and the Apollo vs Artemis preset; cards show names, badges, countdowns and metrics; the slip slider moves the window and the metrics change; the date input works; the tabs switch; panorama and loupe show the Sun cut by a ridge; chips jump the cursor; the console is clean; Play still runs smoothly (report the same frame cost measurement as in round 1). Screenshots at scale 0.5 only.
3. Report what you could not verify and any spec deviations. Final report in the format of `_common.md`.
