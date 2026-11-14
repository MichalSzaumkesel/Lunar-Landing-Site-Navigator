"""A10 (stretch): local pct_sunlit heatmap -> illum/<id>.json (contract §2.6).

Grid nx x ny centred on the site, spacing in metres, pixel (row, col) at east = (col - nx//2) * spacing,
north = (ny//2 - row) * spacing from the site: ROW 0 = NORTH, COL 0 = WEST (same as terrain; §2.6 does not say).
For each grid point: own horizon mask (horizon.compute_masks, same DEM/range as the site, observer 2 m above its ground),
Sun direction from the site's ephemeris, pct_sunlit over the full ephemeris coverage with the §3 definition
(Sun centre above the terrain horizon, i.e. frac >= 0.5).

Sun direction transport (no small-offset hack): the centre site's Sun az/el is turned into a body-fixed unit vector
(Sun is effectively at infinity, so the direction is the same at every point), then expressed in each grid point's own
local east/north/up. This removes the meridian-convergence error near the pole (~0.7 deg of azimuth over 2 km at -85 deg).
The remaining error is the finite distance of the Sun and Moon-fixed frame effects: negligible (< 1e-4 deg).
"""

from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import horizon  # noqa: E402
import metrics  # noqa: E402

OBS_H = 2


def enu_basis(lat_deg: float, lon_deg: float):
    p, l = math.radians(lat_deg), math.radians(lon_deg)
    up = np.array([math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p)])
    east = np.array([-math.sin(l), math.cos(l), 0.0])
    north = np.array([-math.sin(p) * math.cos(l), -math.sin(p) * math.sin(l), math.cos(p)])
    return east, north, up


def sun_vectors(az_deg: np.ndarray, el_deg: np.ndarray, lat: float, lon: float) -> np.ndarray:
    """(n,3) body-fixed unit vectors of the Sun seen from (lat, lon) with the given local az (from N, cw) / el."""
    e, n, u = enu_basis(lat, lon)
    az, el = np.radians(az_deg), np.radians(el_deg)
    return (np.cos(el) * np.sin(az))[:, None] * e + (np.cos(el) * np.cos(az))[:, None] * n + np.sin(el)[:, None] * u


def local_az_el(vec: np.ndarray, lat: float, lon: float):
    e, n, u = enu_basis(lat, lon)
    az = np.degrees(np.arctan2(vec @ e, vec @ n)) % 360.0
    el = np.degrees(np.arcsin(np.clip(vec @ u, -1, 1)))
    return az, el


def pct_sunlit_point(mask: np.ndarray, az: np.ndarray, el: np.ndarray, az_step: float = 0.5) -> float:
    """Share (%) of samples with the Sun centre above the horizon (interpolated, wrap at 360)."""
    n = len(mask)
    x = az / az_step
    i0 = np.floor(x).astype(int) % n
    f = x - np.floor(x)
    h = mask[i0] * (1 - f) + mask[(i0 + 1) % n] * f
    return float(np.mean(el - h >= 0.0) * 100.0)


