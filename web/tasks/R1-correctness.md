# Review R1: correctness and robustness

Read `tasks/_review.md` first. Report file: `tasks/reviews/R1-correctness.md` (create the folder if needed).

Scope: `src/lib/**`, `src/state/**`, `src/components/**`, `src/viz3d/**` (skip tests unless a test hides a bug). Hunt for real bugs:
- Logic and edge cases: windows outside or partly outside the data coverage, empty or single-sample data, azimuth wrap (359.9 to 0.1), `NaN` and `Infinity` paths, off-by-one at the end of coverage, leap day 2028, rounding that changes a boolean state, observer height keys missing from the masks.
- Async and state: stale results (a slow response overwriting a newer one) in `useSiteBundle`, loader caches, worker clients (cancel logic), `useUrlSync` loops (state to URL to state), store actions that can leave `activeScenarioId` pointing at a removed scenario, effects with missing or extra dependencies.
- Resource leaks: effects without cleanup, `requestAnimationFrame` not cancelled, three.js geometries, materials, textures and renderers not disposed, workers never terminated, event listeners left on `window`.
- Performance during Play (cursor changes every frame): anything recomputed per frame that depends only on data, window or observer height; allocations in hot loops.
- Contract compliance: `docs/contract.md` section 3 definitions versus `metrics.ts`, `events.ts`, `finder.ts`, `windowMap.ts` (do they agree with each other on edge cases such as a transition exactly on a sample?).
Prefer findings you can demonstrate with a tiny vitest-style scenario; you may run one-off checks with a scratch script in the scratchpad or with `npx vitest run` on a file named `tasks/reviews/scratch.test.ts` that you delete afterwards.
