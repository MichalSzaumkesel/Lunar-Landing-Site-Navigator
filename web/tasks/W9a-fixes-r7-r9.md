# Task W9a: fixes from reviews R7 and R9 (demo, mission bar, export, recorder, top bar)

Write the files first, then test (see `_common.md`; follow `tasks/UI-guidelines.md`, `RULES-quality.md`). Background (read-only): `tasks/reviews/R7-demo-bar-export-recorder.md` and `tasks/reviews/R9-design-a11y-new-ui.md`. Finding numbers below refer to those reports. Do not fix anything else, and do not add animations (a later task does that). Wording rule: never claim power, energy, signal or link availability.

## Writable paths

`src/components/demo/**`, `src/components/timeline/**`, `src/components/share/**`, `src/lib/recorder.ts`, `src/lib/exportPng.ts` (and their tests), `src/app/TopBar.tsx`, `src/app/App.tsx`, `src/app/panels.css`, `src/app/theme.css` (only to add or adjust tokens, never remove one). Nothing else. Another worker is editing `src/viz3d/**` right now; do not touch it.

## Items

1. **R7 high findings 1 to 10**, each with the fix suggested in the report unless you see a better one (state it). Notes: finding 1 (round to the nearest sample for the mission bar instead of rejecting non-integer positions; the bar must not flash red while dragging) and finding 6 (last coverage sample must be valid, same result as `lib/finder.ts` for the same start: add a test that compares `evaluateMissionRulesAt` with the finder for several starts including the last valid one and the first invalid one). Finding 2: the recorder must start only after the countdown; aborting during the countdown discards everything and downloads nothing; the video must not contain the countdown overlay. Finding 4: also make the caption say "Sun sets in less than a minute" instead of "1 min" below one minute, and when no sunset lies in the window skip the step gracefully (no caption claiming one). Finding 5 (PNG export on the Panorama or 3D tab): do not click tabs behind the user's back; instead render the sky plot for the export from data off-screen using the same drawing code if available, else disable the button on those tabs with the title "Switch to the Polar view to save the card". Choose the simplest correct option and say which.
2. **R7 medium findings 11 to 22**: fix those where the report gives a clear fix; for each skipped one, say why in the report. Also: when the demo stops (by any path), restore the app to the state before the demo started (scenarios, mode, slip, cursor, playing false, active tab); keep this in one place and add a test with the store.
3. **R9 findings in your paths**: 1, 2, 3, 4, 5, 6, 9 (the demo caption announces only the step text, once per step, `aria-live` on a small dedicated region, not the whole bar), 10, 13, 14, 16, 17, 19, 22, 24, 25. Findings 7, 8, 11, 12, 15, 18, 20, 21, 23 concern the 3D view and are handled later: list them in OPEN. Layout constraint: the fixed caption bar must not cover the sticky Transport bar or the Stop button at 1280x800 and 390 px widths; two scenario cards must still fit about 800 px height (the mission toolbar wraps today: make it one compact row, or collapse it into the "Details and controls" area, your call, justify it).
4. **Tests** for every behavioural fix where it is testable.

## Acceptance

`npm run typecheck`, `npm run lint`, `npm test` exit 0 (if `src/viz3d` tests fail because of the other worker's in-progress changes, say so and rerun only your paths with `npx vitest run src/components src/lib src/app`). Report per item: done or why not, test counts.