def grid_offsets(nx: int, ny: int, spacing: float):
    cols = (np.arange(nx) - nx // 2) * spacing           # east
    rows = (ny // 2 - np.arange(ny)) * spacing           # north (row 0 = north)
    return rows, cols


def compute_grid(dem, lat: float, lon: float, ephem: dict, nx: int = 21, ny: int = 21, spacing: float = 200.0,
                 stride: int = 1, range_km: float = 150.0, progress: bool = False):
    sun_az, sun_el = np.array(ephem["sun"]["az"]), np.array(ephem["sun"]["el"])
    svec = sun_vectors(sun_az, sun_el, lat, lon)
    north_m, east_m = grid_offsets(nx, ny, spacing)
    out = np.full((ny, nx), np.nan)
    t0 = time.time()
    done = 0
    for r in range(0, ny, stride):
        for c in range(0, nx, stride):
            d = math.hypot(east_m[c], north_m[r])
            az0 = math.degrees(math.atan2(east_m[c], north_m[r])) if d > 0 else 0.0
            if d > 0:
                la, lo = horizon.destination(lat, lon, np.array([[az0]]), np.array([[d]]))
                la, lo = float(la[0, 0]), float(lo[0, 0])
            else:
                la, lo = lat, lon
            masks, _ = horizon.compute_masks(dem, la, lo, range_km, observer_heights=(OBS_H,))
            az, el = local_az_el(svec, la, lo)
            out[r, c] = pct_sunlit_point(masks[OBS_H], az, el)
            done += 1
            if progress and done % 20 == 0:
                print(f"  {done} pts, {time.time() - t0:.0f} s", flush=True)
    return out, time.time() - t0, done


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("site_id")
    ap.add_argument("--stride", type=int, default=1)
    ap.add_argument("--n", type=int, default=21)
    ap.add_argument("--spacing", type=float, default=200.0)
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    import fetch_dem
    import terrain
    rows = {r["id"]: r for r in json.loads((Path(__file__).resolve().parent / "sites_input.json").read_text())["sites"]}
    s = rows[a.site_id]
    lat, lon = s["lat_deg"], s["lon_deg"]
    ephem = json.loads((common.DATA_DIR / "ephem" / f"{a.site_id}.json").read_text())
    # demo/polar site: same DEM and 150 km range as the site's horizon file
    npy = fetch_dem.ensure_dem(lat, lon, 150, demo=a.site_id in common.DEMO_SITE_IDS)
    dem, side = terrain.load_dem(npy)
    grid, secs, npts = compute_grid(dem, lat, lon, ephem, a.n, a.n, a.spacing, a.stride, 150.0, progress=True)
    print(f"runtime {secs:.1f} s for {npts} points ({secs / npts:.2f} s/point)")
    if a.stride > 1:
        print("coarse stride run: NOT written")
        print("min/max (computed points)", np.nanmin(grid), np.nanmax(grid))
        return
    # consistency check of the centre point against metrics.py with the site's horizon file
    hz = json.loads((common.DATA_DIR / "horizon" / f"{a.site_id}.json").read_text())
    t1 = "2029-01-01T00:00:00Z"
    m = metrics.compute_metrics(hz, ephem, OBS_H, ephem["start_utc"], t1)
    cy = cx = a.n // 2
    print(f"centre pct_sunlit grid {grid[cy, cx]:.3f} vs metrics.py (site horizon file) {m['pct_sunlit']:.3f}")
    # size of the naive approximation (same az/el at every point) for the report
    svec = sun_vectors(np.array(ephem["sun"]["az"]), np.array(ephem["sun"]["el"]), lat, lon)
    la, lo = horizon.destination(lat, lon, np.array([[45.0]]), np.array([[200.0 * (a.n // 2) * math.sqrt(2)]]))
    az2, el2 = local_az_el(svec, float(la[0, 0]), float(lo[0, 0]))
    daz = np.abs((az2 - np.array(ephem["sun"]["az"]) + 180) % 360 - 180)
    print(f"corner point: max |d az| vs centre {daz.max():.3f} deg, max |d el| {np.abs(el2 - np.array(ephem['sun']['el'])).max():.4f} deg")
    half = (a.n // 2) * a.spacing
    doc = {
        "meta": common.make_meta("pipeline/illum.py", [
            {"name": f"{side['product']} horizon masks per grid point", "url": side["url"],
             "notes": f"Observer {OBS_H} m above each point's ground, 720 rays, 150 km range, same code as horizon/{a.site_id}.json"},
            {"name": f"Sun az/el from ephem/{a.site_id}.json (JPL Horizons)", "url": "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
             "notes": "Sun direction taken from the centre site and transported as a body-fixed vector to each point's local "
                      "east/north/up (Sun at infinity). Naive reuse of the centre az/el would err by up to "
                      f"{daz.max():.2f} deg in azimuth at the corners (meridian convergence near the pole)."}],
            approximate=True),
        "site_id": a.site_id,
        "period": {"start_utc": ephem["start_utc"], "end_utc": common.EPHEM_END_UTC},
        "grid": {"center_lat": lat, "center_lon": lon, "spacing_m": a.spacing, "nx": a.n, "ny": a.n},
        "pct_sunlit": [[float(v) for v in row] for row in grid],
        "notes": (f"APPROXIMATE. Orientation: pct_sunlit[row][col], row 0 = north edge, col 0 = west edge, centre pixel "
                  f"({a.n // 2},{a.n // 2}) = site; east = (col - {a.n // 2}) * spacing_m, north = ({a.n // 2} - row) * spacing_m. "
                  f"Approximations: Sun direction from the centre site's ephemeris (transported, see inputs); horizon from the "
                  f"same DEM and 150 km range as the site; 2-year window 2026-12-01..2028-12-31 hourly, pct_sunlit = share of "
                  f"samples with the Sun centre above the terrain horizon; {a.spacing:.0f} m spacing "
                  f"(+-{half / 1000:.1f} km square); no shadows from the lander itself."),
    }
    out = a.out or common.DATA_DIR / "illum" / f"{a.site_id}.json"
    common.write_json(out, doc)
    print(f"min {np.nanmin(grid):.2f} max {np.nanmax(grid):.2f} centre {grid[cy, cx]:.2f}; wrote {out}")


if __name__ == "__main__":
    main()
