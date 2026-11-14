# Status B (Web App & Demo)

Lead: Claude (Opus). Last update: 2026-11-14, wave 9. Scope B work is complete; what remains needs the repo owner or a human.

Remote: `origin` is `MichalSzaumkesel/Lunar-Landing-Site-Navigator` (private). PRs 1 to 13 are merged except PR 5.

## Built

- Static web app (Vite, React, TypeScript, d3, three, zustand), no backend, reading the real contract 1.1.1 data from `web/public/data/` (21 sites, `earth_orientation.json`) with a per-site fallback to labelled synthetic mocks.
- Compare: up to 4 scenario cards, compare table, presets (Apollo 11 vs South Pole Artemis candidate region, South pole, Same site 14 days later), observer 2 m or 10 m, slip of +-60 days.
- Sky and time: polar sky plot, panorama, loupe (visible fraction of the solar disc), elevation chart, shared relative time cursor with Play, Sun and Earth countdowns.
- 3D view (lazy loaded): terrain, shadows, movable lander, local sunlight heatmap and Find sunniest spot (Web Workers), Earth texture oriented from `earth_orientation.json`.
- Planning: mission rules and mission bar, window map (Web Worker), Moon map, site library, custom coordinates (client-side approximation, labelled `Approximate`).
- Simple and Advanced modes, tutorial tour, demo mode and 30 s video variant with WebM recording, share link, CSV, card PNG and dossier export, optional sound (off by default).
- Wording: only "Sun visible", "Sun below horizon", "Earth in view", "Earth below horizon"; "Artemis candidate region" everywhere (C-003); no power or link claims.
- Wave 9: demo captions now show the app's own percentages (Sun visible and Earth in view of both cards; Sun visible before and after the 14-day slip), fallback names say "Artemis candidate region", and docs/demo-script.md and README.md were checked against the code.

## Verified

- `npm run typecheck`, `npm run lint` and `npm test` pass: 93 test files, 932 tests (wave 9, local, Windows). The production build and CI checks passed on GitHub Actions (Linux) for the previous merges.
- The metrics in TypeScript match the shared fixtures (11 of 11) and the Python pipeline on real data (scope A, `web/public/data/validation.json`, 41 of 41 checks pass).
- README links, scripts, files, env variables and feature claims were checked against the code in wave 9.

## Not verified / open

- **No live URL.** The Deploy web workflow fails at the Pages step (404): GitHub Pages is not enabled. See requests below.
- Not tested on the demo projector hardware; WebGL fallback is the Polar and Panorama views (see `docs/demo-script.md`).
- No screenshots in the repository yet (README lists planned files).
- The recorded 30 s video file does not exist yet; the recorder runs in the browser.
- Numbers in `docs/pitch.md` (2027-01 window at the IM-2 site) differ from the default demo window (30 days from 2027-10-06); both come from the data, but they must not be mixed on stage.
- The `illum/` files from scope A are used for validation only; the app computes its own heatmap.

## Requests to scope A and the humans

1. **Deploy (repo owner).** Enable GitHub Pages (Settings, Pages, Source: GitHub Actions; a private repo needs a paid plan) or deploy with Vercel (root `web`, build `npm run build`, output `dist`, `VITE_BASE=/`).
2. **Contract PR 5 (1.2.0) is still open.** It needs scope A's human to approve it after the section 2.8 wording fix (`pole_pa_deg` is measured from the Moon's north pole, as in the C-002 ACK) and the section 2.6 grid orientation text. Until then the data files say 1.1.1.
3. **Pins to contract 1.2.0 (scope A, after PR 5).** Bump `CONTRACT_VERSION` in `pipeline/common.py` and `validation/fixtures/build_metrics_cases.py`, rerun the generators and tests. Web reads `count` from files, not the version, so no web change is needed. The README states contract 1.1.1; update it to 1.2.0 with the same PR.
4. **ACK lines for a human to add to `CRITICAL.md`** (agents do not edit it):
   - C-003: `ACK scope B 2026-11-14 — UI copy, preset label, tests and demo captions say "Artemis candidate region"; no Artemis III landing date is implied. Names come from sites.json. Status: done.`
   - C-004: `ACK scope B 2026-11-14 — the app does not render illum/ files; the 3D heatmap is computed in the browser from local terrain. If illum/ is rendered later, the orientation (row 0 = north, col 0 = west) and the Approximate badge will be used. Status: no action for B.`
5. **Optional custom-site service (`api/`)** stays not agreed (no owner in CLAUDE.md, response wrapper not in the contract). The client-side fallback is in place, so nothing is blocked.
