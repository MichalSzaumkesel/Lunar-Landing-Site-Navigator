# Explore-mode texts

Plain-language snippets for the Explore mode (max 60 words each). Numbers come from our files (2026-12-01 to 2028-12-31, hourly, observer 2 m unless stated) or from a sourced reference. Do not rephrase into "power available" or "link available".

Data basis: `web/public/data/ephem/*.json`, `web/public/data/horizon/*.json`, `pipeline/metrics.py` (contract section 3); PGDA numbers from `validation/results/illum_ref_*.detail.json`.

### sun_skims_horizon
At the lunar poles the Sun never climbs high. At our south-pole landed site its highest point in two years is only 6.8 degrees above the flat horizon, so even a small hill or crater rim can hide it. At Apollo 11, near the equator, it reaches almost straight overhead.

### apollo_vs_pole
Apollo 11's site: Sun visible 49.6% of the time, with nights up to 356 hours (about 15 days). At the south-pole landed site: Sun visible 45.1%, longest dark spell 459 hours. Only about 15 km away, in the Artemis candidate region point, it drops to 24.5%. Short moves matter at the poles.

### mast_helps
Standing taller helps at the poles. At the Artemis candidate region point, raising the observer from 2 m to 10 m lifts "Sun visible" from 24.5% to 31.5%. At the south-pole landed site the gain is smaller (45.1% to 45.9%). At Apollo 11 there is almost none (49.6% to 49.7%).

### small_moves_matter
Half a kilometre can change the answer. NASA's LOLA illumination map, averaged over about 18.6 years, shows the Sun above the horizon between 32% and 51% of the time within roughly 1 km of the south-pole landed site, and between 6% and 44% around the Artemis candidate point.

### earth_in_view_wobble
Earth does not stay put in the lunar sky. The Moon's orbit is not a perfect circle and is tilted, so it seems to nod and turn slightly (libration). At the south-pole landed site, Earth sits between -2.5 and 11.1 degrees elevation, so it is in view 82.0% of the time.

### sun_visible_meaning
"Sun visible" means the centre of the Sun is above the terrain horizon we computed from NASA elevation data. It does not mean power is available: panel angle, temperature, dust and shadows from features smaller than our map can still matter. "Earth in view" likewise does not mean a radio link works.

### why_two_years
Our Sun and Earth positions cover December 2026 to December 2028. Polar lighting repeats over about 18.6 years, so two years are a snapshot, not a long-term average. Dates outside this range show "outside data range" instead of a guess.

## Sources for the numbers
- Sun maximum elevation 6.8 deg (southpole_landed), Earth elevation -2.45 to 11.1 deg: `ephem/southpole_landed.json`.
- pct_sunlit, longest_dark_h, pct_earth for 2 m and 10 m: `pipeline/metrics.py` over the full ephemeris (Apollo 11: 49.6 / 356 h, 49.7 % at 10 m; southpole_landed: 45.1 % / 459 h, 45.9 % at 10 m, Earth 82.0 %; artemis_region_1: 24.5 % at 2 m, 31.5 % at 10 m).
- Distance between southpole_landed (-84.791, 29.196) and artemis_region_1 (-84.3, 30.6): 15.4 km (great circle on R = 1737.4 km).
- PGDA ranges 31.8-51.4 % and 6.4-44.0 % in a 9 x 9 pixel block (120 m per pixel, about 1.1 km wide): PGDA LOLA polar illumination, https://pgda.gsfc.nasa.gov/products/69, Mazarico et al. 2011, Icarus 211, 1066-1081.
- Libration explanation: https://science.nasa.gov/moon/moon-phases/ ("orbit is not perfectly circular", "5 degree tilt of the Moon's orbit").
- 18.6-year cycle: https://pgda.gsfc.nasa.gov/products/69 (averages over one lunar nutation cycle, about 18.6 years).
