# Task QA1: visual and layout QA at projector size, with small fixes (role `qa`)

Read `web/tasks/_common.md` (it points to `RULES-quality.md` and `UI-guidelines.md`; follow them). You are the first person to look at the whole app in a real browser at the target size. Find and fix visual and layout problems.

## How

Use the preview server `spaceapps-web` (port 5173; `mcp__Claude_Browser__preview_start` with name `spaceapps-web`) and `mcp__ccd_view__show_pane` with pane `preview` so the page renders. Emulate the viewport with `resize_window` at 1280x800 (and later 1024x768 and 390x800), take screenshots at scale 0.5 only when text tools cannot answer (budget: about 25 screenshots), and prefer `javascript_tool` for measurements (overflow, bounding boxes, computed styles, contrast). The tour opens automatically on the first visit of each level: use `?tour=0` in the URL for the checks, then check the tour separately. Remember the Browser pane throttles when hidden: a screenshot call wakes it.

## Checklist

1. **Advanced, 1280x800**: top bar (wrapping, spacing, one primary button only), tools row, the card (header, tabs, sky plot size, readout, timeline, chips, countdowns, metrics, controls), the transport bar, the lower tabs (Window map with rules form, Moon map with polar inset and legend, Site library). Look for: horizontal page scroll, overlapping or clipped text, elements that jump while Play runs, unreadable small text, inconsistent spacing, cards that are too tall for a projector.
2. **Apollo vs Artemis preset**: two cards side by side at 1280 px; both sky plots visible without scrolling much; readouts readable.
3. **Simple mode**: place picker, sky plot, summary card, legend, Transport; compare the visual weight to Advanced (it should feel calmer and simpler).
4. **Guided tour**: popover position next to targets, clamped inside the viewport, spotlight cut-out aligned with the target, Back/Next/Skip reachable, text not clipped; check steps whose targets are low on the page (scroll into view).
5. **3D tab** (it may be software-rendered): canvas size, overlay text, toggles.
6. **Responsive**: 1024x768 (the board stacks below 900 px) and 390x800 (nothing breaks, no horizontal scroll).
7. **Contrast and tokens**: spot-check with computed styles that text is at least 14 px (12 px in SVG) and borders of controls use the control-border token.
8. Console: no errors after a fresh load in each mode.

## Rules for fixes

You may fix problems yourself when the fix is small and local: edit any `*.css` file under `web/src`, and make small markup or class changes in components when a CSS-only fix is impossible. Do not change logic, state, data or tests, do not add dependencies, do not run git commands that change state. Keep the guidelines (tokens, spacing scale, one primary button per view). After each fix re-measure. Run `npm run typecheck`, `npm run lint` and `npm test` at the end.

## Report

End with the format of `_common.md`: FILES (the files you changed), NUMBERS (screenshots used, problems found and fixed, problems found and not fixed), OPEN (what needs the lead: design decisions, bugs in logic you saw but did not fix, anything you could not verify).
