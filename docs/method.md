# Method: how the numbers are made

**What this tool does:** for a site and a date range it shows where the Sun and Earth are relative to the real local horizon, and counts how much of the time each is above it. It is a planning aid. It does not model power, heat or radio links.

## Data
- **Terrain:** NASA LOLA digital elevation models from the PDS Geosciences Node (LRO-L-LOLA-4-GDR-V1.0). Each site uses one product, recorded in its horizon file (`dem` block and `meta.inputs`): south-polar LDEM_80S_20M (20 m per pixel) for the demo polar sites, LDEM_80S_40M (40 m) or LDEM_75S_60M (60 m) for other polar sites, LDEM_1024 (about 30 m) at Apollo 11, and LDEM_256 (about 118 m) at the other library sites. Heights are relative to a 1737.4 km sphere.
- **Sun and Earth positions:** JPL Horizons, observer on the Moon at the site, apparent azimuth and elevation without refraction (the Moon has no atmosphere). Hourly, 2026-12-01 to 2028-12-31 (18288 samples). We do not re-implement libration or Moon orientation; Horizons provides them.
- **Sites:** coordinates come from LROC and NASA NSSDCA pages listed in `docs/sources.md`; every site has a source URL.

## Horizon
For each site we cast 720 rays (0.5 deg apart) over a 100 km range (150 km at the pole). Along each ray, the angle to a terrain point at ground distance d and height h is `atan2(h - (h0 + observer) - d^2/(2R), d)`, where h0 is the site height and R the Moon's radius; the `d^2/2R` term is the curvature drop. The horizon at that azimuth is the maximum over the ray. We compute it for observer heights of 2 m (lander deck height) and 10 m (mast). Polar-stereographic DEMs are indexed with the Moon-sphere projection, and distance is true ground distance.

## Metrics (contract section 3, in words)
- **Clearance** = elevation of the body's centre minus the horizon elevation in its direction.
- **Sun visible** (`sunlit`) = the Sun's centre is above the horizon. **Earth in view** = the same for Earth's centre. `both` = both at once.
- `pct_sunlit`, `pct_earth`, `pct_both` = share of the hourly samples in the chosen window. `longest_dark_h` = longest run of hours with the Sun not visible. `mean_sun_frac` = mean visible fraction of the solar disc.
- Sunset, sunrise, Earthset, Earthrise = moments the centre crosses the horizon (linear interpolation between samples). If none occurs in the data we say "beyond data".
- **Note for comparisons:** PGDA's illumination products count Earth as visible if any part of its disc is visible. Ours uses the centre. At the south-pole landed site, Earth is in view 82.0 % of the time by our centre rule and 94.2 % by the any-part rule.

## What is approximate
- The disc cut uses a straight horizon across the disc; real jagged horizons differ in detail.
- Angular radii are constants (Sun 0.2666 deg, Earth 0.95 deg); the real values vary by a few percent.
- The data cover two years. Lunar illumination repeats over about 18.6 years, so two years is not a long-term average.
- DEM resolution ranges from 20 m (polar demo sites) to about 118 m (most library sites). Rims and boulders below that scale are not in the horizon. Each horizon file carries an `uncertainty_deg`, set per site from a sensitivity test (DEM coarsened x2 and x4, site moved by one pixel in four directions). Worst-case RMS horizon change: 0.03 deg at southpole_landed, 0.25 deg at artemis_region_1, 0.10 deg at Apollo 11, 0.03 to 1.15 deg on the 118 m sites, 0.68 deg at im1_odysseus (60 m DEM), 0.75 deg at artemis_region_2 (40 m DEM). The resulting change in `pct_sunlit` is under 0.9 percentage points at most sites; the largest are artemis_region_2 (7.3 pp), artemis_region_1 (2.1 pp) and im1_odysseus (1.6 pp). This covers DEM resolution and position only, not LOLA height or geolocation error.
- The global DEM is a gridded product, so features smaller than its pixel size are not captured at the Apollo sites.
- Observer heights are 2 m and 10 m only. Site height comes from the DEM, not from a surveyed position.
- No thermal, power or communications modelling.

## Validation (files: `validation/results/`, `web/public/data/validation.json`)
- **Ephemeris vs Horizons.** 50 random hours per site, Sun and Earth, re-queried from Horizons with a different request form (discrete Julian-date list, not the start/stop/step table used to build the files). Maximum difference: 0.0009 deg (southpole_landed), 0.0012 deg (artemis_region_1), 0.0006 deg (apollo_11); limit 0.05 deg. This checks that our files match Horizons and that times are mapped correctly. **It is not an independent ephemeris model**: both come from JPL.
- **Polar map orientation.** Using USGS/IAU Gazetteer centres of Shackleton, Shoemaker and de Gerlache, the best-fit crater bowl in our DEM grid lies 0.3, 1.7 and 1.2 km from the listed centres (pass limit: 0.3 crater radii). The seven other orientations (mirrored or rotated) do not pass for all three.
- **Illumination against NASA's polar maps.** PGDA LOLA average-illumination and Earth-visibility rasters (about 18.6-year average, 120 m per pixel). At the two south-pole sites our Sun and Earth shares (matching disc rules, 2 m) differ by at most 1.7 percentage points (southpole_landed 46.8 % vs 46.8 %; artemis_region_1 26.0 % vs 26.0 %). Caveat: within about 1 km of each site PGDA itself varies a lot (32 to 51 % for the Sun at southpole_landed, 6 to 44 % at artemis_region_1), so the close agreement at the point is partly luck. Periods and resolutions also differ. Treat it as a plausibility check, not exact proof.
- **Not yet validated:** horizon profiles against published profiles (none found for these sites), and the global-DEM sites.

## Wording rule
We say **"Sun visible"** and **"Earth in view"**. We never say "power available" or "link available". Seeing the Sun does not guarantee power (panel angle, dust, temperature, terrain shadows below our resolution), and seeing Earth does not guarantee a link (antenna, schedule, ground station).

## Local illumination heatmaps (`illum/southpole_landed.json`, `illum/artemis_region_1.json`, approximate)
A 21 x 21 grid, 200 m spacing (+-2 km), observer 2 m, 2026-12 to 2028-12. Each point gets its own horizon from LDEM_80S_20M (150 km). The Sun direction comes from the site's ephemeris, transported as a body-fixed vector into each point's local frame; reusing the site's az/el would be off by up to 0.72 deg at the corners. The lander's own shadow is not modelled; the file is marked `approximate`. Row 0 is north, column 0 is west. Centre 45.1 % Sun visible (equals the site value); 0 to 51.7 % over the grid, 21.9 to 51.1 % within +-1 km. PGDA's 120 m map shows 31.8 to 51.4 % in its ~1 km neighbourhood: consistent.
- Check against PGDA (`validation/check_illum_heatmap.py`, rule fixed in advance: r >= 0.5 and median difference <= 10 pp over all 441 cells): southpole_landed r = 0.98, median |difference| 0.9 pp, mean difference -1.2 pp (ours lower, as expected from the centre rule), largest cell difference 36.6 pp. Pass. Periods and resolutions differ, so this is a pattern check, not exact proof.
- artemis_region_1 (same method, centre 24.5 % equals the site value, 0 to 53.1 % over the grid): r = 0.98, median |difference| 0.9 pp, mean difference -0.6 pp, largest cell difference 12.7 pp. Pass.
