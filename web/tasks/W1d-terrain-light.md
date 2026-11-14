# Task W1d: horizon from the terrain patch and local sunlight grid (pure TypeScript + tests)

## Goal

Compute the horizon seen from any point of the 20 km terrain patch (contract section 2.5) and, on top of it, the share of time the Sun is above that horizon for a grid of points. This powers "move the lander 500 m and see what changes". It is an approximation (only terrain inside the patch counts), the UI will label it that way.

## Writable paths

`src/viz3d/terrainHorizon.ts`, `src/viz3d/terrainHorizon.test.ts`, `src/viz3d/localIllum.ts`, `src/viz3d/localIllum.test.ts`, `src/viz3d/localIllum.worker.ts`, `src/viz3d/localIllumClient.ts`

## Read-only references

`src/viz3d/terrain.ts` (`heightAt`, `decodeHeights`; heights are in metres relative to the site, ENU frame, x east, y north, row 0 is north), `src/lib/horizon.ts` (`horizonAt`), `src/lib/ephem.ts` (`ephemCoverage`), `src/lib/types.ts` (`EphemFile`), `../CLAUDE.md` section "Physics & data notes" (horizon formula and lunar radius), `public/data/mock/terrain/` (synthetic example `.bin` and `.json`).

## Spec

### `src/viz3d/terrainHorizon.ts`

```ts
export const R_MOON_M = 1_737_400
export interface HorizonOptions { rays?: number; maxRangeM?: number; stepM?: number }
/** Horizon elevation in degrees for `rays` azimuths (default 720, azimuth i * 360 / rays from north, clockwise) seen from the ENU position (xM, yM) at observerHeightM above the ground there. */
export function horizonFromTerrain(heights: Float32Array, sizePx: number, spacingM: number, xM: number, yM: number, observerHeightM: number, opts?: HorizonOptions): Float32Array
```

- Observer height above the reference: `z0 = heightAt(heights, sizePx, spacingM, xM, yM) + observerHeightM`. Throw an `Error` when the position is outside the grid.
- For each ray, march outward from distance `stepM` (default `spacingM`) in steps of `stepM` up to `maxRangeM` (default: until the ray leaves the grid). At each sample, ground distance `d`, ENU position `x = xM + d sin(az)`, `y = yM + d cos(az)`; stop the ray when the position is outside the grid; height `h = heightAt(...)`. Elevation angle `atan2(h - z0 - d*d / (2 * R_MOON_M), d)`. The ray's horizon is the maximum of these angles over its samples; return degrees. A ray with no sample inside the grid (observer at the very edge) gets the smooth-sphere dip `-degrees(acos(R / (R + observerHeightM)))`.
- Performance: 720 rays from the centre of a 256 by 256 grid at 80 m spacing in under 20 ms. No per-sample allocation.

### `src/viz3d/localIllum.ts`

```ts
export interface LocalIllumInput {
  heights: Float32Array; sizePx: number; spacingM: number
  ephem: EphemFile
  observerHeightM: number
  startMs: number; endMs: number        // window of Sun samples to use, [startMs, endMs)
  gridN: number                         // gridN by gridN points
  extentM: number                       // the grid spans [-extentM/2, +extentM/2] east and north of the site, cell centres
  rays?: number                         // default 360
}
/** pct_sunlit (0..100) for each grid point, row-major from the north row to the south row, columns west to east. */
export function localSunlitGrid(input: LocalIllumInput): Float32Array
```

- For each grid point compute the horizon with `horizonFromTerrain` (with the given `rays`, `maxRangeM` default until the grid edge) and count the ephemeris samples with sample time in `[startMs, endMs)` and inside the coverage where `sun.el - horizonAt(mask, 360 / rays, sun.az) >= 0`; result `count / total * 100` (0 when no sample qualifies). Points outside the terrain grid get `NaN`. Use `horizonAt` from `src/lib/horizon.ts` with the mask as a plain number array (convert the `Float32Array` once per point, or write a tiny local interpolation helper with the same wrap-around behaviour; do not duplicate more than that).
- Performance: 41 by 41 points, 360 rays, 30 days of samples, in under 3 s (the test bound may be loose).

### Worker wrapper

`src/viz3d/localIllum.worker.ts` receives a `LocalIllumInput` and posts back the `Float32Array` (transfer the buffer). `src/viz3d/localIllumClient.ts` exports `localSunlitGridAsync(input): Promise<Float32Array>` with the same pattern as `src/lib/windowMapClient.ts` if that file exists (otherwise: create a `Worker` with `new URL('./localIllum.worker.ts', import.meta.url)` and `{ type: 'module' }`, fall back to the pure function when `Worker` is undefined, a newer call cancels the older one with `Error('cancelled')`, reject on worker error). No tests for the worker or client, but they must typecheck with narrow typing (no new tsconfig lib).

## Tests (vitest)

- `horizonFromTerrain`: a flat grid (all zeros) from the centre with `observerHeightM = 2` gives about `-0.0864` degrees for every ray (tolerance 0.01); a flat grid with a 100 m high wall (a column of cells) 1000 m east of the observer gives about `atan((100 - 2 - 1000^2 / (2 * 1737400)) / 1000)` degrees on the east ray (tolerance 0.05) and the flat value on the west ray; the output length equals `rays`; throws for a position outside the grid; ray `i` points to azimuth `i * 360 / rays` (east ray index is `rays / 4`). A timing test on the real mock `.bin` (decode with `decodeHeights`) with a loose bound of 200 ms.
- `localSunlitGrid`: flat terrain and a hand-built ephemeris whose Sun is above the horizon in exactly 25 percent of 24 samples gives 25 at every point; a wall to the east and a Sun that is only ever east of the site and low gives lower values on points just west of the wall than on points east of it; `NaN` for points outside the grid; output length `gridN * gridN`; north row first.

## Acceptance

`npm run typecheck` exits 0; `npx vitest run src/viz3d/terrainHorizon src/viz3d/localIllum` exits 0. Report test counts and the measured times for 720 rays and for the 41 by 41 grid.
