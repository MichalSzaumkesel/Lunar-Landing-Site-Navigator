# Common rules for every scope B task

Project: Vite + React + TypeScript app in `web/` (your working directory). Read your brief first; these rules apply on top of it.

## Also read

- `tasks/RULES-quality.md` for every task (wording, performance, accessibility, verification, token discipline).
- `tasks/UI-guidelines.md` when you touch components or styles.

## Code

- `tsconfig.app.json` rules: `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no enums, no parameter properties), `noUnusedLocals`, `noUnusedParameters`.
- Relative imports without a file extension, like `src/lib/loader.ts`.
- Pure modules have no React and no DOM unless the brief says so. Code comments in English, short. No new npm packages, no network access.
- Data shapes come only from `src/lib/types.ts` (import with `import type`, never edit it). Contract: `../docs/contract.md`. Conventions: UTC ISO 8601 with `Z`, degrees, azimuth from north clockwise, longitude east positive.
- Reuse the finished modules (`src/lib/horizon.ts`, `ephem.ts`, `metrics.ts`, `finder.ts`, `loader.ts`, `src/viz3d/terrain.ts`) instead of copying their logic.
- Never print big arrays (ephemeris, masks, heightmaps). Inspect them with small scripts that print summaries.

## Working method

- Write the code files first, early, then test and refine. Do not spend many steps on throwaway `node -e` experiments.
- Every command must finish within 60 seconds. Never run something that can loop forever or scan the whole data set without a bound; use vitest for checks.

## Tests

- vitest, hand-checked expected values, no random data. Run only your own files: `npx vitest run <paths>`.
- `npm run typecheck` must pass. Ignore errors in files you do not own, but name them in your report.
- Mock data for experiments: `public/data/mock/` (synthetic, three sites).

## Forbidden

- No git commands that change state (no commit, branch, push, stash, reset, checkout).
- No edits outside the Writable paths of your brief.
- Do not spawn other agents unless the brief allows it.

## Final report

Your last message must be exactly:

```
STATUS: done | blocked
FILES: <one path per line>
COMMANDS: <command> -> <exit code>
NUMBERS: <what the brief's Acceptance asked for>
OPEN: <questions, deviations from the spec, or "none">
```
