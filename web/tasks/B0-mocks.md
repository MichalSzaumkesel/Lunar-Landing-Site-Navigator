# Task B0-mocks: synthetic mock data generator

You are a worker for the scope B lead of a Vite + React + TypeScript project (working directory: `web/`). Follow this brief exactly. Where it is silent, choose the simplest option and list the choice under OPEN in your final report.

## 1. Goal

Write one deterministic Node script that generates synthetic mock data files for three lunar sites, in the exact file formats of the data contract. The files feed a UI that is being built in parallel. Every file is synthetic and must say so.

## 2. Writable paths

- `scripts/gen-mocks.mjs` (create)
- `public/data/mock/**` (create or overwrite generated files only)

## 3. Read-only references

- `../docs/contract.md`, sections 1, 2.1, 2.2, 2.3, 2.5 and 2.7 (file formats). Follow its field names exactly.
- `src/lib/types.ts` (TypeScript shapes of the same files).

## 4. Spec

Plain Node ESM, no dependencies, no network. `npm run gen:mocks` (already wired to `node scripts/gen-mocks.mjs`) writes everything below. Use a seeded PRNG (mulberry32) so two runs give byte-identical output. Compact JSON (`JSON.stringify` with no spacing). Round every float to 3 decimals.

### 4.1 Common

- `meta` in every JSON file: `{ "contract_version": "1.1.1", "generated_utc": "2026-11-14T00:00:00Z" (fixed constant), "generator": "web/scripts/gen-mocks.mjs", "synthetic": true, "approximate": false, "inputs": [{ "name": "Synthetic analytic model", "url": "", "notes": "Fake data for UI development. Not a measurement." }] }`
- Site ids and mock parameters (latitude, longitude in degrees, east positive):

| id | lat | lon | character |
|---|---|---|---|
| `apollo_11` | 0.0 | 0.0 | almost flat horizon |
| `southpole_landed` | -89.5 | 45.0 | jagged horizon with high ridges |
| `artemis_region_1` | -87.0 | -30.0 | moderate relief, a low flat sector at azimuth 120..240 |

### 4.2 `public/data/mock/sites.json`

`{ meta, sites: [...] }` with three sites in the order above, fields per contract 2.1:
`id`, `name` (`"[MOCK] Equatorial site"`, `"[MOCK] South-pole lander site"`, `"[MOCK] Artemis III candidate region"`), `category` (`apollo`, `clps`, `artemis_region`), `mission` null, `agency` null, `country` null, `lat_deg`, `lon_deg`, `elevation_m` null, `landing_date_utc` null, `status` (`landed`, `planned`, `candidate_region`), `region_radius_km` (null, null, 5), `source` `{ "title": "Synthetic mock, not a real source", "url": "" }`, `notes` (`"Synthetic placeholder. Real coordinates come from scope A's sites.json."`).

### 4.3 `public/data/mock/horizon/<id>.json`

Fields per contract 2.2: `meta`, `site_id`, `az_step_deg` 0.5, `n` 720, `observer_heights_m` [2, 10], `masks` with string keys `"2"` and `"10"`, each an array of 720 numbers (degrees), `dem` `{ "product": "SYNTHETIC", "resolution_m": 0, "url": "", "max_range_km": 0 }`, `uncertainty_deg` 0.

Build the 2 m mask first, index i is azimuth `i * 0.5` degrees from north, clockwise. It must be continuous across the wrap (value at index 719 close to value at index 0), so build it from periodic functions of azimuth only:
- `smooth(az) = sum over k = 1..6 of a_k * sin(k * az_rad + phase_k)`, with `a_k` and `phase_k` drawn from the PRNG and `a_k` scaled so the smooth part has an amplitude of `A` degrees.
- `peaks`: a list of ridges. Each ridge is `height * exp(-0.5 * (d / width)^2)` where `d` is the circular azimuth distance in degrees to the ridge centre.
- Mask = `base + smooth + sum(peaks)`, then clamp to `[-0.5, 12]`.

Per site:
- `apollo_11`: base 0.2, A = 0.1, no peaks. Result stays within about 0.0..0.6.
- `southpole_landed`: base 0.6, A = 1.2, 9 peaks with centres spread around the circle (one centre exactly at azimuth 0 and one at 180), widths 2..6 degrees, heights 1.5..6 degrees. The ridge at azimuth 0 must show high values both at the start and at the end of the array.
- `artemis_region_1`: base 0.5, A = 0.5, 5 peaks of height 0.8..2.2 and width 4..8 degrees, centres outside azimuth 120..240; then multiply the mask by 0.1 for azimuths inside 120..240 (a low flat sector).

The 10 m mask is `mask2[i] - 0.107`, rounded. (Observer-height dip of a smooth sphere: 0.193 deg at 10 m versus 0.086 deg at 2 m.)

### 4.4 `public/data/mock/ephem/<id>.json`

