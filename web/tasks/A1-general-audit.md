# Task A1: general audit of the whole app on current main
Review only: do not edit any file except your report. Follow `_review.md` format rules for reports (severity, evidence, fix). Write the report file early, then extend it. Final reply max 6 lines.
Report: `reviews/A1-general-audit.md`. Audit the repo in web/ (code, tests, build, accessibility, security headers/CSP, error handling, data loading, offline behaviour, bundle size, README accuracy, consistency with CLAUDE.md hard rules and docs/contract.md). Prioritise bugs that a user would hit in a 3-minute demo. Verify claims by reading code and, where useful, running `npm run typecheck`, `npm test` and `npm run build` in web/.

## Note (restart)
A previous run stalled. Inspect existing output files and continue; write the report file early and extend it. Read files in ranges under 200 lines. Run shell commands in steps under 60 s.
