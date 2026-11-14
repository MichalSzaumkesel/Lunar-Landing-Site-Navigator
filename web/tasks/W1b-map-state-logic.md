# Task W1b: Moon-fixed frame helpers and shareable URL state (pure TypeScript + tests)

## Goal

(1) Helpers to express the Sun and Earth in a Moon-fixed frame from a site's ephemeris, so a 2D map can show day/night and Earth visibility for any point. (2) Encode and decode the app state to a URL hash, so a link reproduces a comparison.

## Writable paths

`src/lib/moonFrame.ts`, `src/lib/moonFrame.test.ts`, `src/state/urlState.ts`, `src/state/urlState.test.ts`, `src/state/useUrlSync.ts`

## Read-only references

`src/lib/types.ts`, `src/lib/ephem.ts` (`sampleAt`), `src/lib/customSite.ts` (same frame maths: constants `R_MOON_KM`, `L_SUN_KM`, `L_EARTH_KM` are exported, reuse them), `src/state/types.ts`, `src/state/store.ts` (`useAppStore`), `src/config/dataRange.ts` (`MAX_SLIP_DAYS`, `MAX_SCENARIOS`).

## Spec

### `src/lib/moonFrame.ts`

Moon-fixed Cartesian frame: origin at the Moon's centre, `u(lat, lon) = (cos lat cos lon, cos lat sin lon, sin lat)`, east `e = (-sin lon, cos lon, 0)`, north `n = (-sin lat cos lon, -sin lat sin lon, cos lat)` (radians), as in `customSite.ts`.

```ts
export type Vec3 = [number, number, number]
export type Body = 'sun' | 'earth'
/** Position of the body in km from the Moon's centre, from a site's ephemeris at time ms. Null outside the data coverage. */
export function bodyPositionKm(bundle: Pick<SiteBundle, 'site' | 'ephem'>, body: Body, ms: number): Vec3 | null
/** Elevation in degrees of a body at a surface point, from its position in km (no terrain, no refraction). */
export function elevationAt(latDeg: number, lonDeg: number, bodyKm: Vec3): number
/** Latitude and longitude (degrees, longitude -180..180) of the point directly under the body. */
export function subpoint(bodyKm: Vec3): { lat_deg: number; lon_deg: number }
/** Elevation grid, row-major from the north row to the south row, columns from lon -180 to +180 (cell centres). */
export function elevationGrid(bodyKm: Vec3, nLat: number, nLon: number): Float32Array
/** Points of the line where the body elevation is 0, as a polyline per connected piece (lat/lon degrees). */
export function terminatorLine(bodyKm: Vec3, n?: number): Array<{ lat_deg: number; lon_deg: number }>
```

- `bodyPositionKm`: take `sampleAt(ephem, ms)` az/el, convert to the local direction `d = (sin az cos el, cos az cos el, sin el)` in (east, north, up), world direction `w = d.east * e + d.north * n + d.up * u` for the site `(site.lat_deg, site.lon_deg)`, then `P = R_MOON_KM * u + L * w` with `L = L_SUN_KM` for the Sun and `L_EARTH_KM` for the Earth.
- `elevationAt`: `v = bodyKm - R_MOON_KM * u(lat, lon)`, `elevation = asin(clamp((v / |v|) . u))` in degrees.
- `subpoint`: from the direction of `bodyKm` (normalised) to latitude and longitude.
- `elevationGrid`: cell centres: row `r` has latitude `90 - (r + 0.5) * 180 / nLat`, column `c` has longitude `-180 + (c + 0.5) * 360 / nLon`.
- `terminatorLine(bodyKm, n = 181)`: the elevation-0 curve is a circle on the sphere about 90 degrees from the subpoint (for the Sun; for the Earth it is slightly less than 90 degrees because of the finite distance, so compute the angular radius as `acos(R / |bodyKm|)`). Generate `n` points along that circle, return it as one polyline split where the longitude wraps across +-180 (so a map does not draw a line across the whole map).
- Performance: `elevationGrid` for 180 by 90 cells must take under 20 ms.

### `src/state/urlState.ts`

```ts
export interface UrlState { mode: Mode; observerHeightM: ObserverHeightM; scenarios: Array<{ siteId: string; startUtc: string; durationH: number; slipDays: number }>; cursorH: number; speedHPerSec: number }
export function encodeState(s: UrlState): string          // returns the hash string without the leading '#'
export function decodeState(hash: string): Partial<UrlState>   // tolerant: invalid parts are dropped, never throws
```

Format (compact, readable): `m=<s|a>&h=<2|10>&c=<cursorH rounded to 0.1>&v=<speed>&s=<siteId>~<YYYY-MM-DD>~<durationH>~<slipDays>;<next scenario>`. Scenario start is stored as a date (the window start is always 00:00 UTC; encode `startUtc.slice(0, 10)`, decode to `<date>T00:00:00Z`). Decoding rules: `siteId` must match `^[a-z0-9_]{1,64}$`; the date must be a real calendar date; `durationH` an integer 1 to 1440; `slipDays` an integer clamped to +-`MAX_SLIP_DAYS`; at most `MAX_SCENARIOS` scenarios, at least one valid one or the key `scenarios` is omitted; `cursorH` a finite number >= 0; `speed` a positive number; `m` and `h` must be one of the allowed values. A leading `#` is accepted.

### `src/state/useUrlSync.ts`

A React hook `useUrlSync()`: on mount read `window.location.hash`, `decodeState` it and apply the result to the store with `useAppStore.setState` (create fresh scenario ids `sc<number>` that do not clash with existing ones, and set `activeScenarioId` to the first). Afterwards, when the shareable part of the store changes (mode, observer height, scenarios, speed; not the cursor, to avoid rewriting the URL every frame), write the hash with `history.replaceState`, debounced by 300 ms. Also export `shareUrl(): string` returning the current full URL including a hash that contains the cursor as well. No tests for the hook, but it must typecheck.

## Tests

- `moonFrame`: build a tiny ephemeris by hand (3 samples) for a site at lat 0, lon 0 with the Sun straight overhead at the first sample: `subpoint` of the Sun position is about (0, 0), `elevationAt(0, 90, sunKm)` is about 0 (tolerance 0.01), `elevationAt(0, 0, sunKm)` is about 90, the antipode is about -90; `terminatorLine` points have elevation within 0.5 degrees of 0 (Sun) and are split where the longitude wraps; `elevationGrid` cell-centre latitudes and longitudes. An identity test on the real mock `public/data/mock/ephem|horizon/southpole_landed.json` and `sites.json` (read with `node:fs`): `elevationAt(site.lat, site.lon, bodyPositionKm(sun, ms))` equals the ephemeris elevation at that time within 0.02 degrees for the Sun and 0.05 for the Earth, for three different times. Performance bound for the grid.
- `urlState`: round trip for a two-scenario state; garbage input (`'m=x&h=5&s=Bad Id~2027-13-40~0~999'`) gives an empty object or only the valid parts without throwing; clamping of `slipDays`; the 4-scenario cap; leading `#`.

## Acceptance

`npm run typecheck` exits 0; `npx vitest run src/lib/moonFrame src/state/urlState` exits 0. Report test counts and the grid timing.
