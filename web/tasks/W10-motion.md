# Task W10: smooth UI animations
Follow `_common.md`, `RULES-quality.md`, `UI-guidelines.md`. Implement the top proposals of `reviews/R10-motion-audit.md` (CSS-first: transitions on panels, tabs, cards enter/leave, button states, mode switch, toasts). Never animate Play-driven content (sky plot, tracks, timeline cursor). Every animation must respect `prefers-reduced-motion` (disable or reduce to opacity). Durations 120-250 ms, no layout thrash.
## Writable paths
`src/app/**`, `src/styles/**`, `src/components/**/*.css`, small className/markup changes in `src/components/{scenario,library,simple,finder}/**`. Not `src/viz3d/**`, `src/lib/**`, `src/state/**`. Do not commit.
## Acceptance
typecheck, lint, test, build pass. Final reply max 8 lines.
Note (rerun): a previous run stalled; inspect git diff and existing files, continue, do not redo finished items. Run shell commands in steps under 60 s.
Note (rerun): a previous run stalled; inspect git diff and existing files, continue, do not redo finished items. Run shell commands in steps under 60 s.
