# Task W7b: draggable mission bar on the timeline, and PNG export of a scenario card

Write the files first, then test (see `_common.md`; follow `tasks/UI-guidelines.md`, `RULES-quality.md`). Two features.

## Writable paths

`src/components/timeline/**`, `src/components/share/**`, `src/lib/exportPng.ts` and test (new), `src/components/scenario/ScenarioBoard.tsx` (only to add the export button and pass props). Nothing else. Read `lib/finder.ts` and `state/types.ts` (`missionRules`) but do not change them.

## Items

1. **Mission bar on the Timeline.** Draw a bar spanning `missionRules.missionDurationH` hours that starts at a movable mission start `startH` (hours from the scenario window start; default 0). The user drags the bar (pointer capture, keyboard: focusable, ArrowLeft/ArrowRight ±1 h, Shift ±24 h) along the timeline. The bar is **green** when the mission rules pass for that start and **red** when they fail, recomputed live with the same rule evaluation the window map uses (reuse functions from `lib/finder.ts`; do not duplicate the logic). Colour is never the only signal: add the text label "Rules met" / "Rules not met" plus the first failing rule name next to the bar, and a pattern or icon difference. A tooltip or caption shows the start UTC. Dragging must not move the playback cursor; releasing the bar can optionally "Set as landing date" through the existing store action that changes the scenario start (clamped to the data range). Keep the existing seek drag working on the rest of the track. The bar can be hidden with a small toggle, hidden by default on boards of 3 or more cards.
2. **PNG export of a scenario card.** Button "Save card as PNG" in the card toolbar (next to the existing card actions). `exportPng.ts` draws onto an offscreen `<canvas>` without any new dependency: a header (site name, dates in UTC, badges text "Synthetic data"/"Approximate" when set), the sky plot (serialise the card's SVG with computed colours inlined and draw it via an `Image` from a blob URL; revoke the URL), and a text table of the key metrics already shown in the metrics panel (read from the same metrics object, do not recompute). Footer line: "Lunar Landing Site Navigator, Sun visible and Earth in view only, not a power or link guarantee". Download name `<siteId>_<startDate>.png`. Canvas size 1600x900. Fails gracefully with a visible message if drawing throws.
3. Tests: mission bar colour/label decision is a pure helper with tests (rules met, one rule failed, range clamp at both ends, keyboard step sizes); exportPng filename builder and the footer text (no forbidden words power, energy, signal, link availability).

## Acceptance

`npm run typecheck`, `npm run lint`, `npm test` exit 0. Report per item: done or why not, test counts.
