# Review R13: performance and bundle

Read tasks/_review.md first (read-only rules). FINAL REPLY RULE: at most 8 lines: report path, counts, the single most valuable finding in one line; all content goes only into the report file (create early, append, about 60 tool calls max). Rank by impact for a live jury demo; each finding gets file:line, a concrete scenario, and the fix in a few lines.
Report: tasks/reviews/R13-performance.md.

Task: runtime and bundle performance for a projector demo on a modest laptop. Run npm run build and read the chunk sizes; find what loads on first paint vs lazily; check re-render storms during Play (components subscribing to cursorH, selectors returning new objects, missing memo), per-frame allocations in rAF loops, d3 and canvas redraw cost, worker use, heavy work on the main thread (metrics for 4 cards, events, window map), memory growth when switching tabs, modes and scenarios, large JSON parse cost, image and texture sizes in public/. Where possible measure with small scripts (vitest bench or node timing) and give numbers. Do not edit code.
