# Task B1b: data loader and approximate custom site (TypeScript + tests)

You are a worker for the scope B lead of a Vite + React + TypeScript project (working directory: `web/`). Follow this brief exactly. Where it is silent, choose the simplest option and list the choice under OPEN in your final report.

## 1. Goal

Implement the per-site data loader (real files win over mock files, lazy, cached) and the client-side approximation for custom coordinates, with unit tests. No React, no DOM rendering.

## 2. Writable paths

- `src/lib/loader.ts`, `src/lib/loader.test.ts`
- `src/lib/customSite.ts`, `src/lib/customSite.test.ts`

## 3. Read-only references

- `src/lib/types.ts`: `SiteDataSource`, `SiteBundle`, `Provenance`, `SitesFile`, `HorizonFile`, `EphemFile`, `TerrainFile`, `CustomSiteResponse`, `Site`, `Meta`. Import with `import type`. Do not redeclare or edit them.
- `../docs/contract.md` sections 1, 2 and 2.7 (files, mocks, fallback rule).
- `src/env.d.ts` (the env variables `VITE_USE_MOCK`, `VITE_API_URL`).
- `tsconfig.app.json` rules apply: `verbatimModuleSyntax`, `erasableSyntaxOnly` (no enums, no parameter properties), `noUnusedLocals`.
- Mock files may or may not exist yet in `public/data/mock/`; another worker is generating them. Your tests must not depend on them (use an injected fake `fetch`).

## 4. Spec

### 4.1 `src/lib/loader.ts`

```ts
export interface LoaderOptions {
  fetchImpl?: typeof fetch        // default: globalThis.fetch
  baseUrl?: string                // default: import.meta.env.BASE_URL
  useMock?: boolean               // default: import.meta.env.VITE_USE_MOCK === '1'
  apiUrl?: string | null          // default: import.meta.env.VITE_API_URL ?? null
  apiTimeoutMs?: number           // default: 4000
}
export function createDataSource(opts?: LoaderOptions): SiteDataSource
export const dataSource: SiteDataSource   // createDataSource() with defaults
```

URLs (relative to `baseUrl`, which ends with `/`): real files at `data/sites.json`, `data/horizon/<id>.json`, `data/ephem/<id>.json`, `data/terrain/<id>.json` (the `.bin` is at the `bin` path from the terrain JSON, resolved against `data/`); mock files at the same paths under `data/mock/`.

**Missing-file trap.** The Vite dev server and many static hosts answer a missing file with HTTP 200 and `index.html`. A fetch counts as "file present" only when the status is OK **and** the body parses as JSON (for the `.bin`, when the status is OK and the content type does not contain `text/html`). Anything else (404, HTML, parse error, network error) means "absent", never an exception.

`loadSites()`:
- Fetch real `sites.json` and mock `sites.json`. With `useMock` only the mock one.
- Merge by `id`: a real entry replaces a mock entry with the same id; mock-only ids are kept. Order: real sites first (file order), then mock-only sites.
- The returned `meta` is the real file's meta when it exists, otherwise the mock's. Cache the promise. If both are absent, reject with an `Error` with a clear message.

`loadSite(siteId)`:
- Cached promise per id. Reject (and do not cache the failure) for an unknown id or when neither real nor mock data has both horizon and ephemeris.
- Real wins per site: if real `horizon/<id>.json` and `ephem/<id>.json` are both present (and `useMock` is false), the provenance is `'real'`, otherwise the mock pair is used and the provenance is `'mock'`. Never mix a real horizon with a mock ephemeris.
- The `site` record comes from the merged `loadSites()` list (so it needs the id to be there).
- Terrain is optional: try real then mock (same real-wins rule, independent of the horizon decision); `null` when absent. Terrain bin bytes are not loaded by the loader.
- `synthetic` is true if any loaded file's `meta.synthetic` is true; `approximate` likewise for `meta.approximate`.
- Validate shapes minimally: `horizon.masks` must contain at least one key and every mask must have `horizon.n` entries; `ephem.sun.az/el` and `ephem.earth.az/el` must all have `ephem.count` entries. A failing real pair counts as absent (fall back to mock). A failing mock pair rejects.

