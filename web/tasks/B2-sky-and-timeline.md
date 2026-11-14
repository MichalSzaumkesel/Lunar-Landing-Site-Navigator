# Task B2+B3: polar sky plot and timeline (React + D3), role `ui-core`

You are the `ui-core` teammate of the scope B lead (working directory: the repo root, app in `web/`). This is the hero of the demo: a jury looks at it for 2 to 3 minutes. Read `CLAUDE.md`, `docs/contract.md` (sections 1 to 3), `docs/scope-B-web.md` and `web/DELEGATION.md` first.

## 1. Goal

Replace the two placeholders with real components, wired to the store and to the loaded data:

- `components/sky/SkyPlot.tsx`: polar sky plot with the terrain horizon silhouette, Sun and Earth tracks over the scenario window, and the current positions at true disc size.
- `components/timeline/Timeline.tsx`: bands for Sun visible, Earth in view and both over the scenario window, with the shared time cursor.

## 2. Writable paths

- `web/src/components/sky/**`, `web/src/components/timeline/**`
- `web/src/lib/useSiteBundle.ts` (new hook, see 4.1) and its test
- `web/src/components/scenario/ScenarioBoard.tsx` (only to pass extra props or add small wiring; keep the exported names and props)

Do not touch `state/`, `app/`, `config/`, `lib/types.ts`, `lib/loader.ts`, `lib/customSite.ts`, `lib/horizon.ts`, `lib/ephem.ts`, `lib/metrics.ts` (they are done and owned by the lead; call them, do not edit them). If something there is wrong or missing, write it under OPEN in your report.

## 3. Read-only references

- `web/src/lib/types.ts`, `web/src/state/store.ts`, `web/src/state/selectors.ts`, `web/src/config/dataRange.ts`
- `web/src/lib/horizon.ts` (`horizonAt`, `normalizeAz`), `web/src/lib/ephem.ts` (`sampleAt`, `ephemCoverage`), `web/src/lib/metrics.ts` (`bodyFraction`, `computeMetrics`), `web/src/lib/loader.ts` (`dataSource`)
- `web/src/app/theme.css` (CSS variables; add component styles in a new file next to your components, for example `sky.css`, and import it from the component)
- Mock data in `web/public/data/mock/` (synthetic, three sites). Use it to see your work in the browser.

## 4. Spec

### 4.1 Data hook

`src/lib/useSiteBundle.ts`: `useSiteBundle(siteId: string): { status: 'loading' | 'ready' | 'error'; bundle: SiteBundle | null; error: string | null }`, using `dataSource.loadSite`. Cancel stale updates on unmount or id change.

### 4.2 `SkyPlot({ scenarioId })`

