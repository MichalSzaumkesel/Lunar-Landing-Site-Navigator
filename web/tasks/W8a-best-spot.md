# Task W8a: "Find the sunniest spot nearby" (runs after W7c)

Write the files first, then test (see `_common.md`; follow `tasks/UI-guidelines.md`, `RULES-quality.md`). W7c added to the 3D view: moving the lander, a horizon recompute at the new point with the Sun-visible hours delta, and a local sunlight heatmap (`viz3d/localIllum.ts` and its worker client). Read what W7c produced first. This task adds the planner moment: one click finds the best nearby landing point and shows what it gains.

## Writable paths

`src/viz3d/**` (css and tests included). Nothing else.

## Items

1. **Button "Find sunniest spot"** in the 3D view toolbar. It uses the heatmap grid of Sun-visible fraction over the scenario window (compute it if the heatmap toggle is off; reuse the cached grid if on). Search only cells inside the clamped patch interior and within a search radius selector (500 m, 1 km, 2 km; default 1 km; never beyond the patch). Pick the cell with the highest Sun-visible hours; ties go to the cell closest to the original site. Also require the cell to be flat enough: slope under 10 degrees from the terrain heights (pure helper `slopeDeg(grid, i, j, cellSizeM)`), otherwise skip it; if no cell qualifies say "No flat spot found in this radius".
2. **Result.** Animate the camera and the lander to the chosen point (about 1.2 s, ease in-out; no animation when `prefers-reduced-motion`, jump instead). Show a result card: "Moved 340 m to the north-east. Sun visible: 412 h here vs 351 h at the original point (+61 h)." Numbers come from the same horizon recompute used by the move feature, never typed. Buttons "Reset position" and "Compare both points" (the second only toggles showing both values; do not create scenarios). Label "Approximate (terrain patch only)" and keep the synthetic badge for synthetic bundles.
3. **Honesty.** Search needs the terrain heightmap; when the bundle has none show the button disabled with "No terrain data for this site". Wording rule: only "Sun visible"; no power, energy or signal claims.
4. **Cancel and perf.** The search runs in the worker, shows progress, can be cancelled, and never blocks the main thread more than about 50 ms.
5. **Tests.** Pure helpers: slope, argmax with tie rule, radius clamp, result sentence formatting (direction as 8-point compass word, distance rounding to 10 m, signed delta), a synthetic grid with a known best cell, a grid where all cells are too steep.

## Acceptance

`npm run typecheck`, `npm run lint`, `npm test` exit 0. Report per item: done or why not, test counts.
