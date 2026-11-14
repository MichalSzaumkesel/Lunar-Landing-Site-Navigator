# Working rules for the lead and every worker (scope B)

Short on purpose. If a rule is missing, choose the simplest option and say so in the report.

## Honesty and wording

- Synthetic data always carries the badge `Synthetic data`; approximations carry `Approximate`. Derived values (Earth phase, terminator, local horizon from the terrain patch) are labelled as derived and, where they simplify, as approximate.
- Say "Sun visible", "Sun below horizon", "Earth in view". Never claim power, communication or link availability.
- Every number shows its unit. Every metric has a tooltip with its contract definition. Times are UTC and say so.
- No facts from memory: coordinates, dates and mission statuses need a source URL (mocks are the labelled exception).
- Every view has four states: loading, empty or outside data range, error (plain language, what to do next), and normal.

## Code

- Pure logic lives in `lib/` or next to the feature and has tests; React components stay thin. No logic in JSX that deserves a test.
- Performance budgets: pointer interactions respond in under 100 ms; Play runs at 60 fps with two scenarios; the first screen needs no three.js (load the 3D view with `React.lazy`); data files load lazily per site; heavy computation (window map, local illumination) runs in a worker.
- During Play there are no per-frame allocations in hot paths and no recomputation of anything that depends only on data, window or observer height (memoise it). Animation loops start only when needed and are always cancelled on cleanup.
- Shared state only through `state/store.ts`. No other global mutable state. Errors are handled at boundaries (loader, worker clients, components), not everywhere.
- No dead code, no commented-out code, no unexplained TODO. Comments in English, short, explaining why. No new npm packages without the lead's approval.
- No secrets in the repo, no analytics, no external requests from the app apart from our data files and the optional `VITE_API_URL`. Fonts are the system stack.

## Accessibility

- Everything works with the keyboard; focus is always visible; controls have accessible names; colour is never the only carrier (add text, shape or pattern).
- Respect `prefers-reduced-motion`: no autoplay of animation on load, the demo mode and Play start only on a user action.
- Touch targets are at least 40 px; minimum font size 12 px in SVG, 14 px for body text.

## Verification before you report

1. `npm run typecheck`, `npm run lint` and the tests of your files pass.
2. UI work: open the page in the preview, check the console is clean, check the states from the list above, exercise the controls once. Screenshots at scale 0.5, only when text tools cannot show the result. Say what you could not verify.
3. Generated data is checked by a script that prints a summary, never by eye.

## Token discipline (workers and lead)

- Read only the files the brief names; use grep before reading; do not re-read a file you just edited; do not print arrays or whole files into the conversation.
- Prefer text tools (`read_page`, `get_page_text`, script summaries) over screenshots.
- One task at a time; reports are short and in the fixed format. If you are blocked for about 20 minutes, stop and report.
- Cheap first: well-specified boilerplate goes to agy (Gemini Flash), visual iteration to a Sonnet teammate, architecture and review to the lead. Check `scripts/agy/usage.ps1` before and after big waves; when the Gemini pool runs low, switch to the fallback models in `DELEGATION.md`.

## Ownership and git

- Stay inside your Writable paths. Two workers never touch the same file.
- Workers never run git commands that change state. The lead commits, only after 09:00 on 2026-11-14, with real timestamps, small English imperative messages, and no `Co-Authored-By` trailer or generated-by line.
- Shared files (`CLAUDE.md`, `docs/contract.md`) change only by a PR that the other human approves. `CRITICAL.md` is never edited by agents.