- Reads the scenario, the shared `cursorH` and `observerHeightM` from the store. Cursor time: `scenarioCursorMs(scenario, cursorH)`.
- Render SVG with React; use D3 only for scales and path generators (`d3-scale`, `d3-shape`), no imperative DOM manipulation. `viewBox` square (600 by 600), scales to the container width, maximum 560 px.
- Mapping: azimuth 0 at the top, clockwise, so `x = cx + r * sin(az)`, `y = cy - r * cos(az)` (north up, east right). Radius encodes elevation: elevation 0 is the outer rim, the centre is `zoomEl` degrees. Do not use a fixed 90 degrees: at the south pole everything happens within a few degrees of the horizon. Choose `zoomEl` from `[5, 10, 20, 45, 90]` as the smallest level that is at least 1.15 times the largest of: the highest horizon value of the selected mask, the highest Sun and Earth elevation inside the scenario window. Show the chosen scale in the corner ("scale 0 to 10 deg").
- Grid: elevation rings with labels, azimuth spokes every 30 degrees, labels N E S W on the rim.
- Terrain: the horizon curve from `horizon.masks[String(observerHeightM)]` (720 points, clamp radius so values below 0 sit on the rim). Fill the area between the rim and the curve as terrain (dark grey, evenodd path: rim circle plus horizon polygon), stroke the curve. Draw terrain after the discs so it covers them where the horizon is higher.
- Tracks: polyline of the Sun and of Earth over the scenario window (hourly samples from `ephem`, only samples inside the window and coverage). Break the line where the body is more than 2 degrees below the horizon or when the azimuth jumps by more than 180 degrees between samples. Thin lines, Sun in `var(--sun)`, Earth in `var(--earth)`.
- Current positions at the cursor from `sampleAt`: draw discs at true angular size (`sun_ang_radius_deg`, `earth_ang_radius_deg`) converted to pixels with the current scale, with a minimum visible radius of 4 px (draw a thin ring at true size on top when the minimum applies). If a body is more than 1 degree below the horizon, draw a small hollow marker on the rim at its azimuth instead of a disc.
- Readout under the plot (use the `readout` class): for Sun and Earth the azimuth, the elevation, the clearance above the terrain (`el - horizonAt(...)`), the visible disc fraction (`bodyFraction`) in percent, and a state text. Wording is fixed: "Sun visible" when the fraction is at least 0.5 (the contract's `sunlit`), otherwise "Sun below horizon"; "Earth in view" or "Earth below horizon". Never write "power available" or "link available". Every number has a unit, and a `title` tooltip with the contract definition.
- States: while loading show a skeleton box of the same size; on error show the message; when the cursor is outside the data coverage (`sampleAt` returns `null`) show "Outside data range" over the plot and skip the discs. A badge `Synthetic data` (class `badge badge--synthetic`) when `bundle.synthetic`, `Approximate` (`badge badge--approximate`) when `bundle.approximate`.
- Accessibility: `role="img"` on the svg with an `aria-label` summarising site, time, Sun state and Earth state; the readout is real text.
- Smoothness: the cursor moves 60 times per second during Play. Do not recompute tracks or the terrain path on every frame: memoise them on the bundle, the observer height and the scenario window; only the discs and the readout depend on the cursor.

### 4.3 `Timeline({ scenarioId })`

- Three thin bands over the scenario window (one sample per hour): Sun visible, Earth in view, both. Draw merged runs of equal state as rectangles (SVG), not one element per hour. Colours: Sun `var(--sun)`, Earth `var(--earth)`, both `var(--both)`; off state a dim neutral. Text labels at the left of each band.
- Day ticks and date labels (UTC) on an axis; keep labels readable at 30 days and at 60 days.
- The shared cursor: a vertical line across the bands at `cursorH`. Dragging or clicking on the bands calls `setCursorH` (use pointer events with pointer capture; map x to hours; clamp to the window). While dragging, set `playing` to false. Keyboard: the focusable timeline moves the cursor by 1 hour with the arrow keys and by 24 hours with Shift plus arrow keys.
- Samples outside the data coverage are drawn as a hatched "no data" band.
- Uses the same `useSiteBundle` hook and the selected observer height. Computing the three state arrays happens once per bundle, height and window (memoised).
- The global Play button and speed live in `app/Transport.tsx`; do not duplicate them.

### 4.4 Quality

- TypeScript strict as configured (`verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`). Code comments in English, short.
- Dark, high contrast, readable on a projector. Minimum font size 12 px inside the svg.
- Add a few vitest tests for the pure helpers you write (for example the `zoomEl` choice, the polar mapping, the run merging). Keep UI components free of heavy logic: put helpers in `src/components/sky/geometry.ts` and `src/components/timeline/runs.ts`.

## 5. Acceptance

1. `npm run typecheck`, `npm test` and `npm run lint` pass in `web/`.
2. In the browser (dev server on port 5173 started with the `spaceapps-web` preview): the default scenario (`southpole_landed`) shows a jagged horizon, the Sun disc gets cut by ridges while Play runs, the readout flips between "Sun visible" and "Sun below horizon", and the Apollo vs Artemis preset shows two sky plots side by side with different scales. Take screenshots as proof and check the console for errors.
3. Play stays smooth (no visible stutter) with the Apollo vs Artemis preset.
4. Nothing synthetic is unlabelled.

## 6. Forbidden

- No git commands that change state (no commit, branch, push, stash, reset). The human forbade commits until 09:00.
- No edits outside the Writable paths. No new npm packages.
- Do not spawn further agents.

## 7. Final report

End with exactly:

```
STATUS: done | blocked
FILES: <one path per line>
COMMANDS: <command> -> <exit code>
NUMBERS: <what you measured: test counts, frame behaviour, zoom levels seen>
OPEN: <questions, bugs seen in files you do not own, deviations from the spec, or "none">
```