Fields per contract 2.3: `meta`, `site_id`, `start_utc` `"2026-12-01T00:00:00Z"`, `step_minutes` 60, `count`, `sun` `{ az: [...], el: [...] }`, `earth` `{ az: [...], el: [...] }`, `sun_ang_radius_deg` 0.2666, `earth_ang_radius_deg` 0.95, `horizons_query` `{ "MOCK": "synthetic" }`.

`count` is the number of hourly samples from 2026-12-01T00:00Z to 2028-12-31T23:00Z inclusive. Compute it in code from the two dates; it must come out as 18288 (the contract text says 18264, which is wrong; do not copy it). All four arrays have `count` entries; sample k is at `start + k` hours. Azimuths in `[0, 360)` degrees from north clockwise, elevations in degrees, no refraction.

Model. `t` is days since start (`k / 24`). `phi` is the site latitude, `lam` the site longitude, in radians. Use these formulas literally:

Sun:
- `T_syn = 29.530589`; hour angle `H = 2 * PI * t / T_syn - lam + 1.0`
- declination `delta = radians(1.54) * sin(2 * PI * t / 365.25 + 0.7)`
- `sin(el) = sin(phi) * sin(delta) + cos(phi) * cos(delta) * cos(H)`
- `az = atan2(-cos(delta) * sin(H), sin(delta) * cos(phi) - cos(delta) * sin(phi) * cos(H))`, converted to degrees and normalised to `[0, 360)`

Earth (libration of the sub-Earth point, in degrees):
- `phi_e = 6.7 * sin(2 * PI * t / 27.212 + 0.3)`, `lam_e = 7.9 * sin(2 * PI * t / 27.555 + 1.1)`; convert to radians
- `d = lam_e - lam`
- `sin(el) = sin(phi) * sin(phi_e) + cos(phi) * cos(phi_e) * cos(d)`
- `az = atan2(sin(d) * cos(phi_e), cos(phi) * sin(phi_e) - sin(phi) * cos(phi_e) * cos(d))`, degrees, normalised to `[0, 360)`

Use `asin` for the elevation and clamp its argument to `[-1, 1]`.

### 4.5 `public/data/mock/terrain/<id>.json` and `<id>.bin`

Fields per contract 2.5: `meta`, `site_id`, `size_px` 256, `spacing_m` 80, `frame` `"local_tangent_enu"`, `origin` `"site"`, `encoding` `"uint16-le"`, `bin` `"terrain/<id>.bin"`, `height_min_m`, `height_max_m`, `site_height_m`, `dem` `{ "product": "SYNTHETIC", "resolution_m": 0, "url": "" }`.

The `.bin` file is 256 x 256 uint16 little-endian values, row-major, row 0 is the north edge, column 0 is the west edge, the site is at pixel (128, 128). Height in metres: `h = height_min_m + v / 65535 * (height_max_m - height_min_m)`, so quantise with `v = round((h - min) / (max - min) * 65535)`. `height_min_m` and `height_max_m` are the actual minimum and maximum of the generated heights (3 decimals), `site_height_m` is the height at pixel (128, 128).

Generate heights with seeded 2D value noise (bilinear interpolation of a random lattice, 5 octaves, each octave halving amplitude and doubling frequency):
- `apollo_11`: amplitude 20 m (gentle).
- `southpole_landed`: amplitude 500 m, plus a bowl: subtract `700 * exp(-(r / 3000)^2)` metres, `r` the distance in metres from the point 1500 m east and 1000 m north of the centre, plus a raised rim `+150 * exp(-((r - 3000) / 500)^2)`.
- `artemis_region_1`: amplitude 300 m, with a smooth slope of 3 degrees rising towards the north.

### 4.6 Self-check at the end of the script

Print one line per site, no arrays: file sizes in KB; `count`; Sun elevation min, max and the percentage of samples with `sun el > horizon(az)` (use linear interpolation of the 2 m mask, wrap at 360); Earth elevation min, max and the percentage of Earth samples above the horizon; horizon min and max; terrain min, max and site height. Exit non-zero if any array length is wrong, any azimuth is outside `[0, 360)`, any value is NaN, or any file is larger than 5 MB.

## 5. Acceptance

1. `npm run gen:mocks` exits 0 and prints the summary lines.
2. Running it a second time leaves every output file byte-identical (check with a file hash and say so).
3. Report the summary numbers per site.

Expected character, to sanity-check your numbers (not a hard assertion): `apollo_11` Sun above the horizon roughly half of the time and Earth almost always in view; `southpole_landed` Sun above the horizon only part of the time and Earth in view part of the time; the Earth elevation at `southpole_landed` stays within about plus or minus 7 degrees.

## 6. Forbidden

- No git commands that change state (no commit, branch, push, stash, reset).
- No edits outside the Writable paths. Do not touch `src/`, `package.json` or anything under `../`.
- No new npm packages. No network access.
- Do not spawn other agents; this task is small.

## 7. Final report

End with exactly:

```
STATUS: done | blocked
FILES: <one path per line>
COMMANDS: <command> -> <exit code>
NUMBERS: <the summary lines and the hash check result>
OPEN: <questions or deviations from the spec, or "none">
```
