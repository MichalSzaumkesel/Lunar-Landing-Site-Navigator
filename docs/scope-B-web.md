# Scope B — Web App & Demo

Read `CLAUDE.md` and `docs/contract.md` first. You build everything the jury sees. Scope A (another person's team) delivers real data per site. **You never wait for them:** build on mocks that follow the contract, and the app picks up real files per site as they land on `main`.

## Ownership

`web/` (except real data in `web/public/data/`), `web/public/data/mock/`, `docs/demo-script.md`, `docs/status-B.md`, `README.md`.

Do not touch `pipeline/`, `validation/` or real data files. Scope A writes `validation/fixtures/metrics_cases.json`, and your `metrics.ts` must pass it.

## Directory split inside `web/src/` (prevents agent conflicts)

| Path | Owner |
|---|---|
| `state/`, `app/` (shell, layout, theme, routing), `config/presets.ts` | lead |
| `lib/` (loader, types, `metrics.ts`, window finder logic), `components/sky/`, `components/timeline/`, `components/scenario/` | teammate **ui-core** |
| `components/map/`, `components/library/`, `components/finder/`, `components/explore/`, `components/badges/` | teammate **ui-features** |
| `viz3d/` | **3D track**: a teammate *or* an external tool window (e.g. Gemini) driven by owner B. Whoever does it gets `CLAUDE.md` + contract §2.5 and touches only `viz3d/` |

## Deliverables in order

| # | Deliverable |
|---|---|
| B0 | Scaffold (Vite + React + TS, vitest, D3, three), app shell, state types, **mocks** for `apollo_11`, `southpole_landed`, `artemis_region_1` (incl. terrain `.bin`), static deploy pipeline working (Vercel or GitHub Pages) |
| B1 | Data loader with per-site real→mock fallback + badges; `metrics.ts` passing A's fixtures |
| B2 | **D3 polar sky plot**: terrain horizon silhouette, Sun/Earth tracks over the selected range, current positions drawn at true disc size, clearance readout |
| B3 | **Timeline** (sunlit / Earth / both bands) with time cursor and **Play** (smooth animation, speed control). Sky plot follows the cursor |
| B4 | **Scenario cards** (2–4): site + date, countdowns to sunset/Earthset, `sun_el_deg`, all metrics, "outside data range" state |
| B5 | **Preset bar**: "Apollo 11 (equator) vs Artemis III region (south pole)" one-click; app opens into a south-pole scenario with Play ready |
| B6 | Map + site library (grouped by category, sources linked), custom lat/lon input (approximate badge until supported) |
| B7 | **3D view**: terrain mesh from heightmap, lander at origin, Sun/Earth direction lights/arrows synced to the timeline cursor |
| B8 | Slip slider ±60 days, window finder (MissionRules → calendar of valid windows), Planner/Explore toggle (Explore uses A's texts) |
| B9 | "Open in Horizons / Quickmap / Moon Trek" links per site, CSV export (stretch), README, `docs/demo-script.md`, 30-s video |

Design: dark theme, high contrast, readable on a projector. The sky plot is the hero. Every number has a unit and a tooltip with the definition from the contract.

## Initial prompt for the scope B lead (paste into Claude Code, model: Opus)

```
You are the lead of SCOPE B (Web App & Demo) of a two-scope project. Read CLAUDE.md, docs/contract.md
and docs/scope-B-web.md fully. Another person's team owns scope A (data pipeline) and delivers real
data per site; never edit their files and never wait for them — build on mocks. Work on branches b/*;
your human merges to main.

PHASE 0 — you alone:
1. Scaffold web/ (Vite + React + TS, vitest, d3, three), app shell + dark theme, state types in
   web/src/state/ (selected scenarios, time cursor, playback, observer height, mode).
2. Create mocks in web/public/data/mock/ for apollo_11, southpole_landed, artemis_region_1 exactly per
   contract (incl. terrain .json + .bin), meta.synthetic = true. Make them exercise every UI state:
   sunset in range, no sunset in range, Earth below horizon, disc half-cut, azimuth wrap-around, a
   jagged south-pole horizon and a nearly flat equatorial one.
3. Static deploy working from main (Vercel or GitHub Pages) so a URL exists from hour one.
4. docs/status-B.md with a task table, a "Requests to other scope" section and a "Draft CRITICAL notice" section. Commit, ask the human to merge.

PHASE 1 — create an agent team with 2 teammates, both on Sonnet, with the directory split from
docs/scope-B-web.md:

- "ui-core": B1 → B2 → B3 → B4. metrics.ts must pass validation/fixtures/metrics_cases.json once
  scope A pushes it (until then write tests against the contract text). Animation must be smooth
  (requestAnimationFrame, interpolate between hourly samples).
- "ui-features": B6 → B5 preset wiring in components → B8 (finder UI, slip slider, Explore mode) →
  badges, "open in Horizons/Quickmap/Moon Trek" links.
3D (B7): only after B2+B3 work end to end. Either spawn it as a task for ui-features (viz3d/ only) or
leave it for the human's external tool — ask the human which.

RULES: never edit outside your directories; shared types change only via the lead; small commits;
no backend; lazy-load per-site data; never hardcode real coordinates — they come from sites.json.

LEAD DUTIES:
- Before assigning or starting any new task, run `git fetch -q origin && git show origin/main:CRITICAL.md`.
  Open notices affecting scope B come first; tell teammates, and add an ACK line draft for your human.
  Teammates do the same check before each new task.
- To notify the other scope, draft a CRITICAL notice (template in CRITICAL.md) in docs/status-B.md
  under "Draft CRITICAL notice" and ask your human to commit it to main. Never commit CRITICAL.md yourself.
- Keep docs/status-B.md current; check main for new real data from scope A at each checkpoint
  (CP1 Sat ~14:00, CP2 Sat ~20:00) and verify the app switches from mock to real per site.
- Own presets, app shell and integration. Keep the deployed URL green.
- Priority if time runs short: B2–B5 polished > B7 3D > B6 > B8 > B9 stretch.
- Feature freeze Sun 08:00 CET. Then: bug fixes, docs/demo-script.md (2-minute jury walkthrough
  starting from the preset + Play), shot list for the 30-s video.
- When done, clean up the team.
```
