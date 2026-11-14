"""Compare a local illumination heatmap (illum/<site_id>.json, contract 2.6) with the PGDA LOLA average-illumination raster.

PASS RULE (fixed before looking at any result, not to be tuned afterwards):
    pass  <=>  Pearson r >= 0.5  AND  median |ours - PGDA| <= 10 percentage points, over all grid cells (441 for 21 x 21)
               that have a valid PGDA value.
Also reported: mean difference (bias, ours - PGDA), max |diff|, r, n cells.

Geometry: row 0 = north, col 0 = west, centre cell = (ny//2, nx//2) = the site; east offset = (col - cx) * spacing,
north offset = (cy - row) * spacing. Each cell is moved from the site by a great-circle destination on the sphere R = 1737.4 km.
The grid's center_lat/center_lon in the file are rounded to 3 decimals, so the full-precision site coordinates are taken from
pipeline/sites_input.json. PGDA is sampled bilinearly (AVGVISIB_75S_120M_201608.TIF, DN * 4e-5 = fraction, x100 = %).

Known differences, so a bias is expected: our value is the share of hours with the Sun's CENTRE above the horizon (2 yr,
2026-12..2028-12, 200 m cells, horizon from the 20 m DEM at 2 m observer height); PGDA counts the Sun as visible if any part
is visible (~18.6 yr average, 120 m px, observer height not stated). Ours should therefore be slightly lower.

Usage: check_illum_heatmap.py ILLUM_JSON [--sites-input pipeline/sites_input.json] [--pgda-dir DIR] [--out-dir validation/results]
Exit 0 pass, 1 fail.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer

REPO = Path(__file__).resolve().parent.parent
RAW = Path(os.environ.get("LLSN_RAW_DIR") or REPO / "data" / "raw")
R_M = 1737400.0
MOON_LONLAT = "+proj=longlat +R=1737400 +no_defs"
MOON_STERE = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
R_MIN, MEDIAN_MAX_PP = 0.5, 10.0
SUN_FILE = "AVGVISIB_75S_120M_201608.TIF"


def destination(lat_deg: float, lon_deg: float, east_m: np.ndarray, north_m: np.ndarray):
    az = np.arctan2(east_m, north_m)
    d = np.hypot(east_m, north_m) / R_M
    lat1, lon1 = math.radians(lat_deg), math.radians(lon_deg)
    lat2 = np.arcsin(np.sin(lat1) * np.cos(d) + np.cos(lat1) * np.sin(d) * np.cos(az))
    lon2 = lon1 + np.arctan2(np.sin(az) * np.sin(d) * np.cos(lat1), np.cos(d) - np.sin(lat1) * np.sin(lat2))
    return np.degrees(lat2), (np.degrees(lon2) + 180.0) % 360.0 - 180.0


def sample_bilinear(ds, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    t = ds.transform
    colf = (x - t.c) / t.a - 0.5
    rowf = (y - t.f) / t.e - 0.5
    r0, c0 = np.floor(rowf).astype(int), np.floor(colf).astype(int)
    rmin, cmin = r0.min(), c0.min()
    h, w = r0.max() - rmin + 2, c0.max() - cmin + 2
    arr = ds.read(1, window=rasterio.windows.Window(cmin, rmin, w, h)).astype("float64")
    arr = np.where(arr == ds.nodata, np.nan, arr * ds.scales[0] * 100.0)
    fr, fc = rowf - r0, colf - c0
    a = lambda dr, dc: arr[r0 - rmin + dr, c0 - cmin + dc]
    return (a(0, 0) * (1 - fc) + a(0, 1) * fc) * (1 - fr) + (a(1, 0) * (1 - fc) + a(1, 1) * fc) * fr


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("illum")
    ap.add_argument("--sites-input", type=Path, default=REPO / "pipeline" / "sites_input.json")
    ap.add_argument("--pgda-dir", type=Path, default=RAW / "pgda")
    ap.add_argument("--out-dir", type=Path, default=REPO / "validation" / "results")
    a = ap.parse_args()
    doc = json.loads(Path(a.illum).read_text())
    sid = doc["site_id"]
    site = next(s for s in json.loads(a.sites_input.read_text())["sites"] if s["id"] == sid)
    lat0, lon0 = site["lat_deg"], site["lon_deg"]
    g = doc["grid"]
    nx, ny, sp = g["nx"], g["ny"], g["spacing_m"]
    cx, cy = nx // 2, ny // 2
    ours = np.array(doc["pct_sunlit"], dtype="float64")
    assert ours.shape == (ny, nx)
    cols, rows = np.meshgrid(np.arange(nx), np.arange(ny))
    lat, lon = destination(lat0, lon0, (cols - cx) * sp, (cy - rows) * sp)
    with rasterio.open(a.pgda_dir / SUN_FILE) as ds:
        tr = Transformer.from_crs(MOON_LONLAT, ds.crs if ds.crs else MOON_STERE, always_xy=True)
        x, y = tr.transform(lon.ravel(), lat.ravel())
        pg = sample_bilinear(ds, np.asarray(x), np.asarray(y)).reshape(ours.shape)
    ok = np.isfinite(pg)
    o, p = ours[ok], pg[ok]
    r = float(np.corrcoef(o, p)[0, 1])
    d = o - p
    med, bias, mx = float(np.median(np.abs(d))), float(d.mean()), float(np.abs(d).max())
    passed = bool(r >= R_MIN and med <= MEDIAN_MAX_PP)
    notes = (f"{int(ok.sum())} cells ({nx}x{ny}, {sp:g} m): Pearson r {r:.3f}, median |ours-PGDA| {med:.1f} pp, mean diff (bias, ours-PGDA) {bias:+.1f} pp, "
             f"max |diff| {mx:.1f} pp. Ours range {o.min():.1f}-{o.max():.1f} %, PGDA {p.min():.1f}-{p.max():.1f} %. "
             f"Rule fixed in advance: r >= {R_MIN} and median |diff| <= {MEDIAN_MAX_PP:g} pp. "
             f"Not like-for-like: ours = Sun centre above horizon, 2 yr (2026-12..2028-12), 200 m cells, horizon from the 20 m DEM at 2 m; "
             f"PGDA = any part of the disc, ~18.6 yr average, 120 m px, observer height not stated, so a lower bias for ours is expected. "
             f"Site coordinates (full precision) from pipeline/sites_input.json.")
    check = {"id": f"illum_heatmap_ref_{sid}", "kind": "illumination_heatmap_reference", "site_id": sid, "n_samples": int(ok.sum()),
             "pearson_r": round(r, 3), "median_abs_diff_pp": round(med, 2), "mean_diff_pp": round(bias, 2), "max_abs_diff_pp": round(mx, 2),
             "pass": passed, "notes": notes}
    a.out_dir.mkdir(parents=True, exist_ok=True)
    (a.out_dir / f"{check['id']}.json").write_text(json.dumps(check, indent=2) + "\n")
    print(json.dumps(check, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
