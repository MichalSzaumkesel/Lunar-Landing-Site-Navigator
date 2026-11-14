"""Contract §3 metrics, the Python twin of web/src/lib/metrics.ts.

Both implementations must pass validation/fixtures/metrics_cases.json.

Inputs are plain dicts shaped like the contract files:
  horizon: {az_step_deg, n, masks{"2": [...], "10": [...]}, ...}   (§2.2)
  ephem:   {start_utc, step_minutes, count, sun{az,el}, earth{az,el},
            sun_ang_radius_deg, earth_ang_radius_deg, ...}          (§2.3)

Choices where the contract is silent (see docs/status-A.md):
  * t_ref between samples: az/el are linearly interpolated (az across the 0/360 wrap).
  * t_ref outside the data coverage: sun_el_deg / sun_clearance_deg are None and no
    transitions are searched (all next_* null with reason "beyond_data").
  * Transition times are rounded to the nearest whole second; time_to_*_h is computed
    from the rounded time.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Sequence

BODIES = ("sun", "earth")
EVENTS = ("sunset", "sunrise", "earthset", "earthrise")
BEYOND_DATA = "beyond_data"


# ---------------------------------------------------------------- time helpers

def parse_utc(s: str) -> float:
    """'YYYY-MM-DDTHH:MM:SS[.fff]Z' -> POSIX seconds. Requires the trailing Z (contract §1)."""
    if not isinstance(s, str) or not s.endswith("Z"):
        raise ValueError(f"time must be ISO 8601 UTC with 'Z': {s!r}")
    return datetime.fromisoformat(s[:-1] + "+00:00").timestamp()


def format_utc(seconds: float) -> str:
    """POSIX seconds -> 'YYYY-MM-DDTHH:MM:SSZ', rounded half-up to the nearest second."""
    whole = math.floor(seconds + 0.5)
    return datetime.fromtimestamp(whole, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- geometry

def normalize_az(az_deg: float) -> float:
    az = az_deg % 360.0
    return 0.0 if az >= 360.0 else az


def horizon_at(mask: Sequence[float], az_step_deg: float, az_deg: float) -> float:
    """Horizon elevation at az: linear interpolation between samples, wrap at 360 (§2.2)."""
    n = len(mask)
    if n == 0:
        return 0.0
    f = normalize_az(az_deg) / az_step_deg
    i0 = int(math.floor(f))
    frac = f - i0
    i0 %= n
    i1 = (i0 + 1) % n
    return mask[i0] + frac * (mask[i1] - mask[i0])


def disc_fraction(clear_deg: float, radius_deg: float) -> float:
    """Visible fraction of a disc whose centre is clear_deg above a locally straight horizon (§3)."""
    if radius_deg <= 0:
        return 1.0 if clear_deg >= 0 else 0.0
    x = max(-1.0, min(1.0, clear_deg / radius_deg))
    frac = 0.5 + (x * math.sqrt(1.0 - x * x) + math.asin(x)) / math.pi
    return max(0.0, min(1.0, frac))


def is_visible(clear_deg: float) -> bool:
    """sunlit / earth_in_view := frac >= 0.5, which is exactly clear >= 0 (frac is monotonic, frac(0) = 0.5)."""
    return clear_deg >= 0.0


def select_mask(horizon: dict, observer_height_m: int | float) -> Sequence[float]:
    key = str(int(observer_height_m)) if float(observer_height_m).is_integer() else str(observer_height_m)
    try:
        return horizon["masks"][key]
    except KeyError:
        raise KeyError(f"horizon has no mask for observer height {key!r} m "
                       f"(available: {sorted(horizon['masks'])})") from None


def clearances(ephem: dict, mask: Sequence[float], az_step_deg: float, body: str) -> list[float]:
    """clear_B(t_k) = el_B(t_k) - H(az_B(t_k)) for every sample of the ephemeris."""
    az, el = ephem[body]["az"], ephem[body]["el"]
    return [el[k] - horizon_at(mask, az_step_deg, az[k]) for k in range(ephem["count"])]


def _interp_az(a0: float, a1: float, f: float) -> float:
    d = (normalize_az(a1) - normalize_az(a0) + 540.0) % 360.0 - 180.0
    return normalize_az(a0 + f * d)


def _longest_run(flags: Sequence[bool], value: bool) -> int:
    best = cur = 0
    for v in flags:
        cur = cur + 1 if v == value else 0
        best = max(best, cur)
    return best


def _next_transition(clear: Sequence[float], start_s: float, step_s: float, t_ref_s: float,
                     rising: bool) -> float | None:
    """First time >= t_ref where visibility flips (False->True if rising, else True->False).

    Searched to the end of the data coverage. Time from linear interpolation of clear = 0."""
    n = len(clear)
    k_first = max(0, int(math.floor((t_ref_s - start_s) / step_s)) - 1)
    for k in range(k_first, n - 1):
        a, b = clear[k], clear[k + 1]
        if is_visible(a) == is_visible(b) or is_visible(b) != rising:
            continue
        t = start_s + (k + a / (a - b)) * step_s
        if t >= t_ref_s:
            return t
    return None


# ---------------------------------------------------------------- main entry

def compute_metrics(horizon: dict, ephem: dict, observer_height_m: int, t0_utc: str, t1_utc: str,
                    t_ref_utc: str | None = None) -> dict:
    """All §3 metrics over the samples t0 <= t_k < t1, with events relative to t_ref (default t0).

    Returns a dict keyed by the contract metric names plus 'gaps' ({event: 'beyond_data'}
    for every next_* that is null)."""
    count = int(ephem["count"])
    start_s = parse_utc(ephem["start_utc"])
    step_s = float(ephem["step_minutes"]) * 60.0
    t0_s, t1_s = parse_utc(t0_utc), parse_utc(t1_utc)
    t_ref_s = parse_utc(t_ref_utc) if t_ref_utc is not None else t0_s
    end_s = start_s + (count - 1) * step_s

    mask = select_mask(horizon, observer_height_m)
    az_step = float(horizon["az_step_deg"])
    radius = {"sun": float(ephem["sun_ang_radius_deg"]), "earth": float(ephem["earth_ang_radius_deg"])}
    clear = {b: clearances(ephem, mask, az_step, b) for b in BODIES}

    # samples inside [t0, t1)
    idx = [k for k in range(count) if t0_s <= start_s + k * step_s < t1_s]
    if not idx:
        raise ValueError("no ephemeris samples inside [t0, t1)")
    n = len(idx)
    step_h = step_s / 3600.0
    vis = {b: [is_visible(clear[b][k]) for k in idx] for b in BODIES}
    both = [s and e for s, e in zip(vis["sun"], vis["earth"])]

    out: dict = {}

    # reference-time values
    if start_s <= t_ref_s <= end_s:
        f = (t_ref_s - start_s) / step_s
        k0 = min(int(math.floor(f)), count - 1)
        k1 = min(k0 + 1, count - 1)
        w = f - k0 if k1 != k0 else 0.0
        sun = ephem["sun"]
        el = sun["el"][k0] + w * (sun["el"][k1] - sun["el"][k0])
        az = _interp_az(sun["az"][k0], sun["az"][k1], w)
        out["sun_el_deg"] = el
        out["sun_clearance_deg"] = el - horizon_at(mask, az_step, az)
    else:
        out["sun_el_deg"] = None
        out["sun_clearance_deg"] = None

    out["pct_sunlit"] = 100.0 * sum(vis["sun"]) / n
    out["mean_sun_frac"] = 100.0 * sum(disc_fraction(clear["sun"][k], radius["sun"]) for k in idx) / n
    out["longest_dark_h"] = _longest_run(vis["sun"], False) * step_h
    out["pct_earth"] = 100.0 * sum(vis["earth"]) / n
    out["longest_no_earth_h"] = _longest_run(vis["earth"], False) * step_h
    out["pct_both"] = 100.0 * sum(both) / n

    in_coverage = start_s <= t_ref_s <= end_s
    events = {"sunset": ("sun", False), "sunrise": ("sun", True),
              "earthset": ("earth", False), "earthrise": ("earth", True)}
    gaps: dict[str, str] = {}
    times: dict[str, float | None] = {}
    for ev, (body, rising) in events.items():
        t = _next_transition(clear[body], start_s, step_s, t_ref_s, rising) if in_coverage else None
        if t is None:
            gaps[ev] = BEYOND_DATA
            out[f"next_{ev}_utc"] = None
            times[ev] = None
        else:
            iso = format_utc(t)
            out[f"next_{ev}_utc"] = iso
            times[ev] = parse_utc(iso)

    for ev in ("sunset", "earthset"):
        out[f"time_to_{ev}_h"] = None if times[ev] is None else max(0.0, (times[ev] - t_ref_s) / 3600.0)
    out["gaps"] = gaps
    return out
