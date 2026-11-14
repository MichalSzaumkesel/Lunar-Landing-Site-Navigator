# Status B (Web App & Demo)

Lead: Claude (Opus). Last update: 2026-11-14 02:15 CET. **Nothing is committed yet** (human's instruction: the event starts officially at 09:00 on 2026-11-14).

Remote: `origin` is `MichalSzaumkesel/Lunar-Landing-Site-Navigator` (private, owner is the scope A human, B's human has push but not admin access). It is empty: no commits and no `main` yet, so `git show origin/main:CRITICAL.md` fails until someone pushes. The local `CRITICAL.md` has no notices. Nothing has been pushed from here.

## Tasks

| # | Task | Status | Notes |
|---|---|---|---|
| B0 | Scaffold, shell, state types, mocks, deploy | in progress | Vite 8 + React 19 + TS 7, vitest, d3, three, zustand. Shell and store done, typecheck green. Mocks are being generated (agy). Deploy workflow written but untested (no remote). |
| B1 | Loader with real-to-mock fallback, `metrics.ts` | not started | ui-core. Needs `validation/fixtures/metrics_cases.json` from A. |
| B2 | D3 polar sky plot | not started | ui-core. Placeholder in `components/sky/`. |
| B3 | Timeline + Play | not started | ui-core. Store, rAF loop and a global transport bar exist (`state/`, `app/Transport.tsx`). |
| B4 | Scenario cards + countdowns | not started | ui-core. |
| B5 | Preset bar | basic version done | `app/PresetBar.tsx`, `config/presets.ts`. App opens into `southpole_landed`. |
| B6 | Map + site library + custom lat/lon | not started | ui-features. |
| B7 | 3D view | not started | After B2 and B3 work end to end. |
| B8 | Slip slider, window finder, Planner/Explore | not started | Store already has slip and mode. |
| B9 | Links, CSV, README, demo script, video | README draft done | |

## Decisions

- **Time cursor is shared and relative.** `cursorH` is hours from each scenario's effective window start, so cards with different dates (same site, new date) animate in lockstep. Playback loops at the shortest window.
- **Provenance is explicit.** `SiteBundle.provenance` is `real | mock | custom_api | custom_approx`; badges derive from `meta.synthetic` / `meta.approximate`.
- **Mock sites have no real source.** Their `source.url` is empty and their names start with `[MOCK]`. This is the only exception to rule 1 and it is labelled.
- **Delegation.** See `web/DELEGATION.md`: boilerplate with a fixed spec goes to agy (Gemini 3.8 Flash, run by `web/scripts/agy/run-agy.ps1` with a watchdog), judgement work to Sonnet teammates, architecture stays with the lead.
- **Custom-site fallback without an API.** The Sun's Moon-fixed direction is the same for every site, so a custom site can reuse the ephemeris of the nearest loaded site, rotated into the local frame. Earth parallax (at most about 0.26 deg) is ignored, so the result is `approximate`.

## Requests to other scope

1. **Contract §2.3 example count.** `count: 18264` does not match the stated coverage. Hourly from 2026-12-01T00:00Z to 2028-12-31T23:00Z inclusive is 18288 samples (762 days). The loader reads `count` from the file, so A should write the true number; the example in the contract should be fixed in its next PR. The contract example also shows `contract_version` "1.0.0" in `meta` while the contract is 1.1.1.
2. **Fixture shape for missing transitions.** Please state in the header of `metrics_cases.json` how "null plus reason `beyond_data`" is written (field names), so `metrics.ts` and the fixtures agree.
3. **Optional custom-site service (`api/`), proposed by the human, not yet agreed.** Open points for A and both humans:
   - `api/` has no owner in the CLAUDE.md table, and CLAUDE.md says "No backend". Changing that needs a PR approved by the other human.
   - The response `{ site, horizon, ephem }` is a wrapper that is not in the contract. If kept, it needs a short §2.8, plus `meta.contract_version` 1.1.1 (the proposal says 1.0.0).
   - Live Horizons fetching for 18288 samples cannot fit in 1 to 2 seconds (sequential requests, at least 1 s apart). Realistic options: derive the ephemeris from an already cached site by rotation (see Decisions), or precompute a Moon-centred Sun and Earth vector set once.
   - The service needs CORS enabled for the web origin.
   - B side: after the contract question is settled, `loadCustomSite(lat, lon)` in the loader tries `${VITE_API_URL}/api/custom-site` with a 4 s timeout, then falls back to the client-side approximation. B can build the fallback without waiting for A.

## Draft CRITICAL notice

Not sent. Review and commit to `main` yourself if you agree (agents never commit this file).

```
### C-001 · Ephemeris `count` in contract example is wrong
- Date (CET): <fill in when committed>
- From: scope B
- Affects: scope A
- Severity: must-fix-before-freeze
- Contract: needs a fix in the next contract PR (example only, no format change)
- What changed / what's wrong: contract §2.3 shows `count: 18264`. Hourly samples from 2026-12-01T00:00Z to
  2028-12-31T23:00Z inclusive are 18288. The web loader reads `count` from each file.
- Action required: write the real sample count in every ephem file; fix the example in the contract.
- Workaround until fixed: none needed on B's side.
- Status: open
```

## Open questions for the human

- First push to the empty `main`: **decided, B's human does it after 09:00** (the agents commit and push nothing before that). Plan: the shared files (`CLAUDE.md`, `CRITICAL.md`, `docs/contract.md`, both scope files) as the first commit, then scope B's scaffold on a `b/*` branch. Scope A's human should be told so they do not push a competing first commit.
- Static deploy: GitHub Pages on a private repo needs a paid plan and the owner's admin rights to enable. Vercel can deploy from a private repo with access granted by the owner. Which one?
