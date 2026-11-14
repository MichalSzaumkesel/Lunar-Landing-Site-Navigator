"""Builds validation/fixtures/metrics_cases.json (contract §4).

Every expected value below is written by hand from the contract §3 formulas. The
derivation of each one is stored next to it in the case's "derivation" field.
This script never imports or runs pipeline/metrics.py (or any other implementation).
Python is used only as a calculator for closed forms such as 2/3 + sqrt(3)/(4*pi).

Run:  python3 validation/fixtures/build_metrics_cases.py
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).with_name("metrics_cases.json")

CONTRACT_VERSION = "1.1.1"
FIXTURES_VERSION = "1.0.0"

R_SUN = 0.2666   # contract §2.3 constant
R_EARTH = 0.95   # contract §2.3 constant
N_AZ = 720
AZ_STEP = 0.5

# Visible fraction for x = +0.5 and x = -0.5 (closed form, contract §3):
# frac(x) = 0.5 + (x*sqrt(1-x^2) + asin(x)) / pi
# frac(+0.5) = 0.5 + (0.5*sqrt(3)/2 + pi/6)/pi = 2/3 + sqrt(3)/(4*pi)
# frac(-0.5) = 0.5 - (sqrt(3)/4 + pi/6)/pi = 1/3 - sqrt(3)/(4*pi)
F_PLUS_HALF = 2.0 / 3.0 + math.sqrt(3.0) / (4.0 * math.pi)    # 0.804498891...
F_MINUS_HALF = 1.0 / 3.0 - math.sqrt(3.0) / (4.0 * math.pi)   # 0.195501108...

T0 = "2027-01-01T00:00:00Z"

ALL_GAPS = {"sunset": "beyond_data", "sunrise": "beyond_data",
            "earthset": "beyond_data", "earthrise": "beyond_data"}


def const_mask(value: float, overrides: dict[int, float] | None = None) -> list[float]:
    mask = [float(value)] * N_AZ
    for i, v in (overrides or {}).items():
        mask[i] = float(v)
    return mask


def horizon(mask2: list[float], mask10: list[float] | None = None) -> dict:
    return {
        "az_step_deg": AZ_STEP,
        "n": N_AZ,
        "observer_heights_m": [2, 10],
        "masks": {"2": mask2, "10": mask10 if mask10 is not None else list(mask2)},
    }


def ephem(sun_az, sun_el, earth_az, earth_el, step_minutes=60, start=T0) -> dict:
    n = len(sun_el)
    def expand(v):
        return [float(x) for x in (v if isinstance(v, list) else [v] * n)]
    out = {
        "start_utc": start,
        "step_minutes": step_minutes,
        "count": n,
        "sun": {"az": expand(sun_az), "el": expand(sun_el)},
        "earth": {"az": expand(earth_az), "el": expand(earth_el)},
        "sun_ang_radius_deg": R_SUN,
        "earth_ang_radius_deg": R_EARTH,
    }
    for body in ("sun", "earth"):
        assert len(out[body]["az"]) == n and len(out[body]["el"]) == n
    assert n <= 48
    return out


def iso(hours_after_t0: float) -> str:
    base = datetime(2027, 1, 1, tzinfo=timezone.utc).timestamp()
    return datetime.fromtimestamp(base + round(hours_after_t0 * 3600), tz=timezone.utc) \
        .strftime("%Y-%m-%dT%H:%M:%SZ")


def inp(t1_hours: float, t_ref_hours: float = 0.0, t0_hours: float = 0.0, h: int = 2) -> dict:
    return {"observer_height_m": h, "t0_utc": iso(t0_hours), "t1_utc": iso(t1_hours),
            "t_ref_utc": iso(t_ref_hours)}


def expected(**kw) -> dict:
    keys = ["sun_el_deg", "sun_clearance_deg", "pct_sunlit", "mean_sun_frac", "longest_dark_h",
            "pct_earth", "longest_no_earth_h", "pct_both",
            "next_sunset_utc", "next_sunrise_utc", "next_earthset_utc", "next_earthrise_utc",
            "time_to_sunset_h", "time_to_earthset_h", "gaps"]
    assert set(kw) == set(keys), set(keys) ^ set(kw)
    # gaps must list exactly the null transitions
    for ev in ("sunset", "sunrise", "earthset", "earthrise"):
        assert (kw[f"next_{ev}_utc"] is None) == (ev in kw["gaps"]), ev
    return {k: kw[k] for k in keys}


cases: list[dict] = []

# ---------------------------------------------------------------- 1
cases.append({
    "id": "half_cut_disc",
    "covers": ["disc exactly half-cut by the horizon", "sunlit/earth_in_view boundary (frac = 0.5 counts as true)"],
    "description": "Sun and Earth centres sit exactly on a flat 2.0 deg horizon at every sample.",
    "derivation": (
        "H = 2.0 everywhere. el_sun = el_earth = 2.0 -> clear = 0 -> x = 0 -> frac = 0.5 + (0 + asin 0)/pi = 0.5. "
        "sunlit := frac >= 0.5 -> true at all 4 samples; same for Earth. pct_sunlit = pct_earth = pct_both = 100, "
        "mean_sun_frac = 0.5*100 = 50, no dark / no-Earth runs -> 0 h. clear never changes sign -> no transitions -> "
        "all next_* null with gaps beyond_data, time_to_* null. sun_el_deg = 2.0, sun_clearance_deg = 0.0."),
    "horizon": horizon(const_mask(2.0)),
    "ephem": ephem([100, 110, 120, 130], [2.0] * 4, 200, 2.0),
    "input": inp(t1_hours=4),
    "expected": expected(
        sun_el_deg=2.0, sun_clearance_deg=0.0, pct_sunlit=100.0, mean_sun_frac=50.0, longest_dark_h=0.0,
        pct_earth=100.0, longest_no_earth_h=0.0, pct_both=100.0,
        next_sunset_utc=None, next_sunrise_utc=None, next_earthset_utc=None, next_earthrise_utc=None,
        time_to_sunset_h=None, time_to_earthset_h=None, gaps=dict(ALL_GAPS)),
})

# ---------------------------------------------------------------- 2
cases.append({
    "id": "partial_disc_fractions",
    "covers": ["visible disc fraction at x = 0.5", "clamp at x = +-1", "mean_sun_frac", "sunset and sunrise between samples"],
    "description": "Flat 0 deg horizon; Sun clearance r/2, r/2, -r, 2r.",
    "derivation": (
        "r = 0.2666, H = 0. clears = [0.1333, 0.1333, -0.2666, 0.5332] -> x = [0.5, 0.5, -1, 1 (clamped from 2)]. "
        "frac(0.5) = 0.5 + (0.5*sqrt(3)/2 + pi/6)/pi = 2/3 + sqrt(3)/(4 pi) = 0.8044988905; frac(-1) = 0; frac(1) = 1. "
        "mean_sun_frac = 100*(2*0.8044988905 + 0 + 1)/4 = 65.2249445. sunlit = [T,T,F,T] -> pct_sunlit = 75, "
        "longest_dark = 1 sample * 1 h = 1. Sunset between k1 (+0.1333) and k2 (-0.2666): f = 0.1333/0.3999 = 1/3 -> "
        "01:00 + 20 min = 01:20:00Z, time_to_sunset = 4/3 h. Sunrise between k2 (-0.2666) and k3 (+0.5332): "
        "f = 0.2666/0.7998 = 1/3 -> 02:20:00Z. Earth el 10 > 0.95 always -> 100 %, no transitions. pct_both = 75."),
    "horizon": horizon(const_mask(0.0)),
    "ephem": ephem(90, [0.1333, 0.1333, -0.2666, 0.5332], 270, 10.0),
    "input": inp(t1_hours=4),
    "expected": expected(
        sun_el_deg=0.1333, sun_clearance_deg=0.1333, pct_sunlit=75.0,
        mean_sun_frac=100.0 * (2 * F_PLUS_HALF + 1.0) / 4.0, longest_dark_h=1.0,
        pct_earth=100.0, longest_no_earth_h=0.0, pct_both=75.0,
        next_sunset_utc="2027-01-01T01:20:00Z", next_sunrise_utc="2027-01-01T02:20:00Z",
        next_earthset_utc=None, next_earthrise_utc=None,
        time_to_sunset_h=4.0 / 3.0, time_to_earthset_h=None,
        gaps={"earthset": "beyond_data", "earthrise": "beyond_data"}),
})

# ---------------------------------------------------------------- 3
cases.append({
    "id": "never_sets_beyond_data",
    "covers": ["body never setting in range", "null + beyond_data for all four transitions"],
    "description": "Sun circles the sky at 5 deg over a flat 1 deg horizon for 24 h; Earth fixed at 8 deg.",
    "derivation": (
        "H = 1.0 everywhere. clear_sun = 5 - 1 = 4 >= r for every sample (az 0..345 step 15 does not matter for a flat mask) "
        "-> frac 1, sunlit. clear_earth = 7 >= 0.95 -> in view. All pct = 100, mean_sun_frac = 100, runs 0 h. "
        "No sign change of either clearance in the whole coverage -> every next_* is null with reason beyond_data and "
        "time_to_* is null (UI: 'No sunset in data range', not 0). sun_el_deg = 5, sun_clearance_deg = 4."),
    "horizon": horizon(const_mask(1.0)),
    "ephem": ephem([15.0 * k for k in range(24)], [5.0] * 24, 0, 8.0),
    "input": inp(t1_hours=24),
    "expected": expected(
        sun_el_deg=5.0, sun_clearance_deg=4.0, pct_sunlit=100.0, mean_sun_frac=100.0, longest_dark_h=0.0,
        pct_earth=100.0, longest_no_earth_h=0.0, pct_both=100.0,
        next_sunset_utc=None, next_sunrise_utc=None, next_earthset_utc=None, next_earthrise_utc=None,
        time_to_sunset_h=None, time_to_earthset_h=None, gaps=dict(ALL_GAPS)),
})

# ---------------------------------------------------------------- 4
cases.append({
    "id": "single_sunset_between_samples",
    "covers": ["single sunset transition between two samples (interpolated time)", "sunrise beyond_data"],
    "description": "Sun sinks below a flat 0.5 deg horizon once, between 03:00 and 04:00.",
    "derivation": (
        "H = 0.5. el = [3.5, 2.5, 1.5, 1.2998, 0.2334, -0.5] -> clear = [3, 2, 1, 0.7998, -0.2666, -1] "
        "-> frac = [1,1,1,1,0,0] (|x| >= 1). sunlit = [T,T,T,T,F,F]: pct_sunlit = 4/6*100 = 66.666..., "
        "mean_sun_frac = 66.666..., longest_dark = 2 h. Sunset between k3 and k4: f = 0.7998/(0.7998+0.2666) = "
        "0.7998/1.0664 = 0.75 -> 03:45:00Z, time_to_sunset = 3.75 h. No false->true afterwards -> sunrise null "
        "(beyond_data). Earth at 20 deg: 100 %, no transitions. pct_both = 66.666..."),
    "horizon": horizon(const_mask(0.5)),
    "ephem": ephem([250, 251, 252, 253, 254, 255], [3.5, 2.5, 1.5, 1.2998, 0.2334, -0.5], 60, 20.0),
    "input": inp(t1_hours=6),
    "expected": expected(
        sun_el_deg=3.5, sun_clearance_deg=3.0, pct_sunlit=400.0 / 6.0, mean_sun_frac=400.0 / 6.0, longest_dark_h=2.0,
        pct_earth=100.0, longest_no_earth_h=0.0, pct_both=400.0 / 6.0,
        next_sunset_utc="2027-01-01T03:45:00Z", next_sunrise_utc=None,
        next_earthset_utc=None, next_earthrise_utc=None,
        time_to_sunset_h=3.75, time_to_earthset_h=None,
        gaps={"sunrise": "beyond_data", "earthset": "beyond_data", "earthrise": "beyond_data"}),
})

# ---------------------------------------------------------------- 5
cases.append({
    "id": "azimuth_wrap",
    "covers": ["horizon interpolation across 359.5 deg -> 0 deg", "exact sample at index 719"],
    "description": "Mask is 0 except index 719 (az 359.5) = 4.0 and index 0 (az 0) = 2.0. Bodies sit in the wrap gap.",
    "derivation": (
        "H(az) between 359.5 and 360=0 interpolates mask[719]=4 -> mask[0]=2: H(359.75) = 3.0, H(359.9) = 4 + 0.8*(2-4) = 2.4. "
        "Between 0 and 0.5: H(0.25) = 2 + 0.5*(0-2) = 1.0, H(0.1) = 2 + 0.2*(0-2) = 1.6. H(359.5) = 4.0. "
        "Sun az = [359.75, 359.9, 0.25, 359.5], el = [3.1333, 2.2667, 1.5332, 4.0] -> clear = [0.1333, -0.1333, 0.5332, 0] "
        "-> x = [0.5, -0.5, 1 (clamped 2), 0] -> frac = [0.8044988905, 0.1955011095, 1, 0.5]; sunlit = [T,F,T,T]. "
        "pct_sunlit = 75, mean_sun_frac = 100*(0.8044988905+0.1955011095+1+0.5)/4 = 62.5, longest_dark = 1 h. "
        "Earth az = [359.75, 359.75, 0.1, 0.1], el = [3.95, 3.95, -0.3, -0.3] -> clear = [0.95, 0.95, -1.9, -1.9] "
        "-> in view [T,T,F,F]: pct_earth = 50, longest_no_earth = 2 h; both = [T,F,F,F] -> 25. "
        "Sunset k0->k1: f = 0.1333/0.2666 = 0.5 -> 00:30:00Z (time_to 0.5 h). Sunrise k1->k2: f = 0.1333/0.6665 = 0.2 -> 01:12:00Z. "
        "Earthset k1->k2: f = 0.95/2.85 = 1/3 -> 01:20:00Z (time_to 4/3 h). No earthrise -> beyond_data. "
        "A wrong wrap (e.g. treating H(359.75) as 4 or as 0) flips k0 for both bodies."),
    "horizon": horizon(const_mask(0.0, {719: 4.0, 0: 2.0})),
    "ephem": ephem([359.75, 359.9, 0.25, 359.5], [3.1333, 2.2667, 1.5332, 4.0],
                   [359.75, 359.75, 0.1, 0.1], [3.95, 3.95, -0.3, -0.3]),
    "input": inp(t1_hours=4),
    "expected": expected(
        sun_el_deg=3.1333, sun_clearance_deg=0.1333, pct_sunlit=75.0,
        mean_sun_frac=100.0 * (F_PLUS_HALF + F_MINUS_HALF + 1.0 + 0.5) / 4.0, longest_dark_h=1.0,
        pct_earth=50.0, longest_no_earth_h=2.0, pct_both=25.0,
        next_sunset_utc="2027-01-01T00:30:00Z", next_sunrise_utc="2027-01-01T01:12:00Z",
        next_earthset_utc="2027-01-01T01:20:00Z", next_earthrise_utc=None,
        time_to_sunset_h=0.5, time_to_earthset_h=4.0 / 3.0,
        gaps={"earthrise": "beyond_data"}),
})

# ---------------------------------------------------------------- 6
cases.append({
    "id": "earth_below_horizon_all_time",
    "covers": ["Earth below horizon for the whole window", "pct_earth = 0, pct_both = 0"],
    "description": "Earth rises from -5 to -2.25 deg but never reaches a flat 0 deg horizon; Sun high.",
    "derivation": (
        "H = 0. clear_earth = -5 + 0.25k (k = 0..11) -> max -2.25 <= -0.95 -> frac 0, never in view. "
        "pct_earth = 0, longest_no_earth = 12 samples * 1 h = 12, pct_both = 0. Sun at 10 deg -> 100 %, "
        "mean_sun_frac 100, longest_dark 0. No sign change for either body -> all four transitions null (beyond_data). "
        "sun_el_deg = 10, sun_clearance_deg = 10."),
    "horizon": horizon(const_mask(0.0)),
    "ephem": ephem(120, [10.0] * 12, 180, [-5.0 + 0.25 * k for k in range(12)]),
    "input": inp(t1_hours=12),
    "expected": expected(
        sun_el_deg=10.0, sun_clearance_deg=10.0, pct_sunlit=100.0, mean_sun_frac=100.0, longest_dark_h=0.0,
        pct_earth=0.0, longest_no_earth_h=12.0, pct_both=0.0,
        next_sunset_utc=None, next_sunrise_utc=None, next_earthset_utc=None, next_earthrise_utc=None,
        time_to_sunset_h=None, time_to_earthset_h=None, gaps=dict(ALL_GAPS)),
})

# ---------------------------------------------------------------- 7
PATTERN7 = "TFFTFFFFTTFFFTTTTFTFFFFF"   # 24 samples, 30 min step
cases.append({
    "id": "longest_dark_run",
    "covers": ["longest dark run (incl. a run touching the interval end)", "step_minutes = 30",
               "t_ref inside the window: earlier transitions ignored"],
    "description": "Sun alternates between +1 and -1 deg (flat 0 horizon) in pattern " + PATTERN7 + ", 30 min step, t_ref = sample 4.",
    "derivation": (
        "H = 0, el = +1 (T) / -1 (F), |x| > 1 -> frac 1/0. Pattern TFFTFFFFTTFFFTTTTFTFFFFF: dark runs 2, 4, 3, 1, 5 "
        "(the last touches the end). longest = 5 * 0.5 h = 2.5 h. Lit samples = 9 of 24 -> pct_sunlit = mean_sun_frac = 37.5. "
        "t_ref = k4 = 02:00Z (dark): sun_el = -1, clearance = -1. T->F transitions: k0->k1 at 00:15, k3->k4 at 01:45 "
        "(both < t_ref, ignored), k9->k10 at 04:30 + 0.5*30 min = 04:45:00Z -> time_to_sunset = 2.75 h. "
        "First F->T >= t_ref: k7->k8 = 03:30 + 15 min = 03:45:00Z. Earth at 45 deg: 100 %, pct_both = 37.5."),
    "horizon": horizon(const_mask(0.0)),
    "ephem": ephem(200, [1.0 if c == "T" else -1.0 for c in PATTERN7], 0, 45.0, step_minutes=30),
    "input": inp(t1_hours=12, t_ref_hours=2),
    "expected": expected(
        sun_el_deg=-1.0, sun_clearance_deg=-1.0, pct_sunlit=37.5, mean_sun_frac=37.5, longest_dark_h=2.5,
        pct_earth=100.0, longest_no_earth_h=0.0, pct_both=37.5,
        next_sunset_utc="2027-01-01T04:45:00Z", next_sunrise_utc="2027-01-01T03:45:00Z",
        next_earthset_utc=None, next_earthrise_utc=None,
        time_to_sunset_h=2.75, time_to_earthset_h=None,
        gaps={"earthset": "beyond_data", "earthrise": "beyond_data"}),
})

# ---------------------------------------------------------------- 8
cases.append({
    "id": "pct_both",
    "covers": ["pct_both counts joint samples (not the product of pct_sunlit and pct_earth)", "earthset and earthrise"],
    "description": "Sun lit TTTTFFFF, Earth in view TFFTTTTF over a flat 0 deg horizon.",
    "derivation": (
        "H = 0. Sun el ±1 (r = 0.2666) -> sunlit TTTTFFFF: pct_sunlit = 50, mean_sun_frac = 50, longest_dark = 4 h. "
        "Earth el ±2 (r = 0.95, |x| > 1) -> TFFTTTTF: pct_earth = 5/8 = 62.5, longest_no_earth = 2 h (k1,k2). "
        "both = k0 and k3 only -> 2/8 = 25 (the product 50*62.5/100 = 31.25 would be wrong). "
        "Sunset k3->k4: f = 0.5 -> 03:30:00Z (3.5 h); no sunrise -> beyond_data. "
        "Earthset k0->k1: f = 2/4 = 0.5 -> 00:30:00Z (0.5 h); earthrise k2->k3 -> 02:30:00Z."),
    "horizon": horizon(const_mask(0.0)),
    "ephem": ephem(90, [1, 1, 1, 1, -1, -1, -1, -1], 300, [2, -2, -2, 2, 2, 2, 2, -2]),
    "input": inp(t1_hours=8),
    "expected": expected(
        sun_el_deg=1.0, sun_clearance_deg=1.0, pct_sunlit=50.0, mean_sun_frac=50.0, longest_dark_h=4.0,
        pct_earth=62.5, longest_no_earth_h=2.0, pct_both=25.0,
        next_sunset_utc="2027-01-01T03:30:00Z", next_sunrise_utc=None,
        next_earthset_utc="2027-01-01T00:30:00Z", next_earthrise_utc="2027-01-01T02:30:00Z",
        time_to_sunset_h=3.5, time_to_earthset_h=0.5,
        gaps={"sunrise": "beyond_data"}),
})

# ---------------------------------------------------------------- 9 + 10
OBS_HORIZON = horizon(const_mask(1.0), const_mask(0.6))
OBS_EPHEM = ephem(180, [1.6, 1.1333, 1.0, 0.7333, 0.6, 0.3], 10, 30.0)
cases.append({
    "id": "observer_height_2m",
    "covers": ["observer height switch (mask '2')", "sunset exactly on a sample (clear = 0)"],
    "description": "Same ephemeris as observer_height_10m; mask '2' is a flat 1.0 deg horizon, mask '10' is 0.6 deg.",
    "derivation": (
        "observer_height_m = 2 -> mask '2', H = 1.0. el = [1.6, 1.1333, 1.0, 0.7333, 0.6, 0.3] -> clear = "
        "[0.6, 0.1333, 0, -0.2667, -0.4, -0.7] -> x = [1 (clamped), 0.5, 0, -1 (clamped), -1, -1] -> "
        "frac = [1, 0.8044988905, 0.5, 0, 0, 0]. sunlit = [T,T,T,F,F,F]: pct_sunlit = 50, longest_dark = 3 h, "
        "mean_sun_frac = 100*(1 + 0.8044988905 + 0.5)/6 = 38.4083148. Sunset k2 (clear 0, still sunlit) -> k3: "
        "f = 0/(0+0.2667) = 0 -> exactly 02:00:00Z, time_to_sunset = 2 h. No sunrise. Earth 30 deg: 100 %."),
    "horizon": OBS_HORIZON,
    "ephem": OBS_EPHEM,
    "input": inp(t1_hours=6, h=2),
    "expected": expected(
        sun_el_deg=1.6, sun_clearance_deg=0.6, pct_sunlit=50.0,
        mean_sun_frac=100.0 * (1.0 + F_PLUS_HALF + 0.5) / 6.0, longest_dark_h=3.0,
        pct_earth=100.0, longest_no_earth_h=0.0, pct_both=50.0,
        next_sunset_utc="2027-01-01T02:00:00Z", next_sunrise_utc=None,
        next_earthset_utc=None, next_earthrise_utc=None,
        time_to_sunset_h=2.0, time_to_earthset_h=None,
        gaps={"sunrise": "beyond_data", "earthset": "beyond_data", "earthrise": "beyond_data"}),
})
cases.append({
    "id": "observer_height_10m",
    "covers": ["observer height switch (mask '10')"],
    "description": "Same ephemeris as observer_height_2m; the 10 m mast sees a lower (0.6 deg) horizon.",
    "derivation": (
        "observer_height_m = 10 -> mask '10', H = 0.6. clear = [1.0, 0.5333, 0.4, 0.1333, 0, -0.3] -> "
        "x = [1, 1, 1, 0.5, 0, -1 (clamped -1.125)] -> frac = [1, 1, 1, 0.8044988905, 0.5, 0]. sunlit = [T,T,T,T,T,F]: "
        "pct_sunlit = 5/6*100 = 83.333..., longest_dark = 1 h, mean_sun_frac = 100*(3 + 0.8044988905 + 0.5)/6 = 71.7416484. "
        "Sunset k4 (clear 0) -> k5: f = 0 -> 04:00:00Z, time_to_sunset = 4 h. sun_clearance_deg = 1.6 - 0.6 = 1.0."),
    "horizon": OBS_HORIZON,
    "ephem": OBS_EPHEM,
    "input": inp(t1_hours=6, h=10),
    "expected": expected(
        sun_el_deg=1.6, sun_clearance_deg=1.0, pct_sunlit=500.0 / 6.0,
        mean_sun_frac=100.0 * (3.0 + F_PLUS_HALF + 0.5) / 6.0, longest_dark_h=1.0,
        pct_earth=100.0, longest_no_earth_h=0.0, pct_both=500.0 / 6.0,
        next_sunset_utc="2027-01-01T04:00:00Z", next_sunrise_utc=None,
        next_earthset_utc=None, next_earthrise_utc=None,
        time_to_sunset_h=4.0, time_to_earthset_h=None,
        gaps={"sunrise": "beyond_data", "earthset": "beyond_data", "earthrise": "beyond_data"}),
})

# ---------------------------------------------------------------- 11
cases.append({
    "id": "interval_subset_of_coverage",
    "covers": ["[t0, t1) excludes t1 and samples outside it",
               "transitions are searched up to the end of data coverage, not only up to t1"],
    "description": "10 h of data, metrics over [02:00, 06:00) only; the next sunset falls after t1 but inside the data.",
    "derivation": (
        "H = 0, Sun el ±1 -> sunlit over coverage = TTFFTTTTFF. Interval [02:00, 06:00) = samples k2..k5 = F,F,T,T "
        "(k6 at 06:00 is excluded): pct_sunlit = mean_sun_frac = 50, longest_dark = 2 h. t_ref = 02:00 (k2): "
        "sun_el = clearance = -1. Sunrise k3->k4 -> 03:30:00Z. Sunset k1->k2 (01:30) is before t_ref; next is k7->k8 -> "
        "07:30:00Z, after t1 but inside coverage, so it is reported: time_to_sunset = 5.5 h ('beyond_data' means beyond "
        "the ephemeris coverage, contract §3). Earth 10 deg: 100 %, pct_both = 50."),
    "horizon": horizon(const_mask(0.0)),
    "ephem": ephem(135, [1, 1, -1, -1, 1, 1, 1, 1, -1, -1], 225, 10.0),
    "input": inp(t0_hours=2, t1_hours=6, t_ref_hours=2),
    "expected": expected(
        sun_el_deg=-1.0, sun_clearance_deg=-1.0, pct_sunlit=50.0, mean_sun_frac=50.0, longest_dark_h=2.0,
        pct_earth=100.0, longest_no_earth_h=0.0, pct_both=50.0,
        next_sunset_utc="2027-01-01T07:30:00Z", next_sunrise_utc="2027-01-01T03:30:00Z",
        next_earthset_utc=None, next_earthrise_utc=None,
        time_to_sunset_h=5.5, time_to_earthset_h=None,
        gaps={"earthset": "beyond_data", "earthrise": "beyond_data"}),
})

SCHEMA = {
    "purpose": "Hand-derived test cases for contract §3 metrics. pipeline/metrics.py (pytest) and "
               "web/src/lib/metrics.ts (vitest) must both reproduce every 'expected' block.",
    "case.horizon": "Same fields as horizon/<id>.json (§2.2) minus meta/site_id/dem: az_step_deg, n, "
                    "observer_heights_m, masks{'2': number[n], '10': number[n]}. masks[h][i] is the horizon at az = i*az_step_deg.",
    "case.ephem": "Same fields as ephem/<id>.json (§2.3) minus meta/site_id/horizons_query: start_utc, step_minutes, count, "
                  "sun{az[],el[]}, earth{az[],el[]}, sun_ang_radius_deg, earth_ang_radius_deg. Data coverage = samples 0..count-1.",
    "case.input": "observer_height_m (selects masks[String(h)]); t0_utc, t1_utc: the half-open metric interval [t0, t1) "
                  "(samples with t0 <= t_k < t1); t_ref_utc: reference time for sun_el_deg, sun_clearance_deg, next_* and "
                  "time_to_*. In these fixtures t_ref is always exactly on a sample.",
    "case.expected": "Every metric of contract §3 by its contract name. Percentages are 0..100, durations in hours, "
                     "angles in degrees. next_*_utc are ISO 8601 UTC strings 'YYYY-MM-DDTHH:MM:SSZ' rounded to the nearest "
                     "second (all fixture events fall on whole seconds), or null. time_to_*_h are numbers or null.",
    "case.expected.gaps": "Object holding the reason for each null transition: keys 'sunset' | 'sunrise' | 'earthset' | "
                          "'earthrise', value 'beyond_data'. A key is present if and only if the matching next_*_utc is null. "
                          "time_to_sunset_h is null exactly when gaps.sunset is present (same for earthset).",
    "comparison": "Numbers: abs(actual - expected) <= tolerance_abs. Strings and null: exact equality. gaps: deep equality.",
    "rules_pinned_by_these_cases": [
        "sunlit / earth_in_view are true when frac >= 0.5, i.e. clear >= 0 (frac = 0.5 counts as visible).",
        "Transition time = linear interpolation of clear between the bracketing samples, solved for clear = 0; "
        "if the earlier sample has clear exactly 0 the event is at that sample time.",
        "next_* is the first event with time >= t_ref, searched to the end of the ephemeris coverage (may be after t1).",
        "Longest runs count samples inside [t0, t1) only, times step_minutes/60; a run touching t1 still counts.",
        "Horizon lookup: linear interpolation in azimuth with wrap-around (index n-1 -> index 0).",
    ],
    "derivations": "Each case has a 'derivation' written by hand. Expected values were never produced by running an "
                   "implementation. Builder: validation/fixtures/build_metrics_cases.py (assembles JSON only).",
}


def dumps_readable(obj, indent=0) -> str:
    """Pretty JSON with every list of scalars on one line (keeps 720-sample masks compact)."""
    pad, pad1 = "  " * indent, "  " * (indent + 1)
    if isinstance(obj, dict):
        if not obj:
            return "{}"
        items = [f"{pad1}{json.dumps(k)}: {dumps_readable(v, indent + 1)}" for k, v in obj.items()]
        return "{\n" + ",\n".join(items) + "\n" + pad + "}"
    if isinstance(obj, list):
        if all(not isinstance(v, (dict, list)) for v in obj):
            return json.dumps(obj, separators=(",", ":"))
        items = [f"{pad1}{dumps_readable(v, indent + 1)}" for v in obj]
        return "[\n" + ",\n".join(items) + "\n" + pad + "]"
    return json.dumps(obj, allow_nan=False)


def main() -> None:
    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids)) and len(cases) >= 8
    doc = {
        "meta": {
            "contract_version": CONTRACT_VERSION,
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "generator": "validation/fixtures/build_metrics_cases.py",
            "synthetic": True,
            "approximate": False,
            "inputs": [{"name": "hand-made test cases", "url": "", "notes": "contract §3/§4; no external data"}],
        },
        "fixtures_version": FIXTURES_VERSION,
        "schema": SCHEMA,
        "tolerance_abs": 1e-6,
        "cases": [{k: c[k] for k in ("id", "description", "covers", "derivation", "horizon", "ephem", "input", "expected")}
                  for c in cases],
    }
    OUT.write_text(dumps_readable(doc) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(cases)} cases, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
