# Task W7a: demo mode (auto narration) and prefetch of the demo sites

Write the files first, then test (see `_common.md`; follow `tasks/UI-guidelines.md`, `RULES-quality.md`). Goal: a "Demo" button starts a self-running tour of the product for a jury or a kiosk: it runs the Apollo vs Artemis preset, plays the timeline, and shows a caption bar whose numbers come from the computed metrics and events (never typed numbers). Any key, click on "Stop demo" or Esc stops it and leaves the app in a normal state.

## Writable paths

`src/components/demo/**` (new), `src/lib/prefetch.ts` and test (new), `src/app/TopBar.tsx`, `src/app/App.tsx` (only to mount the demo and the button). Nothing else. Do not change store logic; use existing store actions (`applyPreset`-style actions in `config/presets.ts`, `setCursor`, `setPlaying`, mode, active scenario).

## Items

1. **Demo controller** (`src/components/demo/useDemo.ts` + a small zustand slice or `useState` in a provider): an ordered list of steps, each `{ id, durationMs, run(store), caption(ctx) }`. Steps: (1) load the Apollo vs Artemis preset, advanced mode, caption names both sites from the scenario data; (2) cursor to start and Play, caption "Sun and Earth over the local horizon"; (3) pause at the first sunset or Sun-hidden moment of card 2 (use `events.ts`/`useScenarioEvents`), caption states the hours until it from the countdown logic; (4) show the metrics difference between the two cards (Sun visible hours, Earth in view hours) with numbers taken from `useScenarioMetrics`; (5) apply the "same site, 14 days later" slip preset and caption the change in Sun-visible hours (delta computed from metrics); (6) end card. Then loop (kiosk) back to step 1 until stopped.
2. **Caption bar** (`DemoCaption.tsx`): fixed at the bottom above the Transport bar, large readable text, `aria-live="polite"`, a visible "Stop demo" button and the hint "Esc to stop". Wording rule: only "Sun visible" and "Earth in view"; never power, energy, signal or link claims; synthetic data stays labelled (append "demo data" when the bundle is synthetic).
3. **Button**: "Demo" in the TopBar next to the Tour button (ghost variant). Disabled with a tooltip while a bundle is loading. Starting the demo closes the tour if open.
4. **Prefetch** (`src/lib/prefetch.ts`): `prefetchDemoSites(siteIds)` fetches (via the existing loader, so validation and mock/real choice stay) the three demo sites once after first paint using `requestIdleCallback` (fallback `setTimeout`), ignoring errors. Call it from App after mount. This makes "works offline after load" true for the demo sites; note in the code comment that other sites load on demand.
5. Tests: step list is non-empty and every caption function returns text without the words power, energy, signal, link; caption numbers equal the metrics passed in (pure helper); Esc stops; prefetch ignores failures.

## Acceptance

`npm run typecheck`, `npm run lint`, `npm test` exit 0. Report per item: done or why not, test counts.
