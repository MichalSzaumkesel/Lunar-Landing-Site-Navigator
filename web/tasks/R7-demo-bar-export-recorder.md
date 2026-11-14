# Review R7: demo mode, mission bar, PNG export, recorder, prefetch (correctness and security)

Read `tasks/_review.md` first (read-only rules; report file `tasks/reviews/R7-demo-bar-export-recorder.md`, created early and appended as you go; about 50 tool calls in total).

Scope (new since the last review): `src/components/demo/**`, `src/lib/prefetch.ts`, `src/lib/recorder.ts`, `src/lib/exportPng.ts`, `src/components/share/ExportCardPngButton.tsx`, `src/components/timeline/missionBar.ts` and `Timeline.tsx`, `src/app/TopBar.tsx` and `App.tsx` (demo wiring only).

Hunt for:
1. Correctness: demo state machine (start while the tour is open, stop mid-step, Esc and key handling vs `useShortcuts`, kiosk loop leaks, timers not cleared on unmount, what state the store is left in after stop: the end state currently keeps the "14 days later" slip preset; say whether it should be restored), step captions built from metrics that can be `null` or still loading, the caption "Sun sets in 1 min" moment (step 3 pauses just before the event: is the wording right at 0 minutes and under a minute?), video script timing (`planVideoSteps`), recorder (`getDisplayMedia` rejected, stream tracks not stopped, MediaRecorder `onstop` ordering, blob URL revoked too early or never, Esc during the 3 second countdown, double start), PNG export (SVG serialisation with inlined styles, blob URL revoke, canvas size, tainted canvas, huge site names, fonts), mission bar (drag vs seek conflict, pointer capture release, keyboard steps, clamping at data range ends, rule evaluation matches `lib/finder.ts` for the same start, DST or UTC rounding).
2. Security and privacy: anything from URL hash, site names or `localStorage` reaching the DOM unescaped, `innerHTML` in the SVG serialisation path, filenames built from data (path characters), data leaving the browser (the recorder and PNG must not send anything).
3. Wording rule violations: any user-visible text claiming power, energy, signal or link availability, or a fact not computed from data.
4. Performance during Play and the demo: re-render storms, effects without dependencies, allocations in `requestAnimationFrame`.
Rank findings by realistic impact on a live jury demo. Give each finding the fix in a few lines.
