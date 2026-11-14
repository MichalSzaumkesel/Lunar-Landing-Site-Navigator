# Review R12: test gaps

Read tasks/_review.md first (read-only rules). FINAL REPLY RULE: at most 8 lines: report path, counts, the single most valuable finding in one line; all content goes only into the report file (create early, append, about 60 tool calls max). Rank by impact for a live jury demo; each finding gets file:line, a concrete scenario, and the fix in a few lines.
Report: tasks/reviews/R12-test-gaps.md.

Task: find where the test suite gives false confidence. Look for behaviour that is covered only by snapshot or render-smoke tests, pure functions without boundary tests, critical flows with no test (URL round trip, scenario add/remove, playback loop, loader failure paths, finder vs window map vs mission bar agreement, events at sample boundaries, export CSV content), mocks that hide bugs, tests that assert implementation details, and flaky patterns (timers, randomness, worker timing). Propose the 20 most valuable missing tests as a list with the exact inputs and expected outputs, ready for a worker to write.
