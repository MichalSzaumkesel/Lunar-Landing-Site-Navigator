# Task W13: fixes from the logic reviews (L2, L3, L5; L1 and L4 are added below when they exist)

Write the files first, then test (see `_common.md`; follow `RULES-quality.md`). Background (read-only): `tasks/reviews/L2-physics-contract.md`, `L3-state-url-playback.md`, `L5-loader-data-robustness.md` (and `L1-end-to-end.md`, `L4-finder-events-rules.md` if they are complete; the `.partial.md` files are incomplete, ignore them). Finding numbers refer to those reports. Wording rule: never claim power, energy, signal or link availability.

## Writable paths

`src/state/**`, `src/lib/**` (not `sound*.ts`, `recorder.ts`, `exportPng.ts`), `src/components/simple/**`, `src/components/sky/SkyReadout.tsx`, `src/components/finder/MissionRulesForm.tsx` (label text only), `src/components/timeline/missionBar.ts` (only to reuse the shared evaluation, see item 2), `vite.config.ts`, `.github/workflows/deploy-web.yml`, tests for all of these. Nothing else. Other workers edit `src/viz3d/**`, `src/components/demo/**`, `src/components/share/**`, `src/components/sound/**`, `src/app/**`; do not touch them.

## Decisions already made (apply them)

- **Minimum Sun elevation at landing (L2 #1)**: it means the Sun's elevation **above the local terrain horizon** (clearance), not the raw elevation. Change `lib/finder.ts` and `lib/windowMap.ts` accordingly, change the label in `MissionRulesForm.tsx` to "Minimum Sun elevation above the horizon at landing", and make the mission bar use the same shared evaluation function (export one function from `finder.ts` and call it from both; delete the duplicated logic in `missionBar.ts`). Add tests that the finder, the window map and the mission bar agree for the same starts, including a start where the raw elevation passes but the clearance fails. Do not edit docs; state the decision in your report.
- **Missing real terrain (L5 #4)**: mock terrain is loaded only when the site bundle itself is mock (`provenance === 'mock'` or `useMock`). A real site without real terrain gets `terrain: null` and keeps its real provenance (no synthetic badge). Check that every consumer of `bundle.terrain` handles null without throwing (3D view shows a plain message "No terrain data for this site"; do not edit viz3d: if a consumer there throws on null, list it in OPEN).
- **Out-of-coverage reference time (L2 #2)**: use the clamped reference consistently for every metric that shares the reference time, and make the "outside data range" state unchanged.

## Items

1. **L3 #1** unique scenario ids (one shared generator in the store, used by `addScenario`, the URL hash path and presets; test the round trip hash then add then remove). **L3 #2** `setCursorH` rejects non-finite values (keep the current value or 0), and `scenarioCursorUtc` and friends must never throw `RangeError` on bad input. **L3 #3** Simple mode: slip is cleared when the date is changed in Simple mode and the window label never disagrees with the start date input (choose: reset slip to 0 when entering Simple mode, or show the effective start in the input; say which). Then L3 findings 4 to 9 where the report gives a clear fix.
2. **L5 #1** CSP: load env with `loadEnv` in `vite.config.ts` so `VITE_API_URL` reaches the CSP `connect-src` (build only), and forward `VITE_API_URL: ${{ vars.VITE_API_URL }}` in the workflow's build step (empty is fine). **L5 #2** `SkyReadout` error state with `role="alert"` and a retry button (reuse what `SkyPlot` does). **L5 #3** `isValidEphem` validates both angular radii (finite, positive) and the mocks still load (run the loader tests). Then L5 findings 5 to 10 where the fix is clear; leave `public/textures` (finding 15) as is.
3. **L2 #4 and #5** (eclipses): implement the true two-disc overlap fraction (area of the intersection of two circles, closed form) and linear interpolation of the contact times between samples; update the tests with hand-computed values (state the hand computation in a comment). **L2 #6 to #10**: fix those with a clear fix, skip the rest and say why. **L2 #3** (contract count) is not yours: do not touch the contract.
4. If `L1-end-to-end.md` or `L4-finder-events-rules.md` are complete (no `.partial`), fix their High findings in your paths and list those outside your paths in OPEN.
5. Tests for every behavioural fix.

## Acceptance

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` exit 0 (failures in other workers' files caused by their in-progress edits: say so and run only your paths). Report per item: done or why not, test counts, and OPEN items outside your paths.

## Note (rerun)
A previous run stalled; inspect what already changed (git diff, tests) and continue; do not redo finished items. Do NOT edit `src/lib/loader.ts`, `src/lib/loader.test.ts` or anything in `src/viz3d/**` (another worker is changing them for real data): list those items in OPEN instead. Real data from scope A is now on disk in `web/public/data/`; the mocks still exist. Run shell commands in steps under 60 seconds.
Note (rerun): a previous run stalled; inspect git diff and existing files, continue, do not redo finished items. Run shell commands in steps under 60 s.
