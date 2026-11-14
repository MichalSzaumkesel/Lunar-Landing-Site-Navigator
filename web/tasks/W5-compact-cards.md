# Task W5: compact scenario cards for the projector, plus two small layout fixes

Write the files first, then test (see `_common.md`; follow `tasks/UI-guidelines.md`). Background: the visual QA found that one Advanced card is about 1474 px tall and, with two cards (the Apollo vs Artemis demo), each is about 2096 px, so both sky plots are only fully visible after scrolling. The demo hook needs both plots, both readouts, the timeline and the countdowns visible on one 1280x800 screen with the sticky Play bar.

## Writable paths

`src/components/scenario/ScenarioBoard.tsx`, `SkyViews.tsx`, `scenario.css`, `cardLogic.ts` and its test (only if you add a pure helper), `src/components/sky/sky.css`, `src/components/finder/WindowMap.tsx` (only the label width constant) and `finder.css`, `src/components/map/MoonMap.tsx`, `map.css`. Nothing else. Do not change logic of metrics, events or the store.

## Items

1. **Progressive disclosure in the card.** Always visible: header, view tabs and the sky view, the readout, the timeline, the countdowns. Put the rest (event chips, metrics panel, scenario controls) in one native `<details className="card__more">` with the summary text "Details and controls". It is **open** when the board has a single scenario and **closed** when it has two or more (read `scenarios.length` from the store). The user's choice per card is kept while the number of cards does not change (a small `useState` initialised from the count; reset when the count changes between 1 and more). Keep the `data-tour` attributes working: the tour steps `chips`, `countdowns-metrics` and `scenario-controls` need their targets in the DOM, so while the tour is open (check `document.querySelector('[data-tour-open]')` or the tour store `useTourStore` in `components/help/tourState.ts`, read-only) force the details open. Keep the summary at least 40 px high.
2. **Loupe collapsed by default** when there are two or more cards (it stays beside or below the plot as today when there is one card): a small toggle button "Loupe" with `aria-expanded`, default expanded for one card and collapsed for two or more.
3. **Plot size in multi-card boards.** In the two-card layout cap the sky plot (polar and panorama) so that card header, tabs, plot, readout, timeline and countdowns fit in about 800 px of height at a 1280 px wide viewport: use a CSS rule on `.board--2` (and 3, 4) limiting the plot width (for example `max-width: min(100%, 420px)` centred); keep the single-card size as it is. The readout stays two lines.
4. **Window map label column**: raise `LABEL_COL_WIDTH` in `WindowMap.tsx` from 180 to 260 and make sure `finder.css` uses the same width (check how the label column and the canvas offset are tied together; update the existing test if it asserts the old number).
5. **Moon map markers clipped at the south edge**: in `MoonMap.tsx` give the SVG a 10-unit vertical margin (extend the `viewBox` by 10 units top and bottom and shift the content, or clamp marker latitudes drawn on the equirectangular map to +-87 degrees visually while keeping the real coordinates in the label and the polar inset), so a site at latitude -89.5 is fully visible. The pick-point conversion in `projection.ts` must stay correct (do not touch it; if the viewBox change breaks the pixel to coordinate conversion, use the clamping option instead).

## Acceptance

`npm run typecheck`, `npm run lint`, `npm test` exit 0. Report per item: done or why not. Say which existing tests you changed and why.
