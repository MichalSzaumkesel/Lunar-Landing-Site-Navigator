# Task A4-copy-wording: Wording and copy audit
Review only: do not edit any file except your report. Follow `_review.md` format rules for reports (severity, evidence, fix). Write the report file early, then extend it. Final reply max 6 lines. Stay inside the scope below; do not run servers, do not run npm install, every command under 60 s. Finish within about 15 minutes.
Report: `reviews/A4-copy-wording.md`.
Scope: every user-visible string in src/components, src/app, src/config, src/lib (grep for JSX text, aria-label, title, placeholder). Find: (1) any claim of power, energy, signal, link or communication availability (hard rule: only 'Sun visible' and 'Earth in view' are allowed), (2) inconsistent naming of the same concept between Simple and Advanced, (3) inconsistent date, duration and unit formats, (4) typos, awkward English, over-long labels, (5) facts that carry no source. Give file:line and a proposed replacement text for each finding.

## Note (restart)
A previous run stalled. Inspect existing output files and continue; write the report file early and extend it. Read files in ranges under 200 lines. Run shell commands in steps under 60 s.
