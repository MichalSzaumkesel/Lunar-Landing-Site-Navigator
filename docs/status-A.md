# Status A (Data & Science)

Lead: Claude (Opus). Last update: 2026-11-14 ~15:40 CET. Scope A work complete (A0–A10). See Handoff below.

## Tasks

| # | Task | Status | Notes |
|---|---|---|---|
| A0 | `validation/fixtures/metrics_cases.json` | done | 11 hand-derived cases (≤ 24 samples). Schema note at the top. Builder: `validation/fixtures/build_metrics_cases.py` (assembles JSON only, never runs an implementation). |
| A1 | `pipeline/` scaffold + `check_contract.py` | done | `requirements.txt`, `pytest.ini`, `common.py` (meta, compact writer), stub modules. B's mocks pass the checker (10 files, 0 errors). |
| A2 | `metrics.py` passing fixtures | done | 27 pytest tests pass (11 fixture cases + unit tests + checker tests). |
| A3 | `sites.json` with the 3 demo IDs, sourced | done (a/pipeline) | apollo_11 (LROC), southpole_landed = IM-2 Athena, Mons Mouton (LROC), artemis_region_1 = Mons Mouton Plateau (LROC mosaic centre, labelled). elevation_m from DEM. |
| A4 | `ephem/<id>.json` for the 3 demo sites | done (a/pipeline) | Horizons, 18288 hourly samples each. Re-queried at 50 random times (TLIST): max error 0.0006–0.0012° (pass, threshold 0.05°). |
| A5 | `horizon/<id>.json` for the 3 demo sites | done (a/pipeline) | LDEM_1024 (Apollo 11, 100 km), LDEM_80S_20M (polar, 150 km). Polar orientation verified vs 3 IAU crater centres (0.3–1.7 km). PGDA illumination at both polar points within 2 pp. |
| A6 | `terrain/<id>.json + .bin` | done (a/pipeline) | 256², 80 m. Direction consistent with horizon masks (corr 0.86–0.98). |
| A7 | `validation.json` | done | 41 checks, all pass (see Handoff). |
| A8 | Full `sites.json` (~20) + ephem + horizon | done (a/pipeline) | 21 sites. DEMs: LDEM_1024 (Apollo 11), LDEM_256 (other non-polar), LDEM_80S_20M / 80S_40M / 75S_60M (polar). Least robust: artemis_region_2 (pct_sunlit ±7.3 pp). Terrain only for the 3 demo sites. |
| A9 | `method.md`, `explore-texts.md`, `sources.md` | done, first version (a/research) | 7 Explore snippets with ids; numbers from our files or sourced references. |
| A10 | (stretch) `illum/<id>.json` | done (southpole_landed, artemis_region_1) | 21×21, 200 m, ~36 s per site. vs PGDA: r 0.98 at both, median |Δ| 0.9 pp. meta.approximate = true. |

How to run:

```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/pytest pipeline                       # tests (metrics vs fixtures, checker)
.venv/bin/python pipeline/check_contract.py     # validate everything in web/public/data
.venv/bin/python validation/fixtures/build_metrics_cases.py   # regenerate fixtures
```

## Contract points that are ambiguous (Phase 0 findings)

1. **Shape of "null plus reason `beyond_data`"** (§3) is not defined. The fixtures use `gaps: { sunset?|sunrise?|earthset?|earthrise?: "beyond_data" }`, with a key present only when that `next_*_utc` is null. This matches `ScenarioMetrics.gaps` in `web/src/lib/types.ts`, so it also answers B's request 2.
2. **Transition search range.** "beyond the data range" is read as *beyond the ephemeris coverage*. A sunset after `t1` but inside the data is still reported (fixture `interval_subset_of_coverage`). B's `metrics.ts` does the same.
3. **Reference time `t_ref`** is not defined: not its default, and not its value between samples. In practice: default is `t0`, and between samples az/el are interpolated linearly, as both implementations do. The fixtures keep `t_ref` exactly on a sample, so they don't depend on this.
4. **Rounding of transition times.** Not specified. Both implementations round to the nearest whole second and compute `time_to_*` from the rounded time. All fixture events fall on whole seconds.
5. **"Floats rounded to 3 decimals"** conflicts with §2.3's own `sun_ang_radius_deg: 0.2666`. `check_contract.py` and `common.write_json` exempt the two angular radii.
6. **§2.1 `mission` / `agency` / `country`**: the contract doesn't say whether they can be null. B's mocks use null, and custom or candidate sites may have no mission. The checker accepts null and warns only on real data.
7. **§2.3 example `count: 18264`** is wrong. Hourly samples from 2026-12-01T00Z to 2028-12-31T23Z inclusive are 18288 (762 days × 24). The `meta` example also says `"1.0.0"`. B already reported both. A will write the true count.
8. **CLAUDE.md horizon formula** mixes units (`h` in m, `d` in km). This is scope-A internal only: compute in metres throughout. No action for B.

