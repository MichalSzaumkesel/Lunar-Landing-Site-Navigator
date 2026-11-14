# Review task rules (read-only reviewers)

You are a reviewer for the scope B lead of a Vite + React + TypeScript app in `web/` (a lunar landing site comparison tool: Sun and Earth against the local horizon; read `../CLAUDE.md` for the challenge and `tasks/RULES-quality.md` for our rules). Other workers are still writing some files, so a file can change while you read.

## Rules

- Create your report file early (after about 10 steps) and append findings as you go, so a killed run still leaves a usable report. Budget about 60 tool calls in total; stop reading and write up before that.

- You are READ-ONLY on the source. Your only writable path is your report file named in your role brief. Do not edit, create or delete anything else. No git commands that change state. No new packages.
- Commands must finish within 60 seconds (builds up to 3 minutes). Never print big arrays or whole files into the conversation.
- Be concrete and brief. Every finding has: severity (high / medium / low), `file:line`, what is wrong in one or two sentences, a concrete failing scenario or evidence, and a suggested fix of a few lines. No generic advice, no praise, no restating the rules. Do not report style nits that the linter or typecheck would catch. If you are unsure, say "unverified" and why.
- At most 25 findings, ordered by severity. Start the report with a summary of at most 8 lines (the top 5 findings in one line each). Mark anything that needs the lead's design decision with `DECISION:`.
- Finish with the final report in the format of `tasks/_common.md` (FILES is your report file; NUMBERS is the count of findings per severity).
