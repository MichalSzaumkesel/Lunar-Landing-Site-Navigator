# Data contract

`contract_version: 1.1.1`. Shared between scope A (produces data) and scope B (consumes it). Changes only via PR approved by the other human. Agents never edit this file.

The contract defines every file in `web/public/data/` and every metric, exactly. Scope A's pipeline (Python) produces the files. Scope B's web app (TypeScript) consumes them. Both implement §3 identically, and scope A's validator checks that they agree.

> **Before relying on any part of this contract, check `CRITICAL.md` on `main`** (`git show origin/main:CRITICAL.md`). An open notice there may announce a pending change to this file or a temporary workaround. Every contract change must have a matching notice in `CRITICAL.md`.

**Serialization:** all JSON is written compact (`json.dump(..., separators=(',', ':'))`), with floats rounded to 3 decimals. The web app **loads per-site files lazily** (only for sites in open scenarios) and caches them.

---

## 1. Global conventions

| Item | Convention |
|---|---|
| Time | UTC, ISO 8601 with `Z`, e.g. `2027-03-14T06:00:00Z` |
| Angles | Degrees, float, rounded to 3 decimals in files |
| Latitude | −90..90, planetocentric, south negative |
| Longitude | **East-positive**, −180..180 |
| Azimuth | From local north, **clockwise** (N=0, E=90, S=180, W=270), 0 ≤ az < 360 |
| Elevation | Above the local horizontal plane of the reference sphere (R = 1737.4 km). No refraction |
| Heights | Metres, relative to the 1737.4 km reference sphere |
| Distances | km |
| IDs | `snake_case`, ASCII, stable (e.g. `apollo_11`, `im2_mons_mouton`) |

Every JSON file has a top-level `meta` object:

```json
"meta": {
  "contract_version": "1.0.0",
  "generated_utc": "2026-11-14T03:12:00Z",
  "generator": "pipeline/horizon.py@<git short sha>",
  "synthetic": false,
  "approximate": false,
  "inputs": [ { "name": "LOLA LDEM_85S_20M", "url": "https://...", "notes": "..." } ]
}
```

`synthetic: true` means fake data (mocks). `approximate: true` means real data with a known simplification. The UI must show a visible badge for either.

---

## 2. Files

### 2.1 `sites.json`

```json
{
  "meta": { ... },
  "sites": [
    {
      "id": "apollo_11",
      "name": "Apollo 11 — Tranquility Base",
      "category": "apollo",
      "mission": "Apollo 11",
      "agency": "NASA",
      "country": "USA",
      "lat_deg": 0.0,
      "lon_deg": 0.0,
      "elevation_m": null,
      "landing_date_utc": "1969-07-20T20:17:40Z",
      "status": "landed",
      "region_radius_km": null,
      "source": { "title": "...", "url": "https://..." },
      "notes": ""
    }
  ]
}
```

- `category`: one of `apollo`, `clps`, `commercial`, `international`, `artemis_region`, `custom`.
- `status`: one of `landed`, `crashed`, `planned`, `candidate_region`.
- `region_radius_km`: for Artemis candidate **regions**. `lat/lon` is then a representative point and must be described in `notes`.
- `elevation_m`: from the DEM at the site (filled in by the pipeline). Can be `null` in mocks.
- `source` is **mandatory**. No source means the site isn't in the file.
- The coordinates above are placeholders and must be replaced from sources.

### 2.2 `horizon/<site_id>.json`

```json
{
  "meta": { ... },
  "site_id": "shackleton_rim",
  "az_step_deg": 0.5,
  "n": 720,
  "observer_heights_m": [2, 10],
  "masks": {
    "2":  [0.812, 0.815, ...],
    "10": [0.790, 0.793, ...]
  },
  "dem": {
    "product": "LOLA LDEM_85S_20M",
    "resolution_m": 20,
    "url": "https://...",
    "max_range_km": 150
  },
  "uncertainty_deg": 0.05
}
```

- `masks[h][i]` is the horizon elevation (deg) at azimuth `i * az_step_deg` for observer height `h` m above the ground.
- The algorithm is defined in `CLAUDE.md` → Physics notes and includes curvature (`d²/2R`).
- Smooth-sphere fallback (no DEM): all values are `0.0` minus curvature dip for `h`. Set `meta.approximate = true`.
- Horizon at an arbitrary azimuth: **linear interpolation** between neighbouring samples, with wrap-around at 360°.

