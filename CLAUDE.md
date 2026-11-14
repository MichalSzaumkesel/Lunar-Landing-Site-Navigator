# Lunar Landing Site Navigator — NASA Space Apps Challenge 2026

**DEADLINE: 2026-11-15 13:00 CET** (local event Rzeszów: submission + judging start). Jury sees each project for 2–3 minutes. A 30-second video is part of the submission.

## ⚠ CRITICAL.md: check it first

**At session start and before starting every new task**, run `git fetch -q origin && git show origin/main:CRITICAL.md`. If a notice is `open` and affects your scope, handle it first (rules inside the file). If you need to notify the other scope of something critical, draft the notice in your status file and ask your human to commit it. Agents never commit `CRITICAL.md` themselves.

## Two scopes, one project

Two people, each running their own Claude Code lead + agent team. **Read only your scope file in detail.** Everything shared lives in this file and `docs/contract.md`.

| Scope | Person | File | Owns |
|---|---|---|---|
| **A — Data & Science** | owner A | `docs/scope-A-data.md` | `pipeline/`, `data/raw/`, `web/public/data/` (except `mock/`), `validation/`, `docs/method.md`, `docs/explore-texts.md`, `docs/sources.md`, `docs/status-A.md` |
| **B — Web App & Demo** | owner B | `docs/scope-B-web.md` | `web/` (except `web/public/data/` real data), `web/public/data/mock/`, `docs/demo-script.md`, `docs/status-B.md`, README |
| Shared | both humans | — | `CLAUDE.md`, `docs/contract.md`: changed **only via PR approved by the other human**. `CRITICAL.md`: append-only, committed directly to `main` by either human |

**The interface between scopes is `docs/contract.md`.** Scope B never waits for scope A: it builds on mocks that follow the contract, then switches to real data per site as A delivers. Scope A never touches UI code.

Git: one repo, `main` protected by habit. Scope A works on branches `a/*`, scope B on `b/*`, each teammate in its own worktree. Humans merge to `main`. Pull `main` often.

## The challenge (official, condensed)

Build an intuitive tool that lets **mission planners, educators and the public** compare lunar landing **sites and dates** quickly, visualizing **Sun and Earth positions relative to the local horizon** to assess **power generation potential** and **direct-to-Earth (DTE) communication windows**. Existing tools (Quickmap, Moon Trek, JPL Horizons) are powerful but slow for rapid scenario comparison. Missions slip, so planners must re-evaluate "same site, new date" or "same date, nearby site" fast.

| Brief objective | Our feature | Scope |
|---|---|---|
| Curated sites (Apollo, CLPS, commercial, other countries) + custom coordinates | Site library + custom lat/lon | A data, B UI |
| Side-by-side comparison | Scenario board (2–4 site+date cards) | B |
| Date flexibility, lunar days & seasons | Date range + slip slider ±60 days | B |
| Sun & Earth vs horizon | D3 polar sky plot with real terrain horizon | B (horizons from A) |
| Time remaining before sunset / Earthset | Countdown on every card | B (definition in contract) |
| Solar elevation, sunlight duration, Earth windows | Metrics panel | A defines/validates, B renders |
| Temporal dynamics | Timeline + **Play** animation | B |
| 2D / 3D views | 2D map + sky plot; **3D terrain + lander** | B (terrain from A) |
| Accessibility across skill levels | Planner / Explore modes, plain-language texts | B UI, A texts |
| Why small changes matter | Local illumination heatmap (stretch) | A data, B UI |
| No atmosphere, terrain, libration | Method page + validation report | A |

**Demo hooks (must exist, they sell the project in 5 seconds):**
1. Preset button **"Compare: Apollo 11 (equator) vs Artemis III region (south pole)"**: one click, two scenario cards and two sky plots side by side.
2. **Play** on the timeline: Sun and Earth glide over the jagged south-pole horizon, the solar disc gets cut and the "Sun visible" state flips live.
3. App opens straight into a south-pole scenario, not an empty form.

## Architecture

```
NASA data (LOLA DEM, JPL Horizons)
   │  scope A
   ▼
pipeline/ (Python, offline) ──► web/public/data/*.json|*.bin  (small, committed)
                                       │  contract
                                       ▼  scope B
                          web/ (React + Vite + TS, D3, Three.js; static, no backend)
```

