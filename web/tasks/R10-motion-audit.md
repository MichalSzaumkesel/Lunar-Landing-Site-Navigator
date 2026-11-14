# Review R10: motion audit (where the UI has no animation and should)

Read `tasks/_review.md` and `tasks/UI-guidelines.md` first (read-only rules; report file `tasks/reviews/R10-motion-audit.md`, created early and appended as you go; about 50 tool calls in total).

Goal: find every place where the UI changes state abruptly and a short, smooth animation would clearly improve the experience, and propose the best fitting one. This is for a live jury demo on a projector, so motion must be calm, purposeful and cheap (no jank during Play).

Scope: all CSS (`src/**/*.css`, especially `src/app/theme.css`) and TSX under `src/app`, `src/components`, `src/viz3d` (read, do not edit). First list the motion that already exists (transitions, keyframes, rAF animations, the `prefers-reduced-motion` handling and any motion tokens) so proposals reuse it.

Check at least these moments, and any others you find:
1. Mode switch Simple/Advanced, tabs (view tabs Polar/Panorama/3D, Panels tabs), cards appearing and disappearing (add or remove scenario, preset click, slip), the `details` "Details and controls" open/close, the loupe toggle, the mission bar show/hide.
2. Numbers and states that change: countdown values, metric values, the "Sun visible"/"Earth in view" state flips, badges, rule met / not met on the mission bar, the Earth phase, chips appearing.
3. Overlays: tour card and spotlight moving between steps, demo caption bar entering and caption changes between steps, result card of "Find sunniest spot", error and status messages, tooltips.
4. Buttons, tabs, inputs, sliders: hover, active, focus ring, disabled transitions; the Play button state; the sticky Transport bar.
5. Loading: skeletons and placeholders while a bundle loads, the map and window map canvases appearing, 3D scene fade-in, heatmap toggle, progress indicators.
6. Data viz: sky plot track and disc position (they follow the cursor; they must NOT get a transition that lags behind Play), horizon silhouette on scenario change, timeline cursor on seek, mission bar drag.

For each proposal give: the element (file and selector or component), the trigger, the animation (property, duration in ms, easing; prefer `opacity`, `transform`, `grid-template-rows` for height, `@starting-style` or keyframes for entry), whether it needs TSX changes (and which) or CSS only, a risk note (layout shift, jank during Play, interplay with `prefers-reduced-motion` and the tour which measures element positions), and a priority 1 to 3 by value for the demo. Also propose a small set of shared motion tokens (durations, easings) for `theme.css` and a global reduced-motion rule. End with a ranked list of the top 15 proposals and a list of places where animation must be deliberately avoided and why.
