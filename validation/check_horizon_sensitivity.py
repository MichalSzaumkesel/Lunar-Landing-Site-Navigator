"""Horizon sensitivity to DEM resolution and site position, to justify `uncertainty_deg` (contract 2.2).

Uses pipeline/horizon.py read-only (imported by path) and the cached DEM windows in $LLSN_RAW_DIR/dem/.
For one site, recompute the 2 m horizon mask (720 rays) for:
  * baseline (same code, same DEM),
  * DEM block-averaged x2 and x4 (coarser DEM, same site),
  * the site moved by +-1 DEM pixel (of the original DEM) north, south, east, west.
Report RMS and max |d mask| (deg) per case, and d pct_sunlit over the full ephemeris (observer 2 m, metrics.py).
Pass rule: RMS |d mask| of the x2 case and of all four shifts is <= the uncertainty_deg stored in the site's horizon file.
The recommended uncertainty is the largest of those RMS values rounded up to 0.05 deg.

Usage: check_horizon_sensitivity.py SITE_ID LAT LON --pipeline-dir DIR --data-dir DIR [--out-dir validation/results]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
RAW = Path(os.environ.get("LLSN_RAW_DIR") or REPO / "data" / "raw")


def load_mod(path: Path, name: str):
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def block_mean_int16(a: np.ndarray, f: int) -> np.ndarray:
    """Block-average by f in strips (memory friendly); a.shape must be multiples of f."""
    nr, nc = a.shape
    out = np.empty((nr // f, nc // f), dtype=np.int16)
    strip = 512 * f
    for r in range(0, nr, strip):
        s = np.asarray(a[r:r + strip], dtype=np.float32)
        s = s.reshape(s.shape[0] // f, f, nc // f, f).mean(axis=(1, 3))
        out[r // f:r // f + s.shape[0]] = np.rint(s).astype(np.int16)
    return out


def make_dems(hz, npy: Path, lat: float, lon: float, range_km: float, factors=(1, 2, 4)):
    side = json.loads(npy.with_suffix(".json").read_text())
    dems = {}
    if side["kind"] == "polar_south":
        full = np.load(npy, mmap_mode="r")
        n, res = side["n_full"], side["resolution_m"]
        base = hz.PolarDem.from_cache(npy)
        x, y = base.to_xy(np.array([lat]), np.array([lon]))
        rc, cc = n / 2 - 0.5 - y[0] / res, x[0] / res + n / 2 - 0.5     # full-grid pixel of the site
        half = int((range_km + 3) * 1000 / res)
        S = (2 * half // 4) * 4
        r0 = int(math.floor((rc - S / 2) / 4)) * 4
        c0 = int(math.floor((cc - S / 2) / 4)) * 4
        r0l, c0l = r0 - side["row0"], c0 - side["col0"]
        if r0l < 0 or c0l < 0 or r0l + S > full.shape[0] or c0l + S > full.shape[1]:
            raise SystemExit("cached DEM window too small for the crop")
        crop = np.asarray(full[r0l:r0l + S, c0l:c0l + S])
        for f in factors:
            arr = crop if f == 1 else block_mean_int16(crop, f)
            dems[f] = hz.PolarDem(arr, n // f, r0 // f, c0 // f, res * f, side["scale_m_per_dn"],
                                  side.get("proj4", hz.common.MOON_SOUTH_POLAR_STEREO), info=side)
        return dems, res
    full = np.load(npy, mmap_mode="r")
    arr0 = np.asarray(full)
    for f in factors:
        nr, nc = (arr0.shape[0] // f) * f, (arr0.shape[1] // f) * f
        arr = arr0[:nr, :nc] if f == 1 else block_mean_int16(arr0[:nr, :nc], f)
        dems[f] = hz.CylDem(arr, side["row0_lat_top"], side["col0_lon_west"], side["ppd"] / f, side["scale_m_per_dn"],
                            side["resolution_m"] * f, info=side)
    return dems, side["resolution_m"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("site_id")
    ap.add_argument("lat", type=float)
    ap.add_argument("lon", type=float)
    ap.add_argument("--npy", type=Path, required=True, help="cached DEM window (.npy with .json sidecar)")
    ap.add_argument("--pipeline-dir", type=Path, required=True)
    ap.add_argument("--data-dir", type=Path, required=True, help="dir with horizon/ and ephem/")
    ap.add_argument("--out-dir", type=Path, default=REPO / "validation/results")
    a = ap.parse_args()
    hz = load_mod(a.pipeline_dir / "horizon.py", "pl_horizon")
    metrics = load_mod(a.pipeline_dir / "metrics.py", "pl_metrics")
    file_hz = json.loads((a.data_dir / "horizon" / f"{a.site_id}.json").read_text())
    eph = json.loads((a.data_dir / "ephem" / f"{a.site_id}.json").read_text())
    range_km = file_hz["dem"]["max_range_km"]
    unc = file_hz["uncertainty_deg"]
    dems, res = make_dems(hz, a.npy, a.lat, a.lon, range_km)

    def mask(dem, lat, lon):
        m, _ = hz.compute_masks(dem, lat, lon, range_km, observer_heights=(2,))
        return m[2]

    base = mask(dems[1], a.lat, a.lon)
    file_mask = np.array(file_hz["masks"]["2"])
    sanity = float(np.max(np.abs(base - file_mask)))

    cases = {"baseline": base}
    cases["dem_x2"] = mask(dems[2], a.lat, a.lon)
    cases["dem_x4"] = mask(dems[4], a.lat, a.lon)
    dlat = math.degrees(res / (hz.R_M))
    dlon = dlat / math.cos(math.radians(a.lat))
    for name, (la, lo) in {"shift_N": (a.lat + dlat, a.lon), "shift_S": (a.lat - dlat, a.lon),
                           "shift_E": (a.lat, a.lon + dlon), "shift_W": (a.lat, a.lon - dlon)}.items():
        cases[name] = mask(dems[1], la, lo)

    t0 = eph["start_utc"]
    t1 = metrics.format_utc(metrics.parse_utc(t0) + eph["count"] * eph["step_minutes"] * 60)

    def pct(m):
        h = dict(file_hz)
        h["masks"] = {"2": [float(v) for v in m], "10": [float(v) for v in m]}
        r = metrics.compute_metrics(h, eph, 2, t0, t1)
        return r["pct_sunlit"], r["pct_earth"]

    base_pct = pct(base)
    rows = {}
    for k, m in cases.items():
        d = m - base
        p = pct(m)
        rows[k] = {"rms_deg": float(np.sqrt(np.mean(d ** 2))), "max_abs_deg": float(np.max(np.abs(d))),
                   "d_pct_sunlit": p[0] - base_pct[0], "d_pct_earth": p[1] - base_pct[1]}
    key = ["dem_x2", "shift_N", "shift_S", "shift_E", "shift_W"]
    worst_rms = max(rows[k]["rms_deg"] for k in key)
    rec = math.ceil(worst_rms / 0.05 - 1e-9) * 0.05
    passed = bool(worst_rms <= unc)
    txt = "; ".join(f"{k}: rms {v['rms_deg']:.3f} max {v['max_abs_deg']:.3f} deg, d_pct_sunlit {v['d_pct_sunlit']:+.2f} pp"
                    for k, v in rows.items() if k != "baseline")
    notes = (f"2 m mask, DEM {file_hz['dem']['product']} ({res:g} m px), baseline recomputed with the pipeline code "
             f"(max diff to file {sanity:.4f} deg; baseline pct_sunlit {base_pct[0]:.1f}%). {txt}. "
             f"File uncertainty_deg {unc}; worst RMS (x2 and +-1 px shifts) {worst_rms:.3f} deg -> recommended uncertainty_deg {rec:.2f}. "
             f"Sensitivity of the pipeline's own horizon to resolution and position only; does not include LOLA height error or DEM geolocation error.")
    check = {"id": f"horizon_sensitivity_{a.site_id}", "kind": "horizon_sensitivity", "site_id": a.site_id,
             "max_abs_error_deg": round(max(r["max_abs_deg"] for k, r in rows.items() if k != "baseline"), 4),
             "rms_worst_deg": round(worst_rms, 4), "recommended_uncertainty_deg": round(rec, 2),
             "n_samples": len(base), "pass": passed, "threshold_deg": unc, "notes": notes}
    a.out_dir.mkdir(parents=True, exist_ok=True)
    (a.out_dir / f"{check['id']}.json").write_text(json.dumps(check, indent=2) + "\n")
    (a.out_dir / f"{check['id']}.detail.json").write_text(json.dumps({"cases": rows, "base_pct": base_pct, "sanity_vs_file_deg": sanity}, indent=1) + "\n")
    print(json.dumps(check, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
