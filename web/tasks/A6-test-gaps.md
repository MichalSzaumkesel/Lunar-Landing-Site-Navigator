# Task A6-test-gaps: Test coverage gaps audit
Review only: do not edit any file except your report. Follow `_review.md` format rules for reports (severity, evidence, fix). Write the report file early, then extend it. Final reply max 6 lines. Stay inside the scope below; do not run servers, do not run npm install, every command under 60 s. Finish within about 15 minutes.
Report: `reviews/A6-test-gaps.md`.
Scope: src/lib and src/state and src/components (read tests next to code). Find pure logic with no test or weak tests (only smoke), edge cases untested (empty data, out-of-range dates, polar sites, NaN), and tests that are flaky by design (timing, randomness, order). Prioritise by risk for the demo. Give file:line and a proposed test case list (names + inputs + expected values only where derivable from code), not full code.

## Note (restart)
A previous run stalled. Inspect existing output files and continue; write the report file early and extend it. Read files in ranges under 200 lines. Run shell commands in steps under 60 s.
