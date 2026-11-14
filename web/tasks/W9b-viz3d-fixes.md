# Task W9b: fix the 3D view findings from reviews R8 and R9
Follow `_common.md`, `RULES-quality.md`, `UI-guidelines.md`. Read (read-only) `reviews/R8-3d-lander-spot.md` and `reviews/R9-design-a11y-new-ui.md` (items 7, 8, 11, 12, 15, 18, 20, 21, 23 are the 3D ones). Fix every High and Medium finding about the 3D view with a clear fix: stale heatmap/best-spot cache when window or observer height changes, lander shadow frozen after move, lander animation not cancellable, marker ring reallocated per frame, search outside coverage message, legend contrast, aria-live, badges. Do not add new features.
## Writable paths
`src/viz3d/**` and tests only. Do not touch other directories. Do not commit.
## Acceptance
`npm run typecheck`, `npm run lint`, `npm test` pass. Final reply max 8 lines: STATUS, FILES, test counts, OPEN.
