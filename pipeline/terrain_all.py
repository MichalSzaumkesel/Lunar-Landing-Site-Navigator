"""Terrain heightmaps (contract §2.5) for every site in sites.json, plus sanity checks.

Same terrain.build_terrain (256 px x 80 m) and the same DEM window each site's horizon used
(fetch_dem.ensure_dem with run_site.py's arguments). Downloads are disabled: a site whose DEM is not cached is
skipped and reported, never fetched (the lead decides on downloads).

Checks per site (also run on the 3 demo sites as the orientation reference):
  height   |site_height_m - sites.json elevation_m| <= 1 m + tan(slope) * DEM resolution
  range    .bin not flat / not saturated: < 1 % of pixels at 0 or 65535, relief > 1 m
  north-up the .bin is re-sampled independently on a plain north/east offset grid (lat + n/R, lon + e/(R cos lat),
           no great-circle code) from the same DEM; Pearson r with the decoded .bin must be >= 0.98 and beat every
           flipped / rotated copy by >= 0.05 (sites with < 20 m relief are reported as 'flat, orientation untestable').

Usage: LLSN_RAW_DIR=... python pipeline/terrain_all.py [--dry-run] [--check-only] [site_id ...]
Writes validation/results/terrain_<batch>.json (batch = polar | global) unless --dry-run.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import fetch_dem  # noqa: E402
import terrain  # noqa: E402

HERE = Path(__file__).resolve().parent
R_M = common.MOON_RADIUS_KM * 1000.0
DEMO = set(common.DEMO_SITE_IDS)
RESULTS = common.REPO_ROOT / "validation" / "results"


class NoDownload(RuntimeError):
    pass


def _no_download(*_a, **_k):
    raise NoDownload("DEM window not cached (download disabled)")


fetch_dem.fetch_polar_south = _no_download
fetch_dem.fetch_cylindrical_window = _no_download
fetch_dem._range_get = _no_download


TERRAIN_RANGE_KM = 15.0   # 256 x 80 m grid: half-diagonal 14.5 km


def dem_for(site: dict, horizon_product: str | None):
    """The horizon's DEM window (run_site.py arguments). If no cached window covers the full horizon range
    (+3 km slack), fall back to a cached window of the same product that covers the terrain extent."""
    lat, lon = site["lat_deg"], site["lon_deg"]
    try:
        return fetch_dem.ensure_dem(lat, lon, 150 if abs(lat) >= 80 else 100, demo=site["id"] in DEMO), "horizon window"
    except NoDownload:
        npy = fetch_dem.ensure_dem(lat, lon, TERRAIN_RANGE_KM, demo=site["id"] in DEMO)
        prod = json.loads(npy.with_suffix(".json").read_text())["product"]
        if horizon_product and prod != horizon_product:
            raise NoDownload(f"only {prod} cached, horizon used {horizon_product}")
        return npy, "same product, covers terrain extent"


def plain_grid(dem, lat: float, lon: float, size: int, spacing: float) -> np.ndarray:
    idx = np.arange(size) - size // 2
    east = idx[None, :] * spacing
    north = (-idx)[:, None] * spacing
    la = lat + np.degrees(north / R_M) + 0.0 * east
    lo = lon + np.degrees(east / (R_M * np.cos(np.radians(lat)))) + 0.0 * north
    return np.asarray(dem.sample(la, lo), float)


def corr(a: np.ndarray, b: np.ndarray) -> float:
    a = a - a.mean()
    b = b - b.mean()
    d = math.sqrt(float((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / d) if d > 0 else float("nan")


def check_site(site: dict, heights: dict, dem) -> dict:
    sid = site["id"]
    meta = json.loads((common.DATA_DIR / "terrain" / f"{sid}.json").read_text())
    n = meta["size_px"]
    v = np.frombuffer((common.DATA_DIR / "terrain" / f"{sid}.bin").read_bytes(), dtype="<u2").reshape(n, n)
    h = terrain.decode(v, meta["height_min_m"], meta["height_max_m"])
    res = float(meta["dem"]["resolution_m"])
    slope = float(heights.get(sid, {}).get("slope_deg") or 0.0)
    elev = site.get("elevation_m")
    dh = abs(meta["site_height_m"] - elev) if elev is not None else float("nan")
    tol = 1.0 + math.tan(math.radians(slope)) * res
    ok_h = elev is not None and dh <= tol
    sat = float(np.mean((v == 0) | (v == 65535)))
    relief = meta["height_max_m"] - meta["height_min_m"]
    ok_range = sat < 0.01 and relief > 1.0
    ref = plain_grid(dem, site["lat_deg"], site["lon_deg"], n, meta["spacing_m"])
    r = corr(h, ref)
    alts = {"flip_ns": corr(h[::-1, :], ref), "flip_ew": corr(h[:, ::-1], ref), "rot90": corr(np.rot90(h), ref),
            "rot180": corr(np.rot90(h, 2), ref), "rot270": corr(np.rot90(h, 3), ref), "transpose": corr(h.T, ref)}
    best_alt = max(alts.values())
    testable = relief >= 20.0
    ok_dir = (r >= 0.98 and r - best_alt >= 0.05) if testable else r >= 0.98
    return {"site_id": sid, "dh_m": dh, "tol_m": tol, "ok_height": ok_h, "sat_frac": sat, "relief_m": relief,
            "ok_range": ok_range, "r_northup": r, "r_best_alt": best_alt, "orientation_testable": testable,
            "ok_orientation": ok_dir, "pass": bool(ok_h and ok_range and ok_dir)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--check-only", action="store_true")
    a = ap.parse_args()
    sites = json.loads((common.DATA_DIR / "sites.json").read_text())["sites"]
    heights = json.loads((HERE / "site_heights.json").read_text())
    todo = [s for s in sites if (not a.ids or s["id"] in a.ids)]
    results, skipped = {"polar": [], "global": []}, []
    for s in todo:
        sid = s["id"]
        try:
            npy, how = dem_for(s, heights.get(sid, {}).get("dem"))
        except NoDownload as e:
            skipped.append((sid, str(e)))
            print(f"SKIP  {sid}: {e}")
            continue
        side = json.loads(npy.with_suffix(".json").read_text())
        size_mb = npy.stat().st_size / 1e6
        have = (common.DATA_DIR / "terrain" / f"{sid}.json").exists()
        if a.dry_run:
            print(f"{sid:20s} lat {s['lat_deg']:8.3f}  {side['product'][:22]:22s} cached {npy.name[:44]:44s} {size_mb:7.1f} MB  terrain {'yes' if have else 'no'}  ({how})")
            continue
        dem, side = terrain.load_dem(npy)
        if not a.check_only and not (sid in DEMO and have):        # never rebuild the 3 demo sites
            try:
                terrain.build_terrain(sid, s["lat_deg"], s["lon_deg"], dem, side["product"], side["url"], common.DATA_DIR)
            except Exception as e:  # noqa: BLE001 - skip and keep going (lead's instruction)
                skipped.append((sid, f"build failed: {e}"))
                print(f"SKIP  {sid}: build failed: {e}")
                continue
        c = check_site(s, heights, dem)
        c["product"] = side["product"]
        c["bin_kb"] = (common.DATA_DIR / "terrain" / f"{sid}.bin").stat().st_size / 1024
        meta = json.loads((common.DATA_DIR / "terrain" / f"{sid}.json").read_text())
        batch = "polar" if side["kind"] == "polar_south" else "global"
        results[batch].append(c)
        print(f"{'OK  ' if c['pass'] else 'FAIL'}  {sid:20s} {side['product'][:16]:16s} h {meta['height_min_m']:8.0f}..{meta['height_max_m']:7.0f} m"
              f"  site Δ {c['dh_m']:.2f}/{c['tol_m']:.1f} m  sat {c['sat_frac']*100:.2f}%  r {c['r_northup']:.4f} (alt {c['r_best_alt']:.3f})"
              f"{'' if c['orientation_testable'] else ' flat'}  bin {c['bin_kb']:.0f} KB")
    if a.dry_run:
        return
    RESULTS.mkdir(parents=True, exist_ok=True)
    for batch, rows in results.items():
        if not rows:
            continue
        fails = [r["site_id"] for r in rows if not r["pass"]]
        doc = {
            "id": f"terrain_sanity_{batch}", "kind": "terrain", "site_id": None,
            "n_samples": len(rows), "pass": not fails,
            "notes": (f"{len(rows)} terrain files ({batch} DEMs): site height vs sites.json elevation_m max "
                      f"{max(r['dh_m'] for r in rows):.2f} m (tol 1 m + tan(slope)*res); saturated pixels max "
                      f"{max(r['sat_frac'] for r in rows)*100:.2f} %; north-up r vs an independent N/E offset re-sample "
                      f"min {min(r['r_northup'] for r in rows):.4f}, best flipped/rotated copy max "
                      f"{max(r['r_best_alt'] for r in rows):.3f}. Failing: {fails or 'none'}. pipeline/terrain_all.py"),
        }
        (RESULTS / f"terrain_sanity_{batch}.json").write_text(json.dumps(doc, indent=1))
        (RESULTS / f"terrain_sanity_{batch}.detail.json").write_text(json.dumps(rows, indent=1))
    if skipped:
        print("skipped:", skipped)


if __name__ == "__main__":
    main()
