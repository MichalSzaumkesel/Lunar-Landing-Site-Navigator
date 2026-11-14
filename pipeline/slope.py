"""Local slope at each site (sites.json `slope_deg`).

Same DEM as the site's horizon (fetch_dem.ensure_dem with run_site.py's arguments, cache only). Horn's 3x3 method:
the 9 heights are sampled (bilinear) at ground offsets east/north in {-1, 0, +1} x the DEM resolution around the site,
so the window is 3 x 3 DEM pixels in the local ENU frame for both cylindrical and polar products.
Writes slope_deg into pipeline/site_heights.json; build_sites.py copies it into sites.json.
Also prints the slope at a 2x window as a robustness check.

Run: LLSN_RAW_DIR=... .venv/bin/python pipeline/slope.py [site_id ...]
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import fetch_dem  # noqa: E402
import horizon  # noqa: E402
import terrain  # noqa: E402

HERE = Path(__file__).resolve().parent
DEMO = set(common.DEMO_SITE_IDS)


def horn_slope(dem, lat: float, lon: float, step_m: float) -> float:
    """Slope (deg) by Horn's 3x3 kernel with spacing step_m in the local east/north frame."""
    e = np.array([-1, 0, 1, -1, 0, 1, -1, 0, 1], float)        # row-major, top row = north
    n = np.array([1, 1, 1, 0, 0, 0, -1, -1, -1], float)
    d = np.hypot(e, n) * step_m
    az = np.degrees(np.arctan2(e, n)) % 360.0
    la, lo = horizon.destination(lat, lon, az, d)
    la[4], lo[4] = lat, lon
    z = np.asarray(dem.sample(la, lo), float).reshape(3, 3)
    a, b, c, dd, _, f, g, h, i = z.ravel()
    dzdx = ((c + 2 * f + i) - (a + 2 * dd + g)) / (8 * step_m)    # east
    dzdy = ((a + 2 * b + c) - (g + 2 * h + i)) / (8 * step_m)    # north
    return math.degrees(math.atan(math.hypot(dzdx, dzdy)))


def main(ids: list[str]) -> None:
    rows = {r["id"]: r for r in json.loads((HERE / "sites_input.json").read_text())["sites"]}
    hp = HERE / "site_heights.json"
    heights = json.loads(hp.read_text())
    for sid in ids or list(rows):
        s = rows[sid]
        lat, lon = s["lat_deg"], s["lon_deg"]
        npy = fetch_dem.ensure_dem(lat, lon, 150 if abs(lat) >= 80 else 100, demo=sid in DEMO)
        dem, side = terrain.load_dem(npy)
        res = float(side["resolution_m"])
        s1, s2 = horn_slope(dem, lat, lon, res), horn_slope(dem, lat, lon, 2 * res)
        if heights.get(sid, {}).get("dem") != side["product"]:
            raise SystemExit(f"{sid}: DEM {side['product']} differs from the horizon DEM {heights.get(sid)}")
        heights[sid]["slope_deg"] = round(s1, 1)
        heights[sid]["slope_window_m"] = round(3 * res, 1)
        print(f"{sid:20s} {side['product'][:16]:16s} res {res:6.1f} m  slope {s1:5.1f} deg  (2x window {s2:5.1f})")
    hp.write_text(json.dumps(heights, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:])
