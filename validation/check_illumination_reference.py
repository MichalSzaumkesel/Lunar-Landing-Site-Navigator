"""Compare our pct_sunlit / pct_earth (2026-12..2028-12, observer 2 m) with the PGDA LOLA polar average
illumination and Earth-visibility rasters (Mazarico et al. 2011 products, ~18.6 yr average, hourly).

This is a plausibility check, not a validation of exact values: different period (2 yr vs ~18.6 yr), different DEM
(LDEM_80S_20M with our own horizon vs 120 m/px illumination product), possibly different observer height (not stated by PGDA),
different Sun/Earth disc rules. Sun: 'pct_sunlit' (disc centre above horizon) and 'sun_any_part' (any part of disc above)
are both reported. Earth: PGDA counts Earth visible if any part of the disc is visible -> 'earth_any_part' is the like-for-like.

Usage: check_illumination_reference.py --data-dir DIR_WITH_horizon_ephem_sites [--pgda-dir ...] [--pipeline-dir DIR]
Output: validation/results/illum_ref_<site_id>.json (contract 2.4 shape, kind illumination_reference) + .detail.json
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
SUN_FILE = "AVGVISIB_75S_120M_201608.TIF"
EARTH_FILE = "AVGVISIB_75S_120M_201608_EARTH.TIF"
MOON_STERE = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
TOL_PP = 15.0
SITES = ("southpole_landed", "artemis_region_1")


def sample(path: Path, lat: float, lon: float, radius_px: int = 0):
    with rasterio.open(path) as ds:
        crs = ds.crs.to_string() if ds.crs else None
        tr = Transformer.from_crs("+proj=longlat +R=1737400 +no_defs", ds.crs if ds.crs else MOON_STERE, always_xy=True)
        x, y = tr.transform(lon, lat)
        row, col = ds.index(x, y)
        r = radius_px
        win = rasterio.windows.Window(col - r, row - r, 2 * r + 1, 2 * r + 1)
        a = ds.read(1, window=win).astype("float64")
        nod = ds.nodata
        scale = ds.scales[0] if ds.scales else 1.0
        off = ds.offsets[0] if ds.offsets else 0.0
        info = {"crs": crs, "dtype": ds.dtypes[0], "nodata": nod, "scale": scale, "offset": off, "res": ds.res,
                "row": int(row), "col": int(col)}
        if nod is not None:
            a = np.where(a == nod, np.nan, a)
        return a * scale + off, info  # DN * 4e-5 -> fraction 0..1 (raster scale tag)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, required=True, help="dir with horizon/, ephem/, sites.json")
    ap.add_argument("--pipeline-dir", type=Path, required=True, help="dir containing metrics.py")
    ap.add_argument("--pgda-dir", type=Path, default=RAW / "pgda")
    ap.add_argument("--height", type=int, default=2)
    ap.add_argument("--out-dir", type=Path, default=REPO / "validation/results")
    ap.add_argument("--scale", type=float, default=None, help="override DN->percent factor (default: inferred from data)")
    a = ap.parse_args()
    sys.path.insert(0, str(a.pipeline_dir))
    import metrics  # noqa: E402

    sites = {s["id"]: s for s in json.loads((a.data_dir / "sites.json").read_text())["sites"]}
    a.out_dir.mkdir(parents=True, exist_ok=True)
    rc = 0
    for sid in SITES:
        s = sites[sid]
        hz = json.loads((a.data_dir / "horizon" / f"{sid}.json").read_text())
        eph = json.loads((a.data_dir / "ephem" / f"{sid}.json").read_text())
        t0 = eph["start_utc"]
        step_s = eph["step_minutes"] * 60
        t1 = metrics.format_utc(metrics.parse_utc(t0) + eph["count"] * step_s)
        m = metrics.compute_metrics(hz, eph, a.height, t0, t1)
        mask = metrics.select_mask(hz, a.height)
        az_step = float(hz["az_step_deg"])
        any_part = {}
        for b in ("sun", "earth"):
            cl = metrics.clearances(eph, mask, az_step, b)
            r = float(eph[f"{b}_ang_radius_deg"])
            any_part[b] = 100.0 * float(np.mean([c > -r for c in cl]))
        ours = {"pct_sunlit": m["pct_sunlit"], "mean_sun_frac": m["mean_sun_frac"], "sun_any_part": any_part["sun"],
                "pct_earth": m["pct_earth"], "earth_any_part": any_part["earth"], "pct_both": m["pct_both"]}

        ref, detail_r = {}, {}
        for key, fn in (("sun", SUN_FILE), ("earth", EARTH_FILE)):
            pt, info = sample(a.pgda_dir / fn, s["lat_deg"], s["lon_deg"], 0)
            nb, _ = sample(a.pgda_dir / fn, s["lat_deg"], s["lon_deg"], 4)  # 9 x 9 px neighbourhood
            v = float(pt[0, 0])
            ref[key] = {"point": v, "nbhd_min": float(np.nanmin(nb)), "nbhd_max": float(np.nanmax(nb)),
                        "nbhd_mean": float(np.nanmean(nb))}
            detail_r[key] = info
        # after the raster scale tag the values are fractions 0..1 -> percent
        def to_pct(x: float, key: str) -> float:
            if a.scale is not None:
                return x * a.scale
            return x * 100.0  # fraction -> percent
        ref_pct = {k: {kk: to_pct(vv, k) for kk, vv in v.items()} for k, v in ref.items()}
        d_sun = ours["pct_sunlit"] - ref_pct["sun"]["point"]
        d_sun_any = ours["sun_any_part"] - ref_pct["sun"]["point"]
        d_earth = ours["earth_any_part"] - ref_pct["earth"]["point"]
        worst = max(abs(d_sun), abs(d_earth))
        passed = bool(worst <= TOL_PP)
        note = (f"Ours 2026-12-01..2028-12-31 (2 yr, observer {a.height} m, LDEM_80S_20M horizon): pct_sunlit {ours['pct_sunlit']:.1f}%, "
                f"sun any-part {ours['sun_any_part']:.1f}%, mean_sun_frac {ours['mean_sun_frac']:.1f}%, pct_earth {ours['pct_earth']:.1f}%, "
                f"earth any-part {ours['earth_any_part']:.1f}%. PGDA (~18.6 yr avg, 120 m/px, 75S product): sun {ref_pct['sun']['point']:.1f}% "
                f"(9x9 px range {ref_pct['sun']['nbhd_min']:.1f}-{ref_pct['sun']['nbhd_max']:.1f}), Earth {ref_pct['earth']['point']:.1f}% "
                f"(range {ref_pct['earth']['nbhd_min']:.1f}-{ref_pct['earth']['nbhd_max']:.1f}). Differences (ours - PGDA): sun centre-rule {d_sun:+.1f} pp, "
                f"sun any-part {d_sun_any:+.1f} pp, Earth any-part {d_earth:+.1f} pp. Plausibility tolerance {TOL_PP} pp; "
                f"periods, DEM resolution and observer height differ, so this is not an exact validation.")
        check = {"id": f"illum_ref_{sid}", "kind": "illumination_reference", "site_id": sid,
                 "max_abs_error_deg": None, "max_abs_diff_pp": round(worst, 2), "n_samples": 2, "pass": passed,
                 "threshold_deg": None, "threshold_pp": TOL_PP, "notes": note}
        (a.out_dir / f"illum_ref_{sid}.json").write_text(json.dumps(check, indent=2) + "\n")
        (a.out_dir / f"illum_ref_{sid}.detail.json").write_text(json.dumps(
            {"ours": ours, "pgda_raw": ref, "pgda_pct": ref_pct, "raster_info": detail_r,
             "files": {"sun": SUN_FILE, "earth": EARTH_FILE},
             "urls": {"sun": "https://pgda.gsfc.nasa.gov/data/MoonIllumination/" + SUN_FILE,
                      "earth": "https://pgda.gsfc.nasa.gov/data/MoonIllumination/" + EARTH_FILE}}, indent=1, default=str) + "\n")
        print(json.dumps(check, indent=2))
        rc |= 0 if passed else 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