`loadCustomSite(lat, lon)`:
- Reject for non-finite values, `lat` outside `[-90, 90]` or `lon` outside `[-180, 180]`.
- The id is `custom_<lat>_<lon>` with both numbers formatted with 3 decimals, `-` kept, `.` replaced by `p`, for example `custom_-89p500_45p000`.
- If `apiUrl` is set and `useMock` is false: `GET <apiUrl>/api/custom-site?lat=<lat>&lon=<lon>` (strip a trailing `/` from `apiUrl`) with an `AbortController` timeout of `apiTimeoutMs`. Accept the response only if it parses as `CustomSiteResponse` and passes the same shape validation as above. Build a bundle with provenance `'custom_api'`, `terrain: null`, the flags from the metas. The site is the response `site` merged over defaults (name `Custom site`, `category: 'custom'`, nulls for the optional fields, `status: 'planned'`, `source: { title: 'User-entered coordinates', url: '' }`, `notes: ''`).
- On any failure (network error, timeout, non-OK status, bad body) or when there is no `apiUrl`: fall back to `approximateCustomSite(lat, lon, reference)` where `reference` is the bundle of the nearest curated site: take `loadSites()`, pick the site with the smallest great-circle distance (use the haversine formula on lat/lon, ignore `custom` category sites), then `loadSite(thatId)`. Reject if there are no sites.
- Cache custom bundles by id.

### 4.2 `src/lib/customSite.ts`

```ts
export function approximateCustomSite(lat: number, lon: number, reference: SiteBundle): SiteBundle
```

Idea: the Sun and Earth are far away, so their direction in the Moon-fixed frame is almost the same for every site. Take the reference site's az/el series, convert them to Moon-fixed vectors, and re-project them into the custom site's local frame, including the position shift of the observer.

Constants: `R_MOON_KM = 1737.4`, `L_SUN_KM = 149597870.7`, `L_EARTH_KM = 384400`.

For a site at latitude `phi` and longitude `lam` (radians), the unit vectors in a Moon-fixed Cartesian frame are:
- up `u = (cos phi cos lam, cos phi sin lam, sin phi)`
- east `e = (-sin lam, cos lam, 0)`
- north `n = (-sin phi cos lam, -sin phi sin lam, cos phi)`

For each sample and each body (sun with `L = L_SUN_KM`, earth with `L = L_EARTH_KM`):
1. Local direction at the reference site from az/el (degrees): `d = (sin az cos el, cos az cos el, sin el)` as (east, north, up) components.
2. World direction `w = d.east * e_ref + d.north * n_ref + d.up * u_ref`.
3. Body position relative to the Moon centre: `P = R_MOON_KM * u_ref + L * w`.
4. Vector from the custom site: `v = P - R_MOON_KM * u_cust`; normalise it to `v_hat`.
5. Local components at the custom site: `east' = v_hat . e_cust`, `north' = v_hat . n_cust`, `up' = v_hat . u_cust`; `el' = asin(clamp(up', -1, 1))` in degrees, `az' = atan2(east', north')` in degrees normalised to `[0, 360)`.

Precompute the two basis sets once, not per sample. Round outputs to 3 decimals.

