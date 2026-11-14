# Scope A — Data & Science

Read `CLAUDE.md` and `docs/contract.md` first. You produce **data and truth**. Scope B (another person's team) builds the UI on mocks and switches to your files per site as you deliver. Your output is useful only when it is **on `main` and matches the contract**.

## Ownership

`pipeline/`, `data/raw/` (git-ignored), `web/public/data/` (except `mock/`), `validation/`, `docs/method.md`, `docs/explore-texts.md`, `docs/sources.md`, `docs/status-A.md`.

Do not touch anything in `web/` other than `web/public/data/` (non-mock).

## Deliverables in order

| # | Deliverable | Needed by B for |
|---|---|---|
| A0 | `validation/fixtures/metrics_cases.json` (contract §4) — **first, within the first hour** | metrics.ts tests |
| A1 | `pipeline/` scaffold: `requirements.txt` (numpy, rasterio, pyproj, requests, pytest), `check_contract.py` | — |
| A2 | `metrics.py` passing fixtures | validation |
| A3 | `sites.json` with the 3 demo IDs (`apollo_11`, `southpole_landed`, `artemis_region_1`), sourced | CP1 |
| A4 | `ephem/<id>.json` for the 3 demo sites (Horizons, sequential, cached) | CP1 |
| A5 | `horizon/<id>.json` for the 3 demo sites (polar stereographic handled!) | CP1/CP2 |
| A6 | `terrain/<id>.json + .bin` for the 3 demo sites | 3D view |
| A7 | `validation.json`: ephem vs independent Horizons samples; metrics.py vs metrics.ts on the same inputs; horizon sanity check for one south-pole site vs a published result / Quickmap view | CP2 |
| A8 | Full `sites.json` (~20 sites) + ephem + horizon for each | site library |
| A9 | `docs/method.md`, `docs/explore-texts.md` (incl. Apollo 11 vs south pole contrast, why 500 m matters), `docs/sources.md` | Explore mode, slides |
| A10 (stretch) | `illum/<id>.json` local heatmap for 1–2 south-pole sites | "why small changes matter" |

**CP1 (Sat ~14:00):** one demo site with real `ephem` + `horizon` on `main`. **CP2 (Sat ~20:00):** all 3 demo sites real, validated, terrain out.

## Initial prompt for the scope A lead (paste into Claude Code, model: Opus)

```
You are the lead of SCOPE A (Data & Science) of a two-scope project. Read CLAUDE.md, docs/contract.md
and docs/scope-A-data.md fully. Another person's team owns scope B (web UI) and works in parallel on mocks;
never edit their files. Work on branches a/*; your human merges to main.

PHASE 0 — you alone:
1. Write validation/fixtures/metrics_cases.json (contract §4): ≥ 8 tiny cases with expected values
   computed by hand-checked Python, incl. half-cut disc, never-setting body, transition between samples,
   azimuth wrap 359.5°→0°, beyond_data. Commit and tell the human to merge it to main NOW (scope B needs it).
2. Scaffold pipeline/ (requirements incl. pyproj, pytest config, check_contract.py), .gitignore data/raw/.
3. Create docs/status-A.md with a task table, a "Requests to other scope" section and a "Draft CRITICAL notice" section.

PHASE 1 — create an agent team with 2 teammates, both on Sonnet:

- "pipeline" (owns pipeline/, data/raw/, web/public/data/ except mock/):
  Order: metrics.py (pass fixtures) → fetch_ephem.py → fetch_dem.py + horizon.py → terrain.py.
  * Horizons: sequential requests, time.sleep(1.0) between them, never parallel; quote string params
    ('...'); cache raw responses in data/raw/horizons/ and skip fetching if cached; verify parameter
    names against the official Horizons API docs; store the exact query in horizons_query.
  * LOLA polar DEMs are polar stereographic: use pyproj with the CRS from the label, or the Moon-sphere
    proj string in CLAUDE.md; never Earth EPSG. March rays in projected metres, correct distance by the
    scale factor. Global DEM: longitude 0..360 vs our −180..180, handle wrap.
  * Download only the tiles/products needed; don't load whole DEMs into context; print only summaries.
  * Compact JSON, 3 decimals, run check_contract.py on every output.
  Start with the 3 demo site IDs; ping the lead after each one lands.

- "research-validator" (owns validation/ except fixtures, docs/method.md, docs/explore-texts.md,
  docs/sources.md):
  1. FIRST: source the 3 demo sites (apollo_11; one south-pole landed/CLPS/commercial site for
     southpole_landed; one current Artemis III candidate region for artemis_region_1) with lat/lon,
     date, status and a primary source URL; hand them to "pipeline" for sites.json.
  2. Then source ~17 more sites (Apollo 12–17, CLPS/commercial, China, India, Japan, others, more
     Artemis regions). Every row has a URL; flag conflicts; nothing from memory.
  3. Validation (A7) as each demo site lands. Report numbers honestly, including failures.
  4. method.md, explore-texts.md (short, plain language, for an educator and the public), sources.md.

LEAD DUTIES:
- Before assigning or starting any new task, run `git fetch -q origin && git show origin/main:CRITICAL.md`.
  Open notices affecting scope A come first; tell teammates, and add an ACK line draft for your human.
  Teammates do the same check before each new task.
- To notify the other scope, draft a CRITICAL notice (template in CRITICAL.md) in docs/status-A.md
  under "Draft CRITICAL notice" and ask your human to commit it to main. Never commit CRITICAL.md yourself.
- Keep docs/status-A.md current. Tell your human the moment CP1 and CP2 are reached so they merge
  and notify scope B.
- Contract changes: only propose them (write the diff in status-A.md); humans decide.
- Priority if time runs short: 3 demo sites correct > validation > more sites > texts > heatmap.
- Feature freeze Sun 08:00 CET. After that only fixes.
- When done, clean up the team.
```

## Optional: one-shot research session (before Phase 1, if you have budget)

Run in a separate session to save the team's context. Output goes to `docs/research.md` and `web/public/data/sites_draft.json`.

```
Research for NASA Space Apps 2026 "Lunar Landing Site Navigator". Read CLAUDE.md and docs/contract.md. No code.
1. Sites (~20): Apollo 11–17; CLPS/commercial landers (esp. south pole); other countries' landers;
   current NASA Artemis III candidate regions. lat, lon (east-positive), landing date UTC, status,
   primary source URL. Flag conflicting coordinates.
2. LOLA DEM products (south polar + global): exact names, resolution, projection, coverage, URLs, sizes.
3. JPL Horizons API: exact parameters for apparent Sun/Earth az/el from a lat/lon/alt site on the Moon,
   hourly, CSV; output line limits; one example URL.
4. Published south-pole illumination / Earth-visibility numbers for named sites we can validate against.
Every claim needs a URL; mark uncertain items UNVERIFIED.
```
