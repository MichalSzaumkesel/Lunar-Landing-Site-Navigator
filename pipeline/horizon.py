"""A5: terrain horizon masks -> horizon/<id>.json (contract §2.2).

Algorithm (CLAUDE.md physics notes, all in METRES, R = 1737.4 km):
  * 720 rays, azimuth i*0.5 deg from north clockwise. Observer heights 2 m and 10 m above the ground h0 (DEM, bilinear).
  * Sample points lie on the great circle leaving the site at the ray azimuth, at true ground (great-circle) distance d,
    so no projection scale factor is needed; each point (lat, lon) is converted to DEM pixel coordinates:
      - cylindrical LDEM_1024: lon 0..360 wrap handled in CylDem; row/col are linear in lat/lon.
      - polar LDEM_80S: pyproj Moon-sphere polar stereographic (common.MOON_SOUTH_POLAR_STEREO, never an Earth EPSG).
  * angle = atan2(h - (h0 + obs) - d^2/(2R), d); the mask is the max over samples of each ray.
  * Sample spacing along a ray: max(DEM resolution, 0.5 % of d) (so ~res near the site, 500 m at 100 km). Rays are
    0.5 deg apart (872 m at 100 km), so finer radial steps far away would not add information.
  * Range 150 km for |lat| >= 80 deg, 100 km otherwise. Samples outside the DEM window are ignored.
  * Bilinear interpolation of the DEM.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

R_M = common.MOON_RADIUS_KM * 1000.0
N_RAYS = 720
AZ_STEP = 0.5
OBSERVER_HEIGHTS_M = (2, 10)

# Uncertainty estimates (deg). See `uncertainty_for`.
UNCERTAINTY_POLAR_DEG = 0.1
UNCERTAINTY_GLOBAL_DEG = 0.15


def _bilinear(arr: np.ndarray, row: np.ndarray, col: np.ndarray, scale: float) -> np.ndarray:
    """Bilinear sample of arr (int16 DN) at fractional pixel-centre indices; NaN outside or when any corner is outside."""
    nrow, ncol = arr.shape
    r0 = np.floor(row).astype(np.int64)
    c0 = np.floor(col).astype(np.int64)
    fr, fc = row - r0, col - c0
    ok = (r0 >= 0) & (c0 >= 0) & (r0 < nrow - 1) & (c0 < ncol - 1)
    r0c, c0c = np.clip(r0, 0, nrow - 2), np.clip(c0, 0, ncol - 2)
    a = arr[r0c, c0c].astype(np.float64)
    b = arr[r0c, c0c + 1].astype(np.float64)
    c = arr[r0c + 1, c0c].astype(np.float64)
    d = arr[r0c + 1, c0c + 1].astype(np.float64)
    v = (a * (1 - fc) + b * fc) * (1 - fr) + (c * (1 - fc) + d * fc) * fr
    v = v * scale
    return np.where(ok, v, np.nan)


class Dem:
    resolution_m: float
    info: dict

    def sample(self, lat_deg: np.ndarray, lon_deg: np.ndarray) -> np.ndarray:
        raise NotImplementedError


class CylDem(Dem):
    """Simple-cylindrical window. arr[0,0] pixel centre is at lat = lat_top - 0.5/ppd, lon = lon_west + 0.5/ppd
    (lon_west unwrapped, 0..360+)."""

    def __init__(self, arr, lat_top, lon_west, ppd, scale=0.5, resolution_m=None, info=None):
        self.arr, self.lat_top, self.lon_west, self.ppd, self.scale = arr, lat_top, lon_west, ppd, scale
        self.resolution_m = resolution_m or (math.pi * R_M / 180.0 / ppd)
        self.info = info or {}

    def sample(self, lat_deg, lon_deg):
        lon = (np.asarray(lon_deg) - self.lon_west) % 360.0      # degrees east of the window's west edge, 0..360
        col = lon * self.ppd - 0.5
        row = (self.lat_top - np.asarray(lat_deg)) * self.ppd - 0.5
        return _bilinear(self.arr, row, col, self.scale)

    @classmethod
    def from_cache(cls, npy: Path) -> "CylDem":
        side = json.loads(npy.with_suffix(".json").read_text())
        arr = np.load(npy, mmap_mode="r")
        return cls(arr, side["row0_lat_top"], side["col0_lon_west"], side["ppd"], side["scale_m_per_dn"],
                   side["resolution_m"], info=side)


class PolarDem(Dem):
    """South-polar stereographic window of an N x N product with pole at the image centre.
    x = (col + 0.5 - N/2) * res, y = (N/2 - (row + 0.5)) * res (projected metres on the Moon sphere)."""

    def __init__(self, arr, n_full, row0, col0, res_m, scale=0.5, proj4=common.MOON_SOUTH_POLAR_STEREO, info=None):
        from pyproj import Transformer
        self.arr, self.n_full, self.row0, self.col0, self.res, self.scale = arr, n_full, row0, col0, res_m, scale
        self.resolution_m = res_m
        self.info = info or {}
        self.proj4 = proj4
        # geographic CRS on the same Moon sphere (never an Earth datum)
        self.fwd = Transformer.from_crs("+proj=longlat +R=1737400 +no_defs", proj4, always_xy=True)

    def to_xy(self, lat_deg, lon_deg):
        x, y = self.fwd.transform(np.asarray(lon_deg), np.asarray(lat_deg))
        return np.asarray(x), np.asarray(y)

    def xy_to_rowcol(self, x, y):
        col = x / self.res + self.n_full / 2 - 0.5 - self.col0
        row = self.n_full / 2 - y / self.res - 0.5 - self.row0
        return row, col

    def sample(self, lat_deg, lon_deg):
        x, y = self.to_xy(lat_deg, lon_deg)
        row, col = self.xy_to_rowcol(x, y)
        return _bilinear(self.arr, row, col, self.scale)

    @classmethod
    def from_cache(cls, npy: Path) -> "PolarDem":
        side = json.loads(npy.with_suffix(".json").read_text())
        arr = np.load(npy, mmap_mode="r")
        return cls(arr, side["n_full"], side["row0"], side["col0"], side["resolution_m"], side["scale_m_per_dn"],
                   side.get("proj4", common.MOON_SOUTH_POLAR_STEREO), info=side)


def ray_distances(res_m: float, range_m: float, rel_step: float = 0.005) -> np.ndarray:
    d = [res_m]
    while d[-1] < range_m:
        d.append(min(range_m, d[-1] + max(res_m, rel_step * d[-1])))
    return np.array(d)


def destination(lat_deg: float, lon_deg: float, az_deg: np.ndarray, d_m: np.ndarray):
    """Great-circle destination on the sphere R: arrays az (n_rays,1) and d (1,n_d) broadcast. Returns lat, lon (deg)."""
    lat1, lon1 = math.radians(lat_deg), math.radians(lon_deg)
    az = np.radians(az_deg)
    dl = d_m / R_M
    lat2 = np.arcsin(np.sin(lat1) * np.cos(dl) + np.cos(lat1) * np.sin(dl) * np.cos(az))
    lon2 = lon1 + np.arctan2(np.sin(az) * np.sin(dl) * np.cos(lat1), np.cos(dl) - np.sin(lat1) * np.sin(lat2))
    lon_d = (np.degrees(lon2) + 180.0) % 360.0 - 180.0
    return np.degrees(lat2), lon_d


def compute_masks(dem: Dem, lat_deg: float, lon_deg: float, range_km: float,
                  observer_heights=OBSERVER_HEIGHTS_M, n_rays: int = N_RAYS, chunk: int = 120):
    """Return ({obs_h: np.ndarray(n_rays) deg}, h0_m)."""
    h0 = float(dem.sample(np.array([lat_deg]), np.array([lon_deg]))[0])
    if not np.isfinite(h0):
        raise RuntimeError("site is outside the DEM window")
    d = ray_distances(dem.resolution_m, range_km * 1000.0)
    masks = {h: np.full(n_rays, -90.0) for h in observer_heights}
    az_all = np.arange(n_rays) * (360.0 / n_rays)
    for s in range(0, n_rays, chunk):
        az = az_all[s:s + chunk][:, None]
        lat, lon = destination(lat_deg, lon_deg, az, d[None, :])
        h = dem.sample(lat, lon)                                  # (rays, n_d), NaN outside
        for obs in observer_heights:
            ang = np.degrees(np.arctan2(h - (h0 + obs) - d[None, :] ** 2 / (2 * R_M), d[None, :]))
            masks[obs][s:s + chunk] = np.nanmax(ang, axis=1)      # all-NaN ray would warn/raise below
    for obs, m in masks.items():
        if not np.all(np.isfinite(m)):
            raise RuntimeError("some rays have no valid DEM samples")
    return masks, h0


def uncertainty_for(polar: bool) -> float:
    """Justified estimate (documented in docs/method.md by the validator): polar 0.1 deg, global 0.15 deg.
    Rationale: LOLA gridded heights are interpolated between ground tracks (denser near the pole); a height error of
    e metres on the limiting feature at distance d shifts the horizon by e/d rad, e.g. 10 m at 5 km = 0.11 deg, 10 m at
    2 km = 0.29 deg; the bilinear/step scheme adds <~0.03 deg. Equatorial tracks are sparser, hence the larger value."""
    return UNCERTAINTY_POLAR_DEG if polar else UNCERTAINTY_GLOBAL_DEG


def build_horizon(site_id: str, lat_deg: float, lon_deg: float, dem: Dem, product: str, url: str,
                  extra_inputs: list[dict] | None = None) -> dict:
    polar = abs(lat_deg) >= 80.0
    range_km = 150 if polar else 100
    masks, h0 = compute_masks(dem, lat_deg, lon_deg, range_km)
    inputs = [{
        "name": product, "url": url,
        "notes": (f"{dem.info.get('kind', 'dem')}; resolution {dem.resolution_m:.1f} m; bilinear; site ground height "
                  f"h0 = {h0:.1f} m rel. R=1737.4 km; ray step max(res, 0.5% d); great-circle distance; "
                  f"max range {range_km} km; DEM choice: {'polar (|lat|>=80)' if polar else 'global (|lat|<80)'}; "
                  f"label {dem.info.get('label_url', '')}"),
    }] + (extra_inputs or [])
    return {
        "meta": common.make_meta("pipeline/horizon.py", inputs),
        "site_id": site_id,
        "az_step_deg": AZ_STEP,
        "n": N_RAYS,
        "observer_heights_m": list(OBSERVER_HEIGHTS_M),
        "masks": {str(h): masks[h].tolist() for h in OBSERVER_HEIGHTS_M},
        "dem": {"product": product, "resolution_m": round(float(dem.resolution_m), 1), "url": url,
                "max_range_km": range_km},
        "uncertainty_deg": uncertainty_for(polar),
        "_site_height_m": h0,
    }


def write_horizon(doc: dict, out: Path) -> float:
    h0 = doc.pop("_site_height_m")
    common.write_json(out, doc)
    return h0


def summary(doc: dict) -> str:
    s = []
    for h, m in doc["masks"].items():
        a = np.array(m)
        s.append(f"obs {h} m: min {a.min():.3f} max {a.max():.3f} mean {a.mean():.3f} deg; "
                 f"argmax az {a.argmax() * AZ_STEP:.1f}")
    return "\n".join(s)


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("site_id")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--dem-npy", type=Path, required=True)
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    side = json.loads(a.dem_npy.with_suffix(".json").read_text())
    dem = PolarDem.from_cache(a.dem_npy) if side["kind"] == "polar_south" else CylDem.from_cache(a.dem_npy)
    doc = build_horizon(a.site_id, a.lat, a.lon, dem, side["product"], side["url"])
    out = a.out or common.DATA_DIR / "horizon" / f"{a.site_id}.json"
    h0 = write_horizon(doc, out)
    hp = Path(__file__).resolve().parent / "site_heights.json"
    heights = json.loads(hp.read_text()) if hp.exists() else {}
    heights[a.site_id] = {"height_m": round(h0, 1), "dem": side["product"]}
    hp.write_text(json.dumps(heights, indent=1))
    print(f"site height {h0:.1f} m")
    print(summary(doc))
    print("wrote", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
