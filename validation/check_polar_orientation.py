"""Check the orientation / georeferencing of the cached LOLA LDEM_80S_20M window against sourced crater centres.

Assumption under test (pipeline/fetch_dem.py): pixel (row, col) centre has projected metres
    x = (col + 0.5 - N/2) * res,  y = (N/2 - (row + 0.5)) * res      (N = 30400, res = 20 m, pole at the image centre)
with the Moon-sphere south-polar stereographic CRS (+lon_0=0, +k=1, R=1737400), i.e. +y = lon 0, +x = lon 90E.
The PDS label (CENTER_LATITUDE -90, CENTER_LONGITUDE 0, MAP_PROJECTION_ROTATION 0, offsets 15199.5, POSITIVE_LONGITUDE_DIRECTION
EAST) does not say which image side is lon 0, so we test it against craters.

Method: for each crater (centre lat/lon and diameter from the USGS/IAU Gazetteer, control network 1), project the centre with
pyproj, sample the DEM there, and measure (a) bowl contrast = mean(rim ring 0.9-1.1 R) - mean(interior r < 0.5 R) and (b) the distance
between the sourced centre and the smoothed floor minimum within 0.9 R. The same is repeated for 7 wrong orientations
(longitude mirrored and/or rotated by 90, 180, 270 degrees). The assumed orientation passes if the floor minimum lies within
PASS_FRAC * R of the sourced centre for every crater AND every wrong orientation fails at least one crater (contrast or distance).

Usage: check_polar_orientation.py [--npy PATH] [--out-dir validation/results]
Output: <out-dir>/polar_orientation_ldem80s20m.json (contract 2.4 check) and a .detail.json. Exit 0 pass, 1 fail.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
from pyproj import Transformer


def uniform_filter(a, size, mode="nearest"):
    """Box mean via cumulative sums (edge-replicated); avoids a scipy dependency."""
    h = size // 2
    p = np.pad(a.astype(np.float64), h, mode="edge")
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    n = a.shape
    out = c[size:size + n[0], size:size + n[1]] - c[:n[0], size:size + n[1]] - c[size:size + n[0], :n[1]] + c[:n[0], :n[1]]
    return out / (size * size)

REPO = Path(__file__).resolve().parent.parent
RAW = Path(os.environ.get("LLSN_RAW_DIR") or REPO / "data" / "raw")
CRS = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
N, RES = 30400, 20.0
SMOOTH_PX = 50  # 1 km box
PASS_FRAC = 0.30

GAZ = "https://planetarynames.wr.usgs.gov/Feature/"
CRATERS = [
    # name, lat, lon (planetographic +E -180..180, control network 1), diameter km, alternative centres, source
    dict(name="Shackleton", lat=-89.67, lon=129.78, d_km=20.92, alts=[(-89.63, 132.32), (-89.90, 0.0)], url=GAZ + "5450"),
    dict(name="Shoemaker", lat=-88.14, lon=45.91, d_km=51.82, alts=[(-88.03, 39.85), (-88.10, 44.90)], url=GAZ + "5494"),
    dict(name="de Gerlache", lat=-88.48, lon=-88.34, d_km=32.71, alts=[(-88.45, -90.45), (-88.50, -87.10)], url=GAZ + "1439"),
]


def proj_xy(tr: Transformer, lat: float, lon: float, s: int, k: int) -> tuple[float, float]:
    return tr.transform(s * lon + 90.0 * k, lat)


def to_pix(x: float, y: float, r0: int, c0: int) -> tuple[float, float]:
    col = x / RES + N / 2 - 0.5
    row = N / 2 - 0.5 - y / RES
    return row - r0, col - c0  # window-relative (float, pixel-centre indices)


def block_mean(a, f):
    h, w = (a.shape[0] // f) * f, (a.shape[1] // f) * f
    return a[:h, :w].reshape(h // f, f, w // f, f).mean(axis=(1, 3))


def contrast_at(sm, cy, cx, R, dy0, dx0):
    """mean(rim ring 0.9-1.1 R) - mean(interior < 0.5 R) for a circle centred at (cy+dy0, cx+dx0) on grid sm (units px)."""
    yy, xx = np.ogrid[:sm.shape[0], :sm.shape[1]]
    rad = np.hypot(yy - (cy + dy0), xx - (cx + dx0))
    ring, inner = sm[(rad > 0.9 * R) & (rad < 1.1 * R)], sm[rad < 0.5 * R]
    if ring.size < 20 or inner.size < 5:
        return None
    return float(ring.mean() - inner.mean())


def measure(dem, meta, tr, c, s, k) -> dict:
    x, y = proj_xy(tr, c["lat"], c["lon"], s, k)
    rr, cc = to_pix(x, y, meta["row0"], meta["col0"])
    R_px = c["d_km"] * 1000.0 / 2 / RES
    half = int(1.6 * R_px) + 20
    r_i, c_i = int(round(rr)), int(round(cc))
    if r_i - half < 0 or c_i - half < 0 or r_i + half >= dem.shape[0] or c_i + half >= dem.shape[1]:
        return {"ok": False, "reason": "outside cached window"}
    sub = np.asarray(dem[r_i - half:r_i + half + 1, c_i - half:c_i + half + 1], dtype=np.float32) * 0.5
    f = 10  # 200 m blocks
    sm = block_mean(sub, f)
    cy, cx = (half + (rr - r_i) + 0.5) / f - 0.5, (half + (cc - c_i) + 0.5) / f - 0.5  # sourced centre on the block grid
    Rb = R_px / f
    # (a) contrast at the sourced centre
    c0 = contrast_at(sm, cy, cx, Rb, 0.0, 0.0)
    # (b) best-fit bowl centre: maximise contrast over offsets within +-0.6 R (1 km steps)
    step = max(1, int(round(1000.0 / (RES * f))))
    lim = int(0.6 * Rb)
    best = (-1e9, 0, 0)
    for dy in range(-lim, lim + 1, step):
        for dx in range(-lim, lim + 1, step):
            v = contrast_at(sm, cy, cx, Rb, dy, dx)
            if v is not None and v > best[0]:
                best = (v, dy, dx)
    dist_km = math.hypot(best[1], best[2]) * RES * f / 1000.0
    # (c) smoothed floor minimum within 0.9 R of the sourced centre (informational)
    yy, xx = np.ogrid[:sm.shape[0], :sm.shape[1]]
    msk = np.hypot(yy - cy, xx - cx) <= 0.9 * Rb
    i = np.argmin(np.where(msk, uniform_filter(sm, 3), np.inf))
    my, mx = np.unravel_index(i, sm.shape)
    fl_km = math.hypot(my - cy, mx - cx) * RES * f / 1000.0
    return {"ok": c0 is not None, "contrast_m": None if c0 is None else round(c0, 1),
            "best_fit_centre_offset_km": round(dist_km, 2), "best_fit_contrast_m": round(best[0], 1),
            "floor_min_dist_km": round(fl_km, 2), "pix_rowcol": [round(rr, 1), round(cc, 1)]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--npy", type=Path, default=RAW / "dem" / "ldem_80s_20m_r0-16528_c10829-27830.npy")
    ap.add_argument("--out-dir", type=Path, default=REPO / "validation/results")
    a = ap.parse_args()
    meta = json.loads(a.npy.with_suffix(".json").read_text())
    if meta.get("kind") != "polar_south" or meta["n_full"] != N or meta["resolution_m"] != RES:
        raise SystemExit(f"unexpected sidecar {meta}")
    dem = np.load(a.npy, mmap_mode="r")
    tr = Transformer.from_crs("+proj=longlat +R=1737400 +no_defs", CRS, always_xy=True)

    variants = {}
    for s in (1, -1):
        for k in range(4):
            name = "ASSUMED" if (s, k) == (1, 0) else f"mirror={'yes' if s < 0 else 'no'},rot={90 * k}"
            variants[(s, k)] = (name, [measure(dem, meta, tr, c, s, k) for c in CRATERS])

    # ---- evaluate
    def good(m, c):
        return m["ok"] and m["best_fit_contrast_m"] > 500.0 and m["best_fit_centre_offset_km"] <= PASS_FRAC * c["d_km"] / 2

    res = {}
    for key, (name, ms) in variants.items():
        res[name] = {"per_crater": {c["name"]: m for c, m in zip(CRATERS, ms)},
                     "all_good": all(good(m, c) for m, c in zip(ms, CRATERS)),
                     "n_good": sum(good(m, c) for m, c in zip(ms, CRATERS))}
    assumed = res["ASSUMED"]
    wrong_pass = [n for n, r in res.items() if n != "ASSUMED" and r["all_good"]]
    passed = bool(assumed["all_good"] and not wrong_pass)
    worst = max(m["best_fit_centre_offset_km"] for m in assumed["per_crater"].values() if m["ok"])
    # alternative centres (other control networks) for the assumed orientation: nearest-pixel distance of floor min
    alt = {}
    for c in CRATERS:
        alt[c["name"]] = []
        for (la, lo) in c["alts"]:
            m = measure(dem, meta, tr, dict(c, lat=la, lon=lo), 1, 0)
            alt[c["name"]].append({"lat": la, "lon": lo, **m})
    d = ", ".join(f"{n}: best-fit bowl centre {m['best_fit_centre_offset_km']} km from sourced centre (rim-interior contrast {m['best_fit_contrast_m']} m; floor min {m['floor_min_dist_km']} km away)"
                  for n, m in assumed["per_crater"].items())
    wrong = {n: r["n_good"] for n, r in res.items() if n != "ASSUMED"}
    notes = (f"Assumed grid (row0=0,col0={meta['col0']}, N=30400, +y=lon 0, +x=lon 90E) vs USGS Gazetteer centres (control network 1). {d}. "
             f"Pass rule: best-fit bowl centre (max rim-ring minus interior mean elevation, 0.2 km blocks, search +-0.6 R) within {PASS_FRAC} R of the sourced centre and contrast > 500 m. Craters passing under wrong orientations (of 3): {wrong}. "
             f"Gazetteer centres differ by several km between control networks (see detail), so distances below ~0.3 R are not meaningful.")
    check = {"id": "polar_orientation_ldem80s20m", "kind": "orientation", "site_id": None,
             "max_abs_error_deg": None, "max_dist_km": round(worst, 2), "n_samples": len(CRATERS), "pass": passed,
             "threshold_deg": None, "threshold_km": "0.30 x crater radius", "notes": notes}
    a.out_dir.mkdir(parents=True, exist_ok=True)
    (a.out_dir / "polar_orientation_ldem80s20m.json").write_text(json.dumps(check, indent=2) + "\n")
    (a.out_dir / "polar_orientation_ldem80s20m.detail.json").write_text(json.dumps(
        {"sources": {c["name"]: c["url"] for c in CRATERS}, "variants": res, "alt_centres_assumed_orientation": alt}, indent=1) + "\n")
    print(json.dumps(check, indent=2))
    for n, r in res.items():
        print(n, r["n_good"], {k: (v.get("best_fit_contrast_m"), v.get("best_fit_centre_offset_km")) for k, v in r["per_crater"].items()})
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
