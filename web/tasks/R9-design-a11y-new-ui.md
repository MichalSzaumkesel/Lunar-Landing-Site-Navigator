# Review R9: design and accessibility of the newest UI

Read `tasks/_review.md` and `tasks/UI-guidelines.md` first (read-only rules; report file `tasks/reviews/R9-design-a11y-new-ui.md`, created early and appended as you go; about 50 tool calls in total).

Scope: the new UI only: demo caption bar and "Video 30 s" / "Record video" buttons (`src/components/demo/**` TSX and css), mission bar and its info row (`src/components/timeline/`), "Save card as PNG" button (`src/components/share/`), the 3D controls (lander position control, radius selector, "Sunlight map", "Find sunniest spot", result card, legend; `src/viz3d/SurfaceView.tsx` and `surface.css`).

Hunt for (use the rules in UI-guidelines.md, WCAG 2.2 AA):
1. Contrast of text and non-text elements on the dark theme (caption bar, hatched red bar, labels on bars, legend ramp ends, focus rings), colour as the only signal, touch target size (40 px), focus order and visible focus, keyboard operability of every new control (including the draggable bar and the lander position control), roles, names, `aria-live` politeness (the caption bar announces every step; is that too chatty for the screen reader? the result card), reduced-motion handling, text that is truncated or overflows at 1280x800 and 390 px widths, one primary button per view.
2. Layout interplay: the fixed caption bar vs the sticky Transport bar and the page bottom (does it cover content or the Stop button), the mission bar row height pushing the card taller (the cards were tuned to fit 800 px height with two cards), the 3D toolbar wrapping.
3. Copy: short, factual, professional wording; no claims of power, energy, signal or link availability; synthetic and approximate labels visible where results are shown.
Rank findings by realistic impact on a live jury demo on a projector. Give each finding the fix in a few lines (token or CSS where possible).