Output bundle:
- `site`: id `custom_<lat>_<lon>` (same formatting as the loader), `name` `Custom site (<lat>, <lon>)` with 3 decimals, `category: 'custom'`, `mission`, `agency`, `country`, `elevation_m`, `landing_date_utc`, `region_radius_km` all `null`, `lat_deg`, `lon_deg` as given, `status: 'planned'`, `source: { title: 'User-entered coordinates', url: '' }`, `notes` saying that the horizon is a smooth sphere and the ephemeris is derived from the reference site `<id>`.
- `horizon`: same `az_step_deg` (0.5), `n` 720, `observer_heights_m` [2, 10]; each mask is 720 copies of `-dip(h)` in degrees where `dip(h) = degrees(acos(R / (R + h/1000)))` with `R = 1737.4` and `h` in metres, rounded to 3 decimals (about -0.086 for 2 m and -0.193 for 10 m). `dem` omitted, `uncertainty_deg` omitted.
- `ephem`: same `start_utc`, `step_minutes`, `count`, `sun_ang_radius_deg`, `earth_ang_radius_deg` as the reference; new `sun` and `earth` tracks. `site_id` is the custom id.
- `meta` on both files: `contract_version` copied from the reference, `generated_utc` now (`new Date().toISOString()` without milliseconds), `generator: 'web/src/lib/customSite.ts'`, `synthetic` copied from the reference (so a mock reference stays synthetic), `approximate: true`, `inputs`: a first entry `{ name: 'Smooth-sphere horizon', url: '', notes: 'No terrain; curvature dip only' }`, a second entry `{ name: 'Ephemeris rotated from <reference site id>', url: '', notes: 'Sun and Earth positions re-projected from the reference site; distances approximated by constants' }`, then the reference ephemeris `meta.inputs`.
- `terrain: null`, `provenance: 'custom_approx'`, `synthetic` and `approximate` flags consistent with the metas.

### 4.3 Tests (vitest, `npm test`)

Use a fake `fetch` (a function returning `Response` objects) and small hand-built fixtures (a 720-sample mask, an ephemeris with 3 to 5 samples). No real network.

`loader.test.ts`:
- real files win over mock for the same id; mock used when real is absent; no mixing of a real horizon with a mock ephemeris.
- HTML with status 200 counts as absent (the trap above).
- `useMock` forces mocks.
- `loadSites` merges by id and keeps mock-only ids; caches the promise (the fetch count does not grow on a second call).
- `loadSite` caches; rejects for an unknown id; shape validation failures fall back.
- `loadCustomSite`: rejects invalid coordinates; id formatting; uses the API response when valid (provenance `custom_api`); falls back to the approximation on a 500, on bad JSON, and on a timeout (use `vi.useFakeTimers()` and a fetch that never resolves until aborted, with `apiTimeoutMs` small).

`customSite.test.ts`:
- Identity: a custom site at the reference coordinates reproduces the reference az/el within 0.01 degrees (Sun) and 0.05 degrees (Earth, allow for the constant-distance approximation).
- Geometry: reference at lat 0, lon 0 with the Sun at elevation 90; a custom site at lat 0, lon 90 sees that Sun at elevation about 0 (tolerance 0.01 degrees).
- The horizon masks have 720 entries of about -0.086 (2 m) and -0.193 (10 m).
- Flags: `approximate` is true; `synthetic` follows the reference; provenance is `custom_approx`.

## 5. Acceptance

1. `npm run typecheck` exits 0.
2. `npx vitest run src/lib/loader src/lib/customSite` exits 0 (run only your own test files). Report the number of passing tests per file. (Another worker is writing `horizon`, `ephem` and `metrics` files in `src/lib/` at the same time; ignore typecheck errors in files you do not own, but name them.)
3. No change to any file outside the Writable paths.

## 6. Forbidden

- No git commands that change state (no commit, branch, push, stash, reset).
- No edits outside the Writable paths. Do not edit `src/lib/types.ts`; if a type is missing or wrong, say so under OPEN.
- No new npm packages. No real network access in tests.

## 7. Final report

End with exactly:

```
STATUS: done | blocked
FILES: <one path per line>
COMMANDS: <command> -> <exit code>
NUMBERS: <test counts per file>
OPEN: <questions or deviations from the spec, or "none">
```
