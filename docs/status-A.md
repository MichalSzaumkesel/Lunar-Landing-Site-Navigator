# Status A (Data & Science)

Lead: Claude (Opus). Last update: 2026-11-14, Phase 0 done on branch `a/phase0` (not merged yet).

## Tasks

| # | Task | Status | Notes |
|---|---|---|---|
| A0 | `validation/fixtures/metrics_cases.json` | done | 11 hand-derived cases (≤ 24 samples). Schema note at the top. Builder: `validation/fixtures/build_metrics_cases.py` (assembles JSON only, never runs an implementation). |
| A1 | `pipeline/` scaffold + `check_contract.py` | done | `requirements.txt`, `pytest.ini`, `common.py` (meta, compact writer), stub modules. B's mocks pass the checker (10 files, 0 errors). |
| A2 | `metrics.py` passing fixtures | done | 27 pytest tests pass (11 fixture cases + unit tests + checker tests). |
| A3 | `sites.json` with the 3 demo IDs, sourced | not started | Phase 1 |
| A4 | `ephem/<id>.json` for the 3 demo sites | not started | Phase 1. Real count is 18288 (see request 1). |
| A5 | `horizon/<id>.json` for the 3 demo sites | not started | Phase 1 |
| A6 | `terrain/<id>.json + .bin` | not started | Phase 1 |
| A7 | `validation.json` | not started | |
| A8 | Full `sites.json` (~20) + ephem + horizon | not started | |
| A9 | `method.md`, `explore-texts.md`, `sources.md` | not started | |
| A10 | (stretch) `illum/<id>.json` | not started | |

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

## Requests to other scope

1. (Info for B) The fixtures are at `validation/fixtures/metrics_cases.json` once `a/phase0` is merged. Each case's `horizon`/`ephem` already have the `HorizonFile`/`EphemFile` field names, so a vitest can call `computeMetrics({horizon, ephem}, {observerHeightM, startMs: Date.parse(t0_utc), endMs: Date.parse(t1_utc), refMs: Date.parse(t_ref_utc)})` and compare against `expected` with `tolerance_abs`. A has only read `metrics.ts`, not run it (no Node on A's machine). Please run the fixtures and report any mismatch here.
2. (For both humans) `docs/scope-A-data.md` and `docs/scope-B-web.md` exist on A's machine but are **not on `main`**, although CLAUDE.md refers to them. Please commit them as shared files.

## Draft CRITICAL notice

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