### 2.3 `ephem/<site_id>.json`

```json
{
  "meta": { ... },
  "site_id": "shackleton_rim",
  "start_utc": "2026-12-01T00:00:00Z",
  "step_minutes": 60,
  "count": 18264,
  "sun":   { "az": [...], "el": [...] },
  "earth": { "az": [...], "el": [...] },
  "sun_ang_radius_deg": 0.2666,
  "earth_ang_radius_deg": 0.95,
  "horizons_query": { "CENTER": "coord@301", "COORD_TYPE": "GEODETIC", "SITE_COORD": "lon,lat,alt_km", "QUANTITIES": "4", "STEP_SIZE": "1h" }
}
```

- Sample `k` is at `start_utc + k * step_minutes`.
- Coverage: **2026-12-01T00:00Z → 2028-12-31T23:00Z** (hourly, inclusive).
- Source: JPL Horizons API (`https://ssd.jpl.nasa.gov/api/horizons.api`), targets Sun (`10`) and Earth (`399`), observer at the site on the Moon (body `301`). String values are quoted in single quotes in the request (e.g. `START_TIME='2026-12-01'`). The data agent must verify parameter names against the Horizons API docs and record the exact query in `horizons_query`.
- Fetching: **sequential, ≥ 1 s between requests, never parallel.** Raw responses are cached in `data/raw/horizons/` and never re-fetched if present.
- Size: about 500 KB per file compact. That's acceptable because it's lazy-loaded and the static host gzips it.
- Apparent azimuth and elevation, airless (no refraction).
- Angular radii are stored as constants (variation < 2%, which we accept and document).
- Historical Apollo dates are outside the coverage range. The UI says "outside data range" and does not extrapolate.

### 2.4 `validation.json` (owner: validator)

```json
{
  "meta": { ... },
  "checks": [
    { "id": "ephem_vs_horizons_shackleton", "kind": "ephemeris", "site_id": "shackleton_rim",
      "max_abs_error_deg": 0.004, "n_samples": 50, "pass": true, "threshold_deg": 0.05, "notes": "" }
  ]
}
```

### 2.5 `terrain/<site_id>.json` + `terrain/<site_id>.bin` (for the 3D view)

Produced for the 3 demo sites first, then for any site where time allows.

```json
{
  "meta": { ... },
  "site_id": "shackleton_rim",
  "size_px": 256,
  "spacing_m": 80,
  "frame": "local_tangent_enu",
  "origin": "site",
  "encoding": "uint16-le",
  "bin": "terrain/shackleton_rim.bin",
  "height_min_m": -4200.0,
  "height_max_m": 1900.0,
  "site_height_m": 1200.0,
  "dem": { "product": "...", "resolution_m": 20, "url": "https://..." }
}
```

- The `.bin` file is `size_px × size_px` uint16 values, row-major. Row 0 is the **north** edge and column 0 is the **west** edge. The site is at the centre pixel `(size_px/2, size_px/2)`.
- Height decoding: `h = height_min_m + v / 65535 × (height_max_m − height_min_m)`, in metres relative to the reference sphere. The viewer subtracts `site_height_m`, so the site sits at z = 0.
- Frame: local East-North-Up at the site. +x is east, +y is north, +z is up. Sun and Earth directions in the 3D view come from the same ephemeris az/el: `(sin az·cos el, cos az·cos el, sin el)`.
- Default extent is 256 × 80 m ≈ 20 km. Curvature is not applied to the mesh (it's visual only, and the metrics come from the horizon files).
- 256² × 2 B ≈ 128 KB per site.

### 2.6 Optional (stretch) `illum/<site_id>.json`

A local heatmap of `pct_sunlit` for a grid around the site, over a stated period.

```json
{ "meta": {...}, "site_id": "...", "period": {"start_utc": "...", "end_utc": "..."},
  "grid": { "center_lat": 0, "center_lon": 0, "spacing_m": 200, "nx": 41, "ny": 41 },
  "pct_sunlit": [[...], ...] }
```

### 2.7 Mocks (owner: scope B)

`web/public/data/mock/` mirrors the real structure (`sites.json`, `horizon/`, `ephem/`, `terrain/`) for 3 sites with the same IDs as the demo sites, with `meta.synthetic = true`. The web app picks real data per site when present and falls back to mock otherwise, showing the "synthetic" badge. `VITE_USE_MOCK=1` forces mocks everywhere.

Demo site IDs (fixed so both scopes can work in parallel): `apollo_11`, `southpole_landed` (scope A picks the actual site and sets the name), `artemis_region_1` (likewise).

---

## 3. Metric definitions (identical in `pipeline/metrics.py` and `web/src/lib/metrics.ts`)

Notation, for a body B ∈ {sun, earth} at sample time t:

- `H(az)` = horizon elevation at azimuth az (interpolated, for the selected observer height).
- `clear_B(t) = el_B(t) − H(az_B(t))` is the **clearance** (deg) of the body's centre above the terrain horizon.
- `r_B` = angular radius of B.
- `x = clamp(clear_B / r_B, −1, 1)`
- **Visible disc fraction** `frac_B(t) = 0.5 + (x·√(1−x²) + asin(x)) / π`. This treats the horizon as locally straight across the disc, which is a documented approximation.
- `sunlit(t) := frac_sun(t) ≥ 0.5`, i.e. the Sun's centre is above the terrain horizon.
- `earth_in_view(t) := frac_earth(t) ≥ 0.5`
- `both(t) := sunlit(t) ∧ earth_in_view(t)`

Over an interval [t0, t1) of N samples:

| Metric | Definition | Unit |
|---|---|---|
| `sun_el_deg` | `el_sun` at the reference time (local horizontal, ignores terrain) | deg |
| `sun_clearance_deg` | `clear_sun` at the reference time | deg |
| `pct_sunlit` | share of samples with `sunlit` × 100 | % |
| `mean_sun_frac` | mean of `frac_sun` × 100 | % |
| `longest_dark_h` | longest run of consecutive `¬sunlit` samples × step | h |
| `pct_earth` | share of samples with `earth_in_view` × 100 | % |
| `longest_no_earth_h` | longest run of `¬earth_in_view` | h |
| `pct_both` | share of samples with `both` × 100 | % |
| `next_sunset_utc` | first time ≥ t_ref where `sunlit` goes true → false | ISO / null |
| `next_sunrise_utc` | first time ≥ t_ref where `sunlit` goes false → true | ISO / null |
| `next_earthset_utc`, `next_earthrise_utc` | the same for `earth_in_view` | ISO / null |
| `time_to_sunset_h`, `time_to_earthset_h` | difference from t_ref, `null` if the event is beyond the data range | h |

Transition times: linear interpolation of `clear_B` between the two bracketing samples, solved for `clear_B = 0`.

`null` plus the reason `"beyond_data"` when no transition exists within coverage. A body that stays above the horizon for the whole window is shown as "No sunset in data range", not 0.

### Window finder rules (frontend type)

```ts
type MissionRules = {
  observerHeightM: 2 | 10;
  missionDurationH: number;      // e.g. 240
  minPctSunlit: number;          // e.g. 70
  maxLongestDarkH: number;       // e.g. 48
  earthAtLandingRequired: boolean;
  minPctEarth: number;           // e.g. 50
  minSunElAtLandingDeg?: number;
};
```

A candidate landing time `T` (hourly) is **valid** if every rule holds for the interval [T, T + missionDurationH), and `earth_in_view(T)` when required. The output is a list of contiguous valid windows `{start_utc, end_utc}` per site.

---

## 4. Test fixtures (both implementations must pass)

Written by scope A **first**, before anything else. `validation/fixtures/metrics_cases.json` holds small hand-made cases (≤ 48 samples) with expected metric values. These include a disc half-cut by the horizon, a body never setting, a single transition between samples, and azimuth wrap-around at 359.5°→0°. `pytest` and `vitest` both run them.

---

## 5. Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-14 | Initial |
| 1.1.1 | 2026-11-14 | Link to CRITICAL.md; every contract change needs a CRITICAL notice |
| 1.1.0 | 2026-11-14 | Compact JSON + lazy load; Horizons fetch rules; terrain heightmaps (§2.5); fixed demo site IDs; mocks owned by scope B |
