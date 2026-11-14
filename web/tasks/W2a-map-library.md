# Task W2a: Moon map, site library, shared badges, custom site ids (React + TypeScript)

## Goal

A 2D map of the Moon with the sites on it and a live day/night shading, a site library, a shared badge component, and support for custom coordinate ids in the loader. UI is plain React and SVG/canvas, styled with the theme tokens. You cannot see the browser, so keep the markup simple and follow the guidelines strictly.

Also read `tasks/UI-guidelines.md` (spacing tokens, states, copy, accessibility).

## Writable paths

`src/components/map/**`, `src/components/library/**`, `src/components/badges/**`, `src/lib/customSite.ts`, `src/lib/customSite.test.ts`, `src/lib/loader.ts`, `src/lib/loader.test.ts`. Nothing else (`components/sky`, `timeline`, `scenario` belong to another worker; `state/` and `app/` belong to the lead).

## Read-only references

`src/lib/types.ts`, `src/lib/moonFrame.ts` (`bodyPositionKm`, `elevationGrid`, `terminatorLine`, `subpoint`), `src/lib/loader.ts` (`dataSource`), `src/lib/useSiteBundle.ts`, `src/state/store.ts` (`useAppStore`, actions `updateScenario`, `addScenario`, `setActiveScenario`), `src/state/selectors.ts` (`scenarioCursorMs`), `src/config/dataRange.ts`, `src/app/theme.css` (tokens; add component CSS in new files next to your components).

## Spec

### Custom site ids in the loader

- In `customSite.ts` add `parseCustomSiteId(id: string): { lat: number; lon: number } | null`, the inverse of `customSiteId` (`custom_-89p500_45p000` gives `-89.5`, `45`). Null for anything that does not match or is out of range.
- In `loader.ts`, `loadSite(id)` must accept custom ids: when `parseCustomSiteId(id)` is not null, delegate to `loadCustomSite(lat, lon)` (so the sky plot and every consumer of `useSiteBundle` work for custom points without changes). Keep all current behaviour and tests; add tests for the new paths.

### `components/badges/DataBadges.tsx`

`DataBadges({ synthetic, approximate })` renders the `Synthetic data` badge (`badge badge--synthetic`) and the `Approximate` badge (`badge badge--approximate`), with `title` tooltips: synthetic "Fake data for interface development, not a measurement."; approximate "Real-based data with a known simplification (see the data notes)." Renders nothing when both are false.

### `components/map/MoonMap.tsx` (presentational)

Props: `{ sites: Site[]; selectedSiteIds: string[]; activeSiteId: string | null; shading: { sunElevation: Float32Array; earthElevation: Float32Array; nLat: number; nLon: number } | null; terminator: Array<{ lat_deg: number; lon_deg: number }[]> | null; onSelectSite(id: string): void; onPickPoint(lat: number, lon: number): void; pickMode: boolean }`.
- SVG with `viewBox="0 0 720 360"` (2 px per degree), longitude -180..180 left to right, latitude 90 at the top. Background dark, graticule every 30 degrees with labels (12 px), equator and prime meridian slightly stronger.
- Shading drawn on a `<canvas>` absolutely positioned under the SVG (same box), pixel size `nLon` by `nLat`, scaled with CSS: night (Sun elevation below 0) as a dark translucent overlay; where Earth elevation is below 0 add a light diagonal hatch (draw it into the same canvas by alternating pixels is enough). Redraw only when `shading` changes. Terminator as a thin line in the SVG (one polyline per piece).
- Site markers: circles r=5 with a category colour taken from CSS variables (add `--cat-apollo`, `--cat-clps`, `--cat-commercial`, `--cat-international`, `--cat-artemis_region`, `--cat-custom` to a new `map.css` `:root` block, all with enough contrast on the dark map), selected ones with a ring, the active one filled. Each marker is a focusable `<button>`-like element (`role="button"`, `tabIndex=0`, Enter and Space select, `aria-label` with the site name and coordinates). South-pole sites at latitude below -80 overlap near the bottom edge: add a small "Polar view" inset (a circle, azimuthal projection of the south cap down to -60 degrees, 140 px) placed in the bottom right corner of the map with the same markers, so polar sites are separable; clicking markers works in both.
- When `pickMode` is true the map shows a crosshair cursor and a click anywhere calls `onPickPoint(lat, lon)` (rounded to 0.1 degree; convert pixel to coordinates through the SVG's bounding box, also for the inset: inverse azimuthal projection).
- States: no sites yet shows a skeleton block of the same size.

### `components/map/MapPanel.tsx` (container, default and named export)

Wires everything: loads sites with `dataSource.loadSites()` (loading, error and empty states), reads the store, finds the active scenario, loads its bundle with `useSiteBundle`, computes `shading` with `bodyPositionKm` (Sun and Earth at the cursor time of the active scenario) and `elevationGrid` (90 by 45 cells) and the Sun `terminatorLine`, memoised so the cursor only recomputes the grid (cheap, but do not recompute sites or markers). Behaviour: clicking a marker sets the active scenario's `siteId` (`updateScenario`); a "Compare" button on a selected site (or Shift-click) calls `addScenario({ siteId })`; a "Pick a point" toggle turns on `pickMode` and the click adds a scenario with `customSiteId(lat, lon)`; a small form with latitude and longitude inputs and an "Add custom point" button validates ranges (latitude -90..90, longitude -180..180, finite numbers) with an inline plain-language message ("Latitude must be between -90 and 90.") and then adds the scenario. A note under the form: "Custom points use a smooth horizon and the ephemeris of the nearest site (approximate)." Legend: category colours, night shading, "Earth not in view" hatch, terminator.

### `components/library/SiteLibrary.tsx`

A list of all sites grouped by category (order: apollo, clps, commercial, international, artemis_region, custom), each group collapsible (native `details`/`summary`), a search box filtering by name, mission, agency or country (case-insensitive). Row: name, mission and agency when present, status, coordinates (`lat`, `lon` with 2 decimals and N/S/E/W), landing date when present, a `Source` link (`<a href rel="noopener noreferrer" target="_blank">`, shown only when the url is non-empty, otherwise the text "Mock data, no source"), and two buttons "Use here" (replaces the active scenario's site) and "Compare" (adds a scenario). Disabled states and plain tooltips. Empty search result: "No site matches your search."

## Tests

Pure helpers only: put the pixel-to-coordinate conversion (equirectangular and the polar inset, both directions) in `components/map/projection.ts` with tests (round trips, corners, poles); parsing and validation of the coordinate inputs in `components/map/coords.ts` with tests; `parseCustomSiteId` and the loader's custom delegation as above. Component rendering is not tested.

## Acceptance

`npm run typecheck` and `npm run lint` exit 0 (lint warnings in other files are not yours); `npx vitest run src/components/map src/lib/customSite src/lib/loader` exits 0. Report test counts and list every component and export you created with its props, because the lead will wire them into the app shell.
