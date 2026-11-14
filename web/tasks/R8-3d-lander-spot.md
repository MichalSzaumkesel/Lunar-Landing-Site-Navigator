# Review R8: 3D view additions (move lander, sunlight heatmap, sunniest spot, camera)

Read `tasks/_review.md` first (read-only rules; report file `tasks/reviews/R8-3d-lander-spot.md`, created early and appended as you go; about 50 tool calls in total).

Scope (new since the last review): `src/viz3d/landerHelpers.ts`, `heatmapTexture.ts`, `localIllumClient.ts`, `localIllum.ts`, `bestSpot.ts`, `bestSpot.worker.ts`, `bestSpotClient.ts`, `scene.ts`, `SurfaceView.tsx`, `src/components/demo/cameraControl.ts`.

Hunt for:
1. Correctness: horizon recompute at the moved lander (coordinate frame, patch edge clamp, east/north sign, units metres vs cells), slope computation and the 10 degree flat constraint (cell size, edges), argmax and the tie rule, the search radius vs patch interior, "Sun visible hours" definition equals the contract metric (visible disc fraction, clearance rule) and equals what the card metrics show for the original point (is the "original point" value the same number as the card's, or computed differently?), the sentence generator (direction word, rounding, sign), animation (reduced motion, cancel on input, restart while animating), results when terrain is missing or the patch is tiny.
2. Resource handling: workers terminated on unmount and on scenario change, message ordering (stale results applied to a newer request), WebGL disposal (geometry, textures, materials, renderer) on tab switch and unmount, listeners removed, memory growth when the heatmap toggles repeatedly.
3. Performance: main thread budget during search and heatmap, shadow map updates, per-frame allocations.
4. Wording rule violations: any user-visible text claiming power, energy, signal or link availability, or a fact not computed from data; honest labels for synthetic and approximate data present in every result card.
Rank findings by realistic impact on a live jury demo. Give each finding the fix in a few lines.
