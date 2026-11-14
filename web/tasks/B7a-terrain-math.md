# Task B7a: terrain decoding and mesh geometry (pure TypeScript + tests)

You are a worker for the scope B lead of a Vite + React + TypeScript project (working directory: `web/`). Follow this brief exactly. Where it is silent, choose the simplest option and list the choice under OPEN in your final report.

## 1. Goal

Pure helper functions that turn the contract's terrain heightmap (`terrain/<id>.json` + `.bin`) into mesh data and sun/Earth direction vectors for a 3D view. A later task builds the Three.js scene on top of these; your code must not import `three`, React or the DOM.

## 2. Writable paths

- `src/viz3d/terrain.ts`, `src/viz3d/terrain.test.ts`

## 3. Read-only references

- `../docs/contract.md`, section 2.5 (terrain format) and section 1 (conventions).
- `src/lib/types.ts`: `TerrainFile`. Import with `import type`; do not edit.
- `public/data/mock/terrain/` has three real example files (`<id>.json` and `<id>.bin`, synthetic). Your tests may read them from disk with `node:fs` (resolve the path from `import.meta.url`), but also include tests on tiny hand-made inputs.
- `tsconfig.app.json` rules apply: `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`. Use the same relative import style as `src/lib/loader.ts` (no `.ts` extension). Node types are available for tests (`@types/node`).

## 4. Spec

Frame: local East-North-Up (ENU) at the site, in metres: `+x` east, `+y` north, `+z` up. The site is at the centre pixel `(size_px / 2, size_px / 2)`. Row 0 of the `.bin` is the **north** edge, column 0 is the **west** edge.

```ts
/** Decode the .bin (uint16 little-endian, row-major) into heights in metres relative to the site (site at z = 0). */
export function decodeHeights(bin: ArrayBuffer, t: Pick<TerrainFile, 'size_px' | 'height_min_m' | 'height_max_m' | 'site_height_m'>): Float32Array

/** URL of the .bin for a loaded terrain file. Mock terrain (meta.synthetic) lives under data/mock/. */
export function terrainBinUrl(baseUrl: string, t: Pick<TerrainFile, 'bin' | 'meta'>): string

export interface TerrainMesh {
  positions: Float32Array   // 3 floats per vertex (x, y, z) in ENU metres, z already multiplied by verticalExaggeration
  normals: Float32Array     // 3 floats per vertex, unit length, computed after the exaggeration
  uvs: Float32Array         // 2 floats per vertex in 0..1 (u west to east, v south to north)
  indices: Uint32Array      // 3 per triangle, counter-clockwise when seen from above (+z)
  vertexCount: number
  triangleCount: number
  zMin: number              // after exaggeration
  zMax: number
}
export function buildTerrainMesh(heights: Float32Array, sizePx: number, spacingM: number, verticalExaggeration?: number): TerrainMesh

/** Unit direction in ENU for an azimuth (from north, clockwise) and an elevation, both in degrees. */
export function directionEnu(azDeg: number, elDeg: number): [number, number, number]

/** Height of the terrain above the site at an ENU position (x east, y north, metres), bilinear; null outside the grid. */
export function heightAt(heights: Float32Array, sizePx: number, spacingM: number, x: number, y: number): number | null
```

Details:
- `decodeHeights`: `h = height_min_m + v / 65535 * (height_max_m - height_min_m) - site_height_m`. Length check: throw an `Error` when `bin.byteLength !== size_px * size_px * 2`. Use `DataView` with little-endian reads (do not rely on the platform's endianness).
- `terrainBinUrl`: `baseUrl` ends with `/` (add one if missing). Result `<baseUrl>data/<bin>` for real terrain and `<baseUrl>data/mock/<bin>` when `t.meta.synthetic` is true.
- `buildTerrainMesh`: one vertex per pixel (`sizePx * sizePx` vertices), vertex of row `r` and column `c`: `x = (c - sizePx / 2) * spacingM`, `y = (sizePx / 2 - r) * spacingM`, `z = heights[r * sizePx + c] * verticalExaggeration` (default 1). `uvs`: `u = c / (sizePx - 1)`, `v = 1 - r / (sizePx - 1)`. Two triangles per grid cell, `(sizePx - 1)^2 * 2` triangles; winding counter-clockwise seen from above. Normals: per-vertex, computed from central differences of the exaggerated heights (one-sided at the border), normalised, with `z` component positive.
- `directionEnu`: `(sin az * cos el, cos az * cos el, sin el)`.
- `heightAt`: bilinear interpolation of `heights` at the ENU position. Position to fractional pixel: `col = x / spacingM + sizePx / 2`, `row = sizePx / 2 - y / spacingM`. Return `null` when `col` or `row` is outside `[0, sizePx - 1]`.
- Performance: `buildTerrainMesh` for `sizePx = 256` must take well under 100 ms. Allocate typed arrays once; no per-vertex object allocation.

### Tests (vitest)

- `decodeHeights`: a 2 by 2 hand-made `.bin` (values 0, 65535, 32768, 0) with known min, max and site height; wrong byte length throws; the real mock `.bin`: the value at the centre pixel decodes to about 0 (within one quantisation step) because the site height is subtracted.
- `terrainBinUrl`: real versus synthetic, with and without a trailing slash.
- `buildTerrainMesh`: on a flat 3 by 3 grid the normals are `(0, 0, 1)`; on a plane tilted 45 degrees towards the east the normals tilt accordingly (negative `x`, positive `z`); the vertex count and triangle count; vertex positions at the corners (north-west corner has negative `x` and positive `y`); the winding gives an upward geometric normal for every triangle on a flat grid; `verticalExaggeration = 2` doubles `zMax`; indices stay below `vertexCount`.
- `directionEnu`: north horizon gives `(0, 1, 0)`, east gives `(1, 0, 0)`, zenith gives `(0, 0, 1)`; unit length for random-looking angles.
- `heightAt`: exact at a pixel, bilinear midpoint, `null` outside.
- One test running `buildTerrainMesh` on a real mock `.bin` and asserting that it finishes in under 500 ms (loose bound).

## 5. Acceptance

1. `npm run typecheck` exits 0 (ignore and name errors in files you do not own).
2. `npx vitest run src/viz3d` exits 0. Report the number of passing tests and the measured mesh time.
3. No change to any file outside the Writable paths.

## 6. Forbidden

- No git commands that change state (no commit, branch, push, stash, reset).
- No edits outside the Writable paths. Do not edit `types.ts`.
- No new npm packages (do not import `three`). No network access.

## 7. Final report

End with exactly:

```
STATUS: done | blocked
FILES: <one path per line>
COMMANDS: <command> -> <exit code>
NUMBERS: <test count, measured mesh build time>
OPEN: <questions or deviations from the spec, or "none">
```