## Proposed contract change (v1.1.2, clarifications only, no format change)

For the humans to decide. Agents don't edit the contract.

```diff
 ## 3. Metric definitions
+Reference time t_ref defaults to t0. Between samples, az/el at t_ref are linearly interpolated (az across 0/360).
+Transitions are searched from t_ref to the end of the ephemeris coverage (they may fall after t1).
+Transition times are rounded to the nearest second; time_to_* uses the rounded time.
+Null transitions carry a reason in `gaps: { "<sunset|sunrise|earthset|earthrise>": "beyond_data" }`;
+a key is present if and only if the matching next_*_utc is null.
 ## 2.1
+`mission`, `agency`, `country` may be null (custom sites, candidate regions).
 ## Serialization
-with floats rounded to 3 decimals.
+with floats rounded to 3 decimals (except the constants sun_ang_radius_deg / earth_ang_radius_deg).
 ## 2.3
-  "count": 18264,
+  "count": 18288,
```

## Handoff (end of scope A work, 2026-11-14)

### Done (all on main after the final merge)
- **Data** (`web/public/data/`, real, contract 1.1.1): `sites.json` (21 sourced sites), `ephem/` + `horizon/` for all 21, `terrain/` for the 3 demo sites, `illum/` for southpole_landed + artemis_region_1, `earth_orientation.json`, `validation.json`.
- **Validation** (41/41 pass): ephem vs Horizons re-query (13 sites, ≤ 0.0012°); polar DEM orientation vs 3 IAU craters (0.3–1.7 km); PGDA illumination at 2 polar points (≤ 2 pp) and heatmaps (r 0.98, median 0.9 pp); horizon sensitivity per site (21); metrics.ts vs fixtures (11/11) and metrics.py vs metrics.ts on real data (180 values, max 5.7e-14).
- **Docs**: `method.md`, `explore-texts.md`, `sources.md`, `pitch.md`. CRITICAL C-001..C-004 entries/ACKs on main.

### Known limitations
- Ephem check compares with Horizons itself (different query form), not an independent ephemeris model.
- Coverage 2026-12-01..2028-12-31 only; historical Apollo dates are outside the data range.
- Disc cut assumes a locally straight horizon; Sun/Earth angular radii constant; no refraction (none on the Moon), no lander self-shadowing, no power/thermal model ("Sun visible" ≠ power).
- Global sites other than Apollo 11 use LDEM_256 (118 m); horizon uncertainty per site 0.05–1.2° (`uncertainty_deg`). Least robust: artemis_region_2 (pct_sunlit ±7.3 pp under DEM ×2 / ±1 px).
- `pct_earth` uses the centre rule; PGDA's any-part rule gives higher numbers (82.0 % vs 94.2 % at southpole_landed).
- Artemis region points are LROC mosaic centres, not surveyed region centres; `region_radius_km` null (no source). IM-2 landing time approximate (~17:30Z).
- Heatmaps: Sun direction transported from the site; single cells can differ from PGDA by up to 36.6 pp.
- Contract items still pending: PR #5 (1.2.0; `pole_pa_deg` wording = from the Moon's north pole) and §2.6 grid orientation. After PR #5 merges: set `pipeline/common.py` CONTRACT_VERSION and `validation/fixtures/build_metrics_cases.py` CONTRACT_VERSION to 1.2.0, rerun the generators below (cache only), rerun tests.

### How to regenerate (repo root, cached data, no refetch if `data/raw/` is present)
```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
export LLSN_RAW_DIR=$PWD/data/raw           # DEM windows, Horizons + PGDA caches (git-ignored)
.venv/bin/python pipeline/run_site.py apollo_11 southpole_landed artemis_region_1   # horizon → ephem → terrain → sites.json
.venv/bin/python pipeline/run_site.py <site_id> ...                                  # any other site in pipeline/sites_input.json
.venv/bin/python pipeline/illum.py southpole_landed                                  # heatmap (≈ 36 s); also artemis_region_1
.venv/bin/python pipeline/fetch_earth_orientation.py
.venv/bin/python validation/build_validation_json.py                                 # collects validation/results/*.json
.venv/bin/python pipeline/check_contract.py                                          # must be 0 errors
.venv/bin/pytest pipeline                                                            # 43 tests
.venv/bin/python validation/fixtures/build_metrics_cases.py                          # fixtures (hand-derived)
```
New site: add a sourced row to `pipeline/sites_input.json` (source URL mandatory), then `run_site.py <id>`, then the validation scripts in `validation/` (`check_ephem_independent.py`, `check_horizon_sensitivity.py`), then `build_validation_json.py`. Horizons requests are sequential with ≥ 1 s spacing; never parallelise. metrics.ts cross-check needs Node ≥ 22: `node --experimental-strip-types validation/check_metrics_ts_fixtures.mts`.