- No backend. The site works offline once loaded.
- Metrics: `pipeline/metrics.py` (A) and `web/src/lib/metrics.ts` (B) implement `docs/contract.md` §3 identically and both pass `validation/fixtures/metrics_cases.json` (written by A, first thing).

## Hard rules (both scopes)

1. **No facts from memory.** Every coordinate, date, mission status and data URL has a source URL in `sites.json` or `docs/sources.md`. Unsourced means it's left out.
2. **Label non-real data.** Mocks have `meta.synthetic = true`. Approximations have `meta.approximate = true`. The UI shows a badge for both.
3. **No guarantees in copy.** Use "Sun visible" and "Earth in view", never "power available" or "link available".
4. **Fixed conventions** (contract §1): UTC ISO 8601 with `Z`, degrees, longitude east-positive −180..180, azimuth from north clockwise.
5. **Contract first.** If output doesn't match the contract, fix the output. Contract changes go by PR, bump `contract_version`, and notify the other human.
6. **Never edit outside your scope.** Need something from the other scope? Write it in your `docs/status-X.md` under "Requests to other scope" and tell your human.
7. Small commits, no file > 5 MB, no raw NASA data in git (`data/raw/` is ignored).
8. **Reproducibility.** Generated files record inputs (product, URL, resolution, query, time) in `meta`.

## Physics & data notes

- Lunar mean radius R = 1737.4 km. No atmosphere → no refraction.
- Horizon mask: 720 rays (0.5° azimuth). For each sample at ground distance d, height h: `angle = atan2(h − (h0 + observer_height) − d²/(2R), d)`. Take the max per ray. Range 150 km (polar), 100 km (others). Observer heights 2 m and 10 m.
- **LOLA polar DEMs are in Polar Stereographic projection (metres from the pole), not lat/lon.** Convert (lat, lon) → projected x, y with `pyproj` using the CRS from the file label. If the CRS is missing, use the **Moon sphere**: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs`. **Never use Earth EPSG codes.** Then index with `rasterio` `index()`/`rowcol()`. March rays in the projected plane, but compute `d` as true ground distance: divide planar distance by the local scale factor `k = 2/(1+sin|lat|)`, or use great-circle distance.
- LOLA global DEMs are simple cylindrical and may use longitude 0..360. Convert from our −180..180 and handle the wrap.
- DEM choice: |lat| ≥ 80° → polar product; otherwise global. Record the choice in `meta.inputs`.
- Sun disc angular radius ≈ 0.2666°, Earth ≈ 0.95°. Visible fraction per contract §3.
- Libration and Moon orientation come from JPL Horizons (Moon-fixed site). Don't re-implement them.

## Overall priority order

1. Fixtures + mocks → web renders end to end on mocks. (A: fixtures, B: mocks + UI)
2. Real data for 3 demo sites: `apollo_11`, a south-pole landed or CLPS site, an Artemis III candidate region. (A)
3. Sky plot, timeline with Play, countdowns, metrics, 2-card comparison, **Apollo vs South Pole preset**. (B)
4. 3D terrain + lander for the 3 demo sites. (A: heightmaps, B: viewer)
5. Full site library (~20), slip slider, window finder, Planner/Explore modes. (A + B)
6. Validation report, method page, Explore texts. (A)
7. Stretch: custom-coordinate horizon (Web Worker), local illumination heatmap, CSV export.

## Shared timeline (CET)

| When | Milestone |
|---|---|
| Sat 14, ASAP | A: fixtures pushed. B: mocks + scaffold pushed. Both on `main`. |
| Sat 14, ~14:00 | **CP1:** 1 real site end to end (A data → B UI) |
| Sat 14, ~20:00 | **CP2:** 3 demo sites real + validated, terrain heightmaps out. **Contract frozen.** |
| Sun 15, 08:00 | **Feature freeze.** Bug fixes, deploy, README only |
| Sun 15, 08:00–11:30 | 30-s video, slides, demo rehearsal (`docs/demo-script.md`) |
| Sun 15, 12:30 | Submitted (30 min buffer before 13:00) |

## Budget (two Pro plans)

Each lead runs Opus. Each lead has **at most 2 teammates, on Sonnet**. No extra subagents unless the lead asks. Never print raw DEM or full ephemeris arrays into context; inspect with scripts. If blocked for more than ~20 minutes, stop and report instead of looping.

## Definition of done (any task)

Output matches the contract. Tests pass. Nothing synthetic is unlabelled. Sources are recorded. A one-line note goes in your `docs/status-X.md`.
