# Scope B delegation contract

How the scope B lead (Claude, Opus) hands work to cheaper workers without breaking the data contract.
This file is internal to scope B. It does not change `docs/contract.md`.

## Roles

| Worker | Model / tool | Gets |
|---|---|---|
| Lead (Claude Opus) | main session | Architecture, `state/`, `app/`, `config/`, shared types, integration, review, every decision. |
| agy | `agy` CLI, Gemini 3.8 Flash, high effort | Boilerplate with a fixed spec: generators, mock data, tests, CSS, forms, tables. May spawn its own helpers, but small tasks should not. |
| Claude teammates | Sonnet subagents (`ui-core`, `ui-features`) | Work that needs judgement inside one directory: sky plot, timeline, metrics, finder. |

Rule of thumb: if the lead can write the interface in a few lines, agy implements it. If the task needs design taste or physics judgement, a Sonnet teammate or the lead does it.

## One source of truth for data shapes

1. `docs/contract.md` is the data contract between scope A and scope B.
2. `web/src/lib/types.ts` is its TypeScript transcription. Workers import from it and never redeclare these shapes. Changes go through the lead only.
3. Module signatures workers build against (the lead owns the list; implementations live in `lib/`):

| Module | Exports |
|---|---|
| `lib/loader.ts` | `SiteDataSource` (see `types.ts`): `loadSites`, `loadSite(siteId)`, `loadCustomSite(lat, lon)` |
| `lib/ephem.ts` | `sampleAt(ephem, ms): { sun: {az, el}, earth: {az, el} }`, linear interpolation between hourly samples, azimuth wrap handled |
| `lib/horizon.ts` | `horizonAt(mask: number[], azStepDeg: number, azDeg: number): number`, linear interpolation with wrap at 360 |
| `lib/metrics.ts` | `computeMetrics(bundle, { observerHeightM, startMs, endMs, refMs }): ScenarioMetrics` and `bodyFraction(clearDeg, radiusDeg)` |
| `lib/finder.ts` | `findWindows(bundle, rules: MissionRules): LandingWindow[]` |
| `lib/customSite.ts` | `approximateCustomSite(lat, lon, loaded: SiteBundle[]): SiteBundle` |

Custom-site fallback rule: the Sun is far away, so its Moon-fixed direction is the same for every site.
Take the nearest loaded site, rotate its Sun az/el into the Moon-fixed frame, and project into the custom site's local frame (Earth the same way, parallax of at most about 0.26 deg ignored). Horizon is a smooth sphere. Mark `meta.approximate = true`.

## Brief format (`web/tasks/<id>.md`)

Every brief has these sections, in this order:

1. **Goal**: one paragraph.
2. **Writable paths**: the only files the worker may create or change.
3. **Read-only references**: files to read first.
4. **Spec**: exact formulas, shapes, file names. No guessing room on anything the lead has decided.
5. **Acceptance**: commands that must pass and numbers to report.
6. **Forbidden**: no git commands that change state (no commit, branch, push, stash, reset), no edits outside Writable paths, no new npm packages, no network access except what the spec names.
7. **Final report**: the format below.

## Running agy

```powershell
powershell -NoProfile -File web/scripts/agy/run-agy.ps1 -Brief web/tasks/<id>.md
```

The script runs agy in `web/` fully automatic (`--dangerously-skip-permissions`), because headless agy otherwise hangs on trivial commands. The prompt is one short line that names the brief file; long multi-line prompts break in Windows PowerShell 5.1.

Because permissions are skipped, the brief's Forbidden section and the lead's review are the only guards. After every run the lead checks that no git state changed and that only the Writable paths were touched.

Watchdog: agy runs with `--output-format stream-json`, so every step is an event. The runner kills the whole process tree when there is no event for 9 minutes (a warning line is printed at 8, because a big code generation is silent for a while), when a single tool call stays open for 4 minutes, or after 25 minutes in total (exit codes 3 and 4). The lead then reads the log in `%TEMP%\agy-runs\`, shrinks the brief and retries, or does the task itself.

## Gemini reviewers (before the lead looks)

Gemini is nearly free, so after each wave a few read-only reviewers go over the new code first: correctness (`tasks/R1-correctness.md`), security (`R2-security.md`), design and accessibility (`R3-design-a11y.md`), build, performance and tests (`R5-build-perf-tests.md`), and a visionary for new ideas and pitch (`R4-visionary.md`). Rules are in `tasks/_review.md`; reports land in `tasks/reviews/` (not committed). The lead reads only the summaries, triages (fix now, decision, drop) and hands the fixes to a worker with a short brief. Reviewers never edit source.

## Limits and fallback models

- Check usage with `powershell -NoProfile -File web/scripts/agy/usage.ps1` (runs agy's `/usage`; it prints a `LOW:` line when a pool is at 20% or less). Pools: "Gemini Models" (weekly and five-hour limits, large) and "Claude and GPT models" (small: 50% of the weekly limit was already used on 2026-11-14, keep it for reviews and odd jobs).
- Model in use: `gemini-3.8-flash-high` with `--effort high` (the agy default in its settings is also "Gemini 3.8 Flash (High)"). `agy models` lists the others.
- Fallback order when the Gemini pool is exhausted: `gemini-3.8-flash-medium` (same pool, only helps for the five-hour limit), then `gpt-oss-120b-medium`, then `claude-sonnet-4-6` for small independent jobs (docs, tests, a second-opinion review of a diff), then Claude subagents. Pass the model with `run-agy.ps1 -Model <id>`. If agy returns a quota or limit error, run `usage.ps1`, pick the next model and retry once; never loop.
- Spend the Claude and GPT pool on things the Flash model does badly: reviewing a tricky module, writing the tutorial texts, a fresh look at a failing test.

## Final report (the last message of every worker)

```
STATUS: done | blocked
FILES: <one path per line>
COMMANDS: <command> -> <exit code>
NUMBERS: <the figures the Acceptance section asked for>
OPEN: <questions or deviations from the spec, or "none">
```

## Verification gates (the lead does these, a worker's report is not proof)

1. `npm run typecheck` and `npm test` pass in `web/`.
2. Generated data is checked by a script, not by eye. Never print large arrays into context.
3. Nothing synthetic is unlabelled: `meta.synthetic = true` and the UI badge.
4. No file over 5 MB. No raw NASA data.

## Limits

Two writers never touch the same path. The lead hands out directories, as in `docs/scope-B-web.md`.
No worker commits. The lead commits, and only when the human says so.
If a worker is blocked for about 20 minutes it stops and reports.
