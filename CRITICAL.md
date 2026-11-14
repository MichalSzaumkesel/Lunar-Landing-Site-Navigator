# CRITICAL — cross-scope notices

Read this **at the start of every session and before starting every new task**. The version on `main` is the one that counts:

```bash
git fetch -q origin && git show origin/main:CRITICAL.md
```

## What goes here

Only things the **other scope must act on**:
- a contract change (new or changed field, file or metric definition),
- a broken or wrong data file already on `main`,
- a changed demo site ID, a changed path, or a blocker that changes the plan or timeline.

Not here: progress updates (they go in `docs/status-A.md` / `docs/status-B.md`) or ideas.

## Rules

1. **Append-only.** Never delete or rewrite an entry. To close one, change its `Status`.
2. **Only humans commit this file to `main`.** Agents (leads included) draft the entry in their status file under "Draft CRITICAL notice". Their human reviews it and commits it straight to `main`. This file is the one exception to "PR + approval", because it must land fast.
3. **A notice is not a contract change.** If the notice changes the contract, the contract PR must follow. Until it merges, the notice says what to do in the meantime.
4. **Acknowledge.** When the affected scope has done the action, its lead adds one line under the entry: `ACK <scope> <time> — <what was done>`. The author sets `Status: closed` once it's ACKed.
5. Agents: if a notice is `open` and affects your scope, **do it before your current task continues**, or report to your lead if you can't.

## Entry template

```
### C-00X · <short title>
- Date (CET): 2026-11-14 15:20
- From: scope A | scope B
- Affects: scope A | scope B | both
- Severity: blocking | must-fix-before-freeze
- Contract: none | v1.2.0 PR #__ (pending/merged)
- What changed / what's wrong:
- Action required:
- Workaround until fixed:
- Status: open
```

---

## Notices

### C-001 · Ephemeris count in the contract example is wrong (18264, should be 18288)
- Date (CET): 2026-11-14 12:02
- From: scope B
- Affects: scope A
- Severity: must-fix-before-freeze
- Contract: v1.2.0 PR #5 (pending, fixes the example)
- What changed / what is wrong: contract 2.3 shows count 18264. Hourly samples from 2026-12-01T00:00Z to 2028-12-31T23:00Z inclusive are 18288 (762 days incl. the 2028 leap day). The web loader reads count from each file and the mocks already use 18288.
- Action required: write the real sample count (18288) in every ephem file; approve PR #5.
- Workaround until fixed: none needed on B side.
- Status: open
ACK scope A 2026-11-14 13:36 — all 21 ephem files on main carry count 18288 (hourly 2026-12-01T00Z..2028-12-31T23Z); check_contract.py verifies count = array lengths. A's human approves PR #5 once the §2.8 pole_pa_deg wording fix (see C-002) is applied.

### C-002 · Proposal: optional earth_orientation.json (contract 1.2.0)
- Date (CET): 2026-11-14 12:02
- From: scope B
- Affects: scope A (one new optional file), contract (additive section 2.8)
- Severity: nice-to-have, not blocking CP1 or CP2
- Contract: v1.2.0 PR #5 (pending)
- What changed / what is wrong: the Earth texture in the 3D view has no true orientation (which side faces the Moon, axis tilt). PR #5 adds section 2.8: one global hourly file with sub_lunar_lat_deg, sub_lunar_lon_deg and pole_pa_deg. Scope A verifies the Horizons quantities and records the query in meta.inputs.
- Action required: A decides after the 3 demo sites whether to produce it; if yes, adjust field names in PR #5. Note: pipeline/common.py, tests and fixtures pin contract_version 1.1.1; bump them when PR #5 merges (B only reads count from files, not the version).
- Workaround until fixed: none, UI labels the texture orientation as illustrative.
- Status: open
ACK scope A 2026-11-14 13:36 — web/public/data/earth_orientation.json is on main (18288 hourly samples; Horizons target 399 from 500@301, QUANTITIES 14,17; exact query in meta.inputs). Field names kept as in PR #5. sub_lunar_lon is east-positive −180..180, sub_lunar_lat is planetodetic. pole_pa_deg is measured from the Moon's north pole, NOT Earth's celestial north (checked against Horizons vectors, ≤ 0.18°) — PR #5 §2.8 wording must say so. File says contract_version 1.1.1 until PR #5 merges; then scope A bumps all files to 1.2.0.

### C-003 · "Artemis III" wording is outdated: say "Artemis candidate region"
- Date (CET): 2026-11-14 13:36
- From: scope A
- Affects: scope B
- Severity: must-fix-before-freeze
- Contract: none
- What changed / what's wrong: NASA re-scoped Artemis on 2026-02-27. Artemis III is now an Earth-orbit test and the first crewed landing is Artemis IV (source: https://spacepolicyonline.com/news/nasa-makes-a-course-correction-for-the-artemis-program/). The 9 south-pole regions from NASA's 2024 list are still the latest official candidate list. Scope A renames its own data (sites.json names become "Artemis candidate region — <Region>") and docs.
- Action required: in UI copy, tests and the preset, say "Artemis candidate region" and never imply an Artemis III landing date. Preset button label (web/src/config/presets.ts): "Compare: Apollo 11 (equator) vs South Pole (Artemis candidate region)".
- Workaround until fixed: none needed; names come from sites.json once A's rename is merged.
- Status: open

### C-004 · Illumination heatmaps on main + grid orientation
- Date (CET): 2026-11-14 13:36
- From: scope A
- Affects: scope B
- Severity: must-fix-before-freeze (only if B renders the heatmap)
- Contract: v1.2.0 (the PR #5 diff should add the orientation text to §2.6, pending)
- What changed / what's wrong: illum/southpole_landed.json is on main; illum/artemis_region_1.json follows. Contract §2.6 does not define the grid orientation. Files use: pct_sunlit[row][col], row 0 = NORTH edge, col 0 = WEST edge (same as terrain), 21×21, spacing_m 200, centre cell (10,10) = the site; east offset = (col−10)·spacing_m, north offset = (10−row)·spacing_m. meta.approximate = true; a top-level `notes` string lists the approximations.
- Action required: render with this orientation and show the "approximate" badge.
- Workaround until fixed: none needed.
- Status: open

### C-005 · Temporary ownership: web/src/components/map/ → scope A until freeze
- Date (CET): 2026-11-14 21:40
- From: scope A (agreed with scope B)
- Affects: both
- Severity: blocking
- Contract: basemap files — separate notice to follow
- What changed: until Sun 08:00 CET scope A owns web/src/components/map/ (basemap layers,
  south-pole map, heatmap layer). Scope B does not edit it. Shared files (state/, app/, types,
  package.json) stay scope B's; scope A requests changes there via scope B.
- Action required: scope B — don't touch components/map/; review and merge PR from a/ui-map.
- Status: open