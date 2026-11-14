# Pitch material (scope A)

For slides. Every number is from `web/public/data/*.json`, `validation/results/`, `pipeline/metrics.py` or a cited source. Period of all our numbers: 2026-12-01 to 2028-12-31, hourly, observer 2 m unless stated. Wording: "Sun visible" and "Earth in view", never "power available" or "link available". Regions are "Artemis candidate regions (NASA 2024 list)".

## 1. Problem
- Mission planners, educators and the public need to compare lunar landing sites and dates quickly.
- What matters: where the Sun and Earth sit relative to the local horizon, for power potential and direct-to-Earth windows.
- Existing tools (Quickmap, Moon Trek, JPL Horizons) are powerful but slow for "same site, new date" or "same date, nearby site".
- Missions slip, so planners must re-evaluate fast.

## 2. Method
- Horizons from real terrain: NASA LOLA elevation models, 720 rays (0.5 deg), curvature drop, 100 km range (150 km at the pole), observer 2 m and 10 m.
- Sun and Earth: JPL Horizons, hourly for two years, apparent azimuth and elevation, no refraction.
- Metrics defined once in a contract and implemented twice (Python and TypeScript): Sun visible %, longest dark spell, Earth in view %, sunset and Earthset countdowns.
- 21 sites, each coordinate with a source URL (Apollo, CLPS, China, India, Japan, Artemis candidate regions).
- Static offline web app, no backend.

## 3. Validation (39 of 39 checks pass; `web/public/data/validation.json`)
- Ephemeris: our Sun and Earth files match a fresh JPL Horizons query within 0.0012 deg at 13 sites (50 random hours each; limit 0.05 deg). This checks our files against Horizons with a different query form; it is not an independent ephemeris model.
- Map orientation: best-fit crater bowls in our polar DEM lie 0.3 km (Shackleton), 1.7 km (Shoemaker) and 1.2 km (de Gerlache) from the IAU/USGS crater centres.
- NASA illumination maps (PGDA, 18.6-year average): our Sun and Earth shares agree within 2 percentage points at two south-pole sites, with the caveat that PGDA itself varies strongly within 1 km.
- Horizon sensitivity (DEM coarser x2 and x4, site moved one pixel): uncertainty per site from 0.05 deg (southpole_landed) to 1.2 deg (apollo_12); all 21 pass. Share of Sun visible changes by less than 0.9 percentage points at most sites (largest: 7.3 at artemis_region_2).
- Metrics, two implementations: the web app's TypeScript matches the shared test fixtures 11 of 11 (largest numeric error 4.7e-12), and matches the Python pipeline on real data (3 sites x 2 observer heights x 2 windows, 180 values) to 5.7e-14, with no mismatches.

## 4. Three contrasts
**(a) Equator vs pole.** Apollo 11: the Sun peaks at 89.8 deg and Earth is always in view (100 %, 58 to 74 deg up). South-pole IM-2 site: the Sun never exceeds 6.8 deg and Earth is in view 82.0 % of the time, between -2.5 and 11.1 deg.

**(b) 15 km apart.** IM-2 landing point: Sun visible 45.1 %, longest dark spell 459 h. Mons Mouton Plateau region point (15.4 km away): 24.5 %, longest dark spell 581 h. A 10 m mast lifts the second to 31.5 %.

**(c) Date slip.** IM-2 site, a 14-day (336 h) mission, Sun visible:

| Start (UTC, 00:00) | Sun visible | Longest dark spell | Earth in view |
|---|---|---|---|
| 2027-01-01 | 6.8 % | 313 h | 65.2 % |
| 2027-01-08 (+7 d) | 56.8 % | 145 h | 100 % |
| 2027-01-15 (+14 d) | 94.0 % | 20 h | 89.3 % |
| 2027-01-31 (+30 d) | 7.7 % | 310 h | 83.9 % |

Slipping 14 days moves the same mission from 6.8 % to 94.0 %; slipping 30 days brings it back to 7.7 %. Across all daily start dates in the data, a 14-day window ranges from 0 % to 100 %. Dates are hourly samples; the figures are what the model gives for the Sun's centre above the computed horizon, not a power forecast.

## 5. Sources
- Terrain: LOLA LDEM_80S_20M / 80S_40M / 75S_60M / 256 / 1024, https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/
- Sun and Earth: JPL Horizons API, https://ssd-api.jpl.nasa.gov/doc/horizons.html
- Site positions: LROC, https://lroc.im-ldi.com/ ; NASA NSSDCA, https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html
- Artemis candidate regions (2024 list of 9): https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- Crater centres: USGS/IAU Gazetteer, https://planetarynames.wr.usgs.gov/
- Illumination reference: PGDA LOLA polar illumination, https://pgda.gsfc.nasa.gov/products/69 (Mazarico et al. 2011, Icarus 211, 1066-1081)
- Full list with per-value URLs: `docs/sources.md`; method: `docs/method.md`.
