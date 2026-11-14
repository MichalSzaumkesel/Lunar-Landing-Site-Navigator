# Task W2b: window map and mission rules form (React + TypeScript)

## Goal

The flagship comparison view: a grid of sites (rows) by landing dates (columns) coloured by how well a mission fits, plus the form for the mission rules. Clicking a cell opens that site and date as a scenario. You cannot see the browser, so keep markup simple and follow the guidelines strictly.

Also read `tasks/UI-guidelines.md`.

## Writable paths

`src/components/finder/**` only. (`components/sky`, `timeline`, `scenario`, `map`, `library`, `badges` belong to other workers; `state/`, `app/` and `lib/` belong to the lead.)

## Read-only references

`src/lib/windowMap.ts` and `windowMapClient.ts` (`computeWindowMapAsync`, `WindowMapRow`: read the types), `src/lib/finder.ts` (`findWindows`), `src/lib/loader.ts` (`dataSource`), `src/lib/types.ts` (`MissionRules`, `LandingWindow`, `SiteBundle`), `src/state/store.ts` (`useAppStore`: `missionRules`, `setMissionRules`, `observerHeightM`, `scenarios`, `addScenario`, `updateScenario`), `src/config/dataRange.ts`, `src/app/theme.css`.

## Spec

### `components/finder/MissionRulesForm.tsx`

Controlled form bound to `missionRules` in the store (`setMissionRules(patch)`, ignore `observerHeightM` there, it is set elsewhere). Fields, each with a visible label, unit and a `title` tooltip explaining it in plain language and the contract meaning:
- Mission length (hours, 1 to 1440, shown also as days).
- Minimum share of time with Sun visible (percent, 0 to 100).
- Longest dark stretch allowed (hours, 0 to 1440).
- Earth in view at landing (checkbox).
- Minimum share of time with Earth in view (percent, 0 to 100).
- Minimum Sun elevation at landing (degrees, optional; empty means no rule).
Quick presets as buttons: "Short stay, 3 days" (72 h, 80%, 12 h, Earth at landing, 60%), "One week" (168 h, 70%, 36 h, Earth at landing, 50%), "Lunar day, 14 days" (336 h, 50%, 120 h, no Earth at landing, 30%). Validation: invalid input keeps the previous valid value in the store and shows an inline message in plain language; numbers are never `NaN`. A "Reset to example mission" button restores the store default (240 h, 70%, 48 h, Earth at landing, 50%). Observer height is shown as read-only text ("Observer height 2 m, change it in the top bar").

### `components/finder/WindowMap.tsx` (container, default and named export)

- Loads the site list with `dataSource.loadSites()` and every site's bundle with `dataSource.loadSite(id)` lazily, sequentially in small batches of 3, showing "Loading data for N of M sites" with a progress bar; sites that fail to load are skipped and listed as "Not available: <name>" under the grid. Custom sites (category `custom`) are not included.
- Computes `computeWindowMapAsync(inputs, { ...missionRules, observerHeightM }, { dayStepH: 24 })` whenever the loaded bundles, the rules or the observer height change (debounce rule edits by 250 ms; a stale computation is cancelled by the client; ignore a rejection with message `cancelled`).
- Draws the grid on a `<canvas>` (device-pixel-ratio aware): one row per site (row height 28 px, label column on the left drawn as HTML for accessibility, not on the canvas), one column per landing day (about 760); column width scales to the container, minimum 1 px. Cell colour: `valid === 1` green (the theme's both colour) with intensity by `pctSunlit`; `valid === 0` dark neutral with a faint tint by `pctSunlit`; `valid === 255` (interval outside the data) drawn as a hatch pattern. Month tick labels (UTC, "Mar 2027") on top, a vertical line for today's scenario cursor date is not needed.
- A legend: valid / not valid / no data, and the rule summary in one sentence ("Mission 10 days, Sun visible at least 70%, dark stretch at most 48 h, Earth in view at landing and at least 50% of the time").
- Hover (pointer move over the canvas) shows a tooltip card with site, landing date (UTC), validity, Sun visible %, Earth in view %, longest dark stretch (hours). Keyboard: the canvas wrapper is focusable (`tabIndex=0`) and arrow keys move a highlighted cell (left/right one day, up/down one site, Shift+arrow a week), Enter activates; an `aria-live="polite"` line announces the highlighted cell in words.
- Click or Enter on a cell: `addScenario({ siteId, startUtc: '<date>T00:00:00Z' })` when fewer than 4 scenarios exist, otherwise `updateScenario` of the active scenario; show a short confirmation line "Opened <site> from <date>".
- Under the grid, per site, the list of valid windows from `findWindows` (compute from the same bundles, memoised; show at most 5 per site with "+N more"): "12 Mar 2027 to 19 Mar 2027 (landing times)". When a site has none: "No landing window with these rules." Add a "Best site" sentence on top: the site with the largest total number of valid days, or "No site fits these rules. Relax a rule below." when all are zero.
- States: loading (progress), error (plain text with a "Try again" button), empty (no sites). The component fits a container of any width and does not cause horizontal page scroll (the grid scales).

### Pure helpers

Put colour mapping, cell lookup from pointer position, keyboard navigation, window formatting and the "best site" choice in `components/finder/windowMapView.ts` with tests (no DOM).

## Acceptance

`npm run typecheck` and `npm run lint` exit 0; `npx vitest run src/components/finder` exits 0. Report test counts and list every exported component with its props for the lead's wiring.
