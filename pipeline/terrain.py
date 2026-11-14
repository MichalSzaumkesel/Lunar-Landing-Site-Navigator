"""A6: local ENU heightmap -> terrain/<id>.json + .bin (contract §2.5).

256 x 256 uint16 little-endian, row-major, row 0 = NORTH edge, col 0 = WEST edge, site at the centre pixel
(row 128, col 128), spacing 80 m (default extent ~20 km). Pixel (row, col) lies at east = (col - 128) * spacing,
north = (128 - row) * spacing from the site. Each ENU point is converted to lat/lon on the Moon sphere
(great-circle destination), then the DEM is sampled bilinearly through its own projection (polar stereographic
grids are never assumed to be north-up). Heights are metres relative to R = 1737.4 km.
Decode: h = height_min_m + v / 65535 * (height_max_m - height_min_m).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
from horizon import CylDem, Dem, PolarDem, destination  # noqa: E402

SIZE = 256
SPACING_M = 80.0


def enu_grid(dem: Dem, lat: float, lon: float, size: int = SIZE, spacing: float = SPACING_M) -> np.ndarray:
    idx = np.arange(size) - size // 2
    east = idx[None, :] * spacing
    north = (-idx)[:, None] * spacing
    d = np.hypot(east, north)
    az = np.degrees(np.arctan2(east, north))          # from north, clockwise
    la, lo = destination(lat, lon, az, d)
    return dem.sample(la, lo)


def encode(h: np.ndarray):
    hmin, hmax = float(np.min(h)), float(np.max(h))
    span = max(hmax - hmin, 1e-6)
    v = np.round((h - hmin) / span * 65535.0).astype(np.uint16)
    return v, hmin, hmax


def decode(v: np.ndarray, hmin: float, hmax: float) -> np.ndarray:
    return hmin + v.astype(np.float64) / 65535.0 * (hmax - hmin)


def build_terrain(site_id: str, lat: float, lon: float, dem: Dem, product: str, url: str, out_dir: Path) -> dict:
    h = enu_grid(dem, lat, lon)
    if not np.all(np.isfinite(h)):
        raise RuntimeError(f"{int(np.sum(~np.isfinite(h)))} terrain pixels outside the DEM window")
    v, hmin, hmax = encode(h)
    site_h = float(h[SIZE // 2, SIZE // 2])
    (out_dir / "terrain").mkdir(parents=True, exist_ok=True)
    (out_dir / "terrain" / f"{site_id}.bin").write_bytes(v.astype("<u2").tobytes())
    doc = {
        "meta": common.make_meta("pipeline/terrain.py", [{
            "name": product, "url": url,
            "notes": f"ENU grid {SIZE}x{SIZE} at {SPACING_M:.0f} m, bilinear from the DEM; label {dem.info.get('label_url', '')}"}]),
        "site_id": site_id,
        "size_px": SIZE,
        "spacing_m": SPACING_M,
        "frame": "local_tangent_enu",
        "origin": "site",
        "encoding": "uint16-le",
        "bin": f"terrain/{site_id}.bin",
        "height_min_m": hmin,
        "height_max_m": hmax,
        "site_height_m": site_h,
        "dem": {"product": product, "resolution_m": round(float(dem.resolution_m), 1), "url": url},
    }
    common.write_json(out_dir / "terrain" / f"{site_id}.json", doc)
    return doc


def load_dem(npy: Path):
    side = json.loads(npy.with_suffix(".json").read_text())
    dem = PolarDem.from_cache(npy) if side["kind"] == "polar_south" else CylDem.from_cache(npy)
    return dem, side


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("site_id")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--dem-npy", type=Path, required=True)
    a = ap.parse_args()
    dem, side = load_dem(a.dem_npy)
    doc = build_terrain(a.site_id, a.lat, a.lon, dem, side["product"], side["url"], common.DATA_DIR)
    print(f"{a.site_id}: height {doc['height_min_m']:.0f}..{doc['height_max_m']:.0f} m, site {doc['site_height_m']:.1f} m")


if __name__ == "__main__":
    main()
