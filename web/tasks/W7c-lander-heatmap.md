# Task W7c: move the lander and local sunlight heatmap in the 3D view

Write the files first, then test (see `_common.md`; follow `tasks/UI-guidelines.md`, `RULES-quality.md`). The logic already exists: `viz3d/terrainHorizon.ts` (horizon from a terrain patch at any point) and `viz3d/localIllum.ts` plus its worker client. Wire them into the 3D tab (`viz3d/SurfaceView.tsx`) so the user can show why 500 m matter.

## Writable paths

`src/viz3d/**` and its css/tests only. Nothing else (the 3D tab is already mounted in the card; do not edit `SkyViews.tsx`). Terrain heights come from `useTerrainHeights`; the mocks have a terrain heightmap, real files will replace them later with the same contract shape.

## Items

1. **Move the lander.** In the 3D view the user can click a point on the terrain (raycast on the terrain mesh) or use arrow-key nudges on a focused "Lander position" control (±100 m, Shift ±500 m) to move the lander. Show the offset from the original site in metres and the terrain height there. A "Reset position" button returns it. The lander mesh follows (placed on the surface, aligned to the local normal if the existing code does that).
2. **Horizon recompute.** When the lander moves, compute the horizon mask at the new point from the terrain patch with `terrainHorizon.ts` (in the existing worker if the lib already uses one; never block the main thread more than ~50 ms) and show the resulting "Sun visible hours" for the scenario window next to the original value and the delta (hours, signed). Do not write into the store scenario; this is a local what-if. If the patch is too small near its edge, clamp the move to the patch interior and show "Edge of the terrain data". Label everything "Approximate (terrain patch only)" and keep the synthetic badge when the bundle is synthetic.
3. **Local sunlight heatmap.** A toggle "Sunlight map" paints the terrain patch by Sun-visible fraction over the scenario window (colour scale with a legend, colour-blind-safe sequential ramp plus numeric legend ends; hovering or focusing shows the value of a cell). Computed with `localIllum.ts` in its worker, with a progress indicator and cancel on unmount or scenario change. Sampling resolution chosen so a result arrives in a few seconds on the mock patch; say the resolution in the legend.
4. Wording: only "Sun visible"; never power, energy or signal claims.
5. Tests: pure helpers for offset clamping, nudge steps, delta formatting (sign, one decimal), legend range; worker client behaviour is already tested, do not rewrite it.

## Acceptance

`npm run typecheck`, `npm run lint`, `npm test` exit 0. Report per item: done or why not, test counts.
