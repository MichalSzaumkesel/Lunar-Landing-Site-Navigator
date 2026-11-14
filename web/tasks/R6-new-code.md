# Review R6: new code (Simple mode, guided tour, shortcuts, insights)

Read `tasks/_review.md` first (read-only rules; report file `tasks/reviews/R6-new-code.md`, created early and appended as you go; about 50 tool calls in total).

Scope (only these, they are new since the last review): `src/components/simple/**`, `src/components/help/**`, `src/app/**` (App, TopBar, Panels, Tools, Transport, useShortcuts), `src/lib/eclipses.ts`, `src/lib/mastDelta.ts`, `src/components/finder/windowMapView.ts` and `WindowMap.tsx`, `src/viz3d/scene.ts`, `src/viz3d/SurfaceView.tsx`.

Hunt for:
1. Correctness: the tour (target missing, resize and scroll, step skipping, focus return, keyboard conflicts with `useShortcuts`, auto-start timing and `localStorage` failures, switching level while open, `?tour=0`), Simple mode (`simpleSummary` branches and wording at boundaries: exactly 48 h, zero hours, no events, outside the data range, synthetic bundle; place picker when a site fails), shortcuts (focus on buttons, dialogs, sliders), eclipses and mast delta edge cases, the 3D shadow throttling (stale shadow when paused, direction comparison), memory leaks (listeners, observers, timers, the 3D scene on mode switch).
2. Security and privacy: anything built from the URL hash or `localStorage` that reaches the DOM unescaped, `dangerouslySetInnerHTML`, selectors built from data (`querySelector` with unescaped input), anything that could throw on corrupt `localStorage` values.
3. Accessibility of the tour and Simple mode: dialog semantics, focus trap, labelled controls, announcements, contrast of the overlay and card, reduced motion, touch targets, reading order.
4. Wording rule violations: any user-visible text that claims power, energy, signal or link availability, or states a fact that is not computed from data.
Rank findings by realistic impact on a live jury demo. Give each finding the fix in a few lines.