## Key numbers (2-year window 2026-12..2028-12, observer 2 m, from metrics.py)

| Site | pct_sunlit 2 m | 10 m | longest_dark_h | pct_earth |
|---|---|---|---|---|
| apollo_11 | 49.6 | 49.7 | 356 | 100 |
| southpole_landed (IM-2) | 45.1 | 45.9 | 459 | 82.0 |
| artemis_region_1 (Mons Mouton Plateau, ~15 km from IM-2) | 24.5 | 31.5 | 581 | 66.8 |

## CRITICAL notices from scope B

- C-001 (ephem count 18288): satisfied — all 21 ephem files have count 18288.
- C-002 / PR #5 (earth_orientation.json, contract 1.2.0): file produced on a/pipeline (contract_version 1.1.1 until PR #5 merges). `pole_pa_deg` is measured from the Moon's north pole, not Earth's celestial north (verified against Horizons vectors, ≤ 0.18°); PR #5 §2.8 wording must say so before approval. After merge: bump CONTRACT_VERSION to 1.2.0 and regenerate meta (cached).

## Open questions for the human

- NASA re-scoped Artemis on 2026-02-27 (source: spacepolicyonline.com/news/nasa-makes-a-course-correction-for-the-artemis-program/): Artemis III is now an Earth-orbit test, the first crewed landing is Artemis IV. The nine regions are still the latest official list. Should B relabel "Artemis III region" → "Artemis candidate region"? (Draft notice below if yes.)

## Requests to other scope

0. (For B, new) `illum/southpole_landed.json` grid orientation, not specified in contract §2.6: `pct_sunlit[row][col]`, row 0 = NORTH edge, col 0 = WEST edge (same as terrain), centre cell (10,10), east offset = (col−10)·spacing_m, north offset = (10−row)·spacing_m. The file also has a top-level `notes` string. Propose adding both to §2.6 in the next contract PR.

1. (Info for B) The fixtures are at `validation/fixtures/metrics_cases.json` once `a/phase0` is merged. Each case's `horizon`/`ephem` already have the `HorizonFile`/`EphemFile` field names, so a vitest can call `computeMetrics({horizon, ephem}, {observerHeightM, startMs: Date.parse(t0_utc), endMs: Date.parse(t1_utc), refMs: Date.parse(t_ref_utc)})` and compare against `expected` with `tolerance_abs`. A has only read `metrics.ts`, not run it (no Node on A's machine). Please run the fixtures and report any mismatch here.
2. (For both humans) `docs/scope-A-data.md` and `docs/scope-B-web.md` exist on A's machine but are **not on `main`**, although CLAUDE.md refers to them. Please commit them as shared files.

## Draft CRITICAL notice

(Only if the human agrees on the Artemis wording.)

```
### C-00X · "Artemis III" wording is outdated
- Date (CET): <fill in>
- From: scope A
- Affects: scope B
- Severity: must-fix-before-freeze
- Contract: none
- What changed / what's wrong: NASA re-scoped Artemis on 2026-02-27; Artemis III is no longer the first crewed landing
  (source in docs/sources.md). The 9 south-pole regions remain the latest official candidate list. sites.json names
  artemis_region_1 "Artemis III candidate region — Mons Mouton Plateau".
- Action required: in UI copy and the preset label, say "Artemis candidate region" (or "Artemis III candidate region
  (2024 list)"), never imply an Artemis III landing date.
- Workaround until fixed: none needed.
- Status: open
```

Earlier draft (Phase 0):

Not sent. For A's human to review and commit to `main` if you agree. Agents never commit CRITICAL.md.

```
### C-00X · Metrics fixtures on main + pinned §3 semantics
- Date (CET): <fill in when committed>
- From: scope A
- Affects: scope B
- Severity: must-fix-before-freeze
- Contract: v1.1.2 clarification PR (pending, no format change)
- What changed / what's wrong: validation/fixtures/metrics_cases.json (11 cases) is on main. §3 left open how a
  null transition's reason is written and how far transitions are searched. The fixtures pin it as:
  `gaps: {sunset|sunrise|earthset|earthrise: "beyond_data"}` (key present iff next_* is null), search from t_ref
  to the end of the ephemeris coverage (may be after t1), event times rounded to the nearest second.
  web/src/lib/metrics.ts already follows all of this on reading.
- Action required: run the fixtures in vitest against metrics.ts; report any failing case in docs/status-B.md.
- Workaround until fixed: none needed.
- Status: open
```

Also: A agrees with B's draft C-001 (ephem `count` 18288). If it is committed, ACK line for A:
`ACK scope A <time> — ephem files will carry the real count (18288); contract example fix included in the v1.1.2 proposal.`
