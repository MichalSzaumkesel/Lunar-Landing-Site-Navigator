"""A5: download only the LOLA DEM windows needed into $LLSN_RAW_DIR/dem/ (git-ignored). Prints summaries only.

Products (PDS Geosciences Node, LRO-L-LOLA-4-GDR-V1.0, all heights relative to R = 1737.4 km, int16, DN*0.5 = metres):
  * Global (|lat| < 80): LDEM_1024_<lat band>_<lon band> tiles, simple cylindrical, 1024 px/deg (~29.6 m/px at the
    equator), pixel-registered, East-positive longitude 0..360 per tile (wrap handled here), 15 deg x 30 deg tiles.
    Directory: .../lrolol_1xxx/data/lola_gdr/cylindrical/img/
  * Polar (|lat| >= 80): LDEM_80S_20M (20 m/px, polar stereographic on the Moon sphere, true scale at the pole,
    lon_0 = 0, 30400 x 30400 px) or the 40 m / 80 m versions. Directory: .../data/lola_gdr/polar/img/
Windows are fetched with HTTP Range requests (the server supports them) so only the rows needed are downloaded;
the assembled window is cached as <name>.npy (+ .json sidecar with the georeferencing).
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

PDS = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr"
CYL_URL = f"{PDS}/cylindrical/img"
POLAR_URL = f"{PDS}/polar/img"
R_M = common.MOON_RADIUS_KM * 1000.0
KM_PER_DEG = math.pi * R_M / 180.0 / 1000.0   # 30.322 km
CYL_PPD = 1024
CYL_TILE_W, CYL_TILE_H = 30 * CYL_PPD, 15 * CYL_PPD
SCALE = 0.5  # DN -> m (label SCALING_FACTOR)


def dem_dir() -> Path:
    d = common.RAW_DIR / "dem"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _ns(lat: int) -> str:
    return f"{abs(lat):02d}{'n' if lat >= 0 else 's'}"


TILES = {1024: (15, 30), 256: (90, 180)}   # (tile height deg, tile width deg)
PRODUCTS = {1024: "LOLA LDEM_1024 (LRO-L-LOLA-4-GDR-V1.0, V1.05)", 256: "LOLA LDEM_256 (LRO-L-LOLA-4-GDR-V1.0, V4.0)"}


def cyl_tile_name(lat_lo: int, lon_w: int, ppd: int = 1024) -> str:
    if ppd == 256:   # ldem_256_00n_90n_000_180 / ldem_256_90s_00s_180_360
        band = "00n_90n" if lat_lo >= 0 else "90s_00s"
        return f"ldem_256_{band}_{lon_w:03d}_{lon_w + 180:03d}"
    """LDEM_1024 tile name, e.g. ldem_1024_00n_15n_000_030 / ldem_1024_15s_00s_000_030."""
    lat_hi = lat_lo + 15
    # the northern band names use 'n' for both ends ('00n_15n'); southern ones 's' ('15s_00s', '30s_15s')
    a = _ns(lat_lo) if lat_lo < 0 else f"{lat_lo:02d}n"
    b = f"{abs(lat_hi):02d}s" if lat_hi <= 0 else f"{lat_hi:02d}n"
    return f"ldem_1024_{a}_{b}_{lon_w:03d}_{lon_w + 30:03d}"


def _range_get(url: str, start: int, end: int, session: requests.Session) -> bytes:
    r = session.get(url, headers={"Range": f"bytes={start}-{end}"}, timeout=600)
    if r.status_code != 206:
        raise RuntimeError(f"{url}: expected 206 for range request, got {r.status_code}")
    if len(r.content) != end - start + 1:
        raise RuntimeError(f"{url}: short read {len(r.content)} != {end - start + 1}")
    return r.content


def head_size(url: str) -> int:
    r = requests.head(url, timeout=60, allow_redirects=True)
    r.raise_for_status()
    return int(r.headers["content-length"])


def fetch_cylindrical_window(lat_min: float, lat_max: float, lon_w: float, lon_e: float, name: str,
                             max_mb: float = 1200.0, ppd: int = 1024) -> Path:
    """Assemble the LDEM_1024 window [lat_min,lat_max] x [lon_w,lon_e] (lon in -180..180, lon_w<lon_e allowed to cross
    the antimeridian by using lon_e > 180). Cached as <name>.npy/.json. Returns the .npy path."""
    tile_deg_h, tile_deg_w = TILES[ppd]
    tile_w, tile_h = tile_deg_w * ppd, tile_deg_h * ppd
    npy = dem_dir() / f"{name}.npy"
    side = npy.with_suffix(".json")
    if npy.exists() and side.exists():
        return npy
    # global pixel grid: row = (90 - lat)*ppd, col = (lon mod 360)*ppd; use unwrapped lon in [lon_w0, lon_w0+width)
    lon_w0 = lon_w % 360.0
    width_deg = lon_e - lon_w
    r0 = int(math.floor((90.0 - lat_max) * ppd))
    r1 = int(math.ceil((90.0 - lat_min) * ppd))           # exclusive
    c0 = int(math.floor(lon_w0 * ppd))
    c1 = int(math.ceil((lon_w0 + width_deg) * ppd))      # exclusive, may exceed 360*ppd (wrap)
    nrow, ncol = r1 - r0, c1 - c0
    est_mb = nrow * tile_w * 2 / 1e6 * math.ceil(ncol / tile_w + 1)
    print(f"window {nrow}x{ncol} px; approx download {est_mb:.0f} MB")
    if est_mb > max_mb:
        raise RuntimeError(f"download ~{est_mb:.0f} MB exceeds {max_mb} MB; ask the lead")
    out = np.zeros((nrow, ncol), dtype=np.int16)
    sess = requests.Session()
    done = np.zeros((nrow, ncol), dtype=bool)
    for tile_lat_lo in range(-90, 90, tile_deg_h):
        t_r0 = int((90 - (tile_lat_lo + tile_deg_h)) * ppd)           # global row of tile top
        ra, rb = max(r0, t_r0), min(r1, t_r0 + tile_h)
        if ra >= rb:
            continue
        for k in range(0, 360, tile_deg_w):
            for wrap in (0, 360):
                g0 = k * ppd + wrap * ppd
                ca, cb = max(c0, g0), min(c1, g0 + tile_w)
                if ca >= cb:
                    continue
                url = f"{CYL_URL}/{cyl_tile_name(tile_lat_lo, k, ppd)}.img"
                # read rows ra..rb of the tile in one contiguous range, then crop columns
                lr0, lr1 = ra - t_r0, rb - t_r0
                n_bytes = (lr1 - lr0) * tile_w * 2
                print(f"  {Path(url).name}: rows {lr0}..{lr1}, cols {ca - g0}..{cb - g0} ({n_bytes / 1e6:.0f} MB)", flush=True)
                buf = bytearray()
                step = 50_000_000
                start = lr0 * tile_w * 2
                while len(buf) < n_bytes:
                    e = min(start + len(buf) + step, start + n_bytes) - 1
                    buf += _range_get(url, start + len(buf), e, sess)
                tile = np.frombuffer(bytes(buf), dtype="<i2").reshape(lr1 - lr0, tile_w)
                out[ra - r0:rb - r0, ca - c0:cb - c0] = tile[:, ca - g0:cb - g0]
                done[ra - r0:rb - r0, ca - c0:cb - c0] = True
    if not done.all():
        raise RuntimeError("window not fully covered by tiles")
    np.save(npy, out)
    side.write_text(json.dumps({
        "kind": "cylindrical", "product": PRODUCTS[ppd], "url": CYL_URL,
        "ppd": ppd, "scale_m_per_dn": SCALE, "row0_lat_top": 90.0 - r0 / ppd,
        "col0_lon_west": c0 / ppd,   # unwrapped east longitude of the west edge (0..360+)
        "nrow": nrow, "ncol": ncol, "pixel_registered": True,
        "resolution_m": KM_PER_DEG * 1000.0 / ppd,
        "label_url": f"{CYL_URL}/{cyl_tile_name(0, 0, ppd)}.lbl",
    }))
    return npy


def fetch_polar_south(product: str = "ldem_80s_20m", half_extent_m: float | None = None,
                      cx_m: float = 0.0, cy_m: float = 0.0, max_mb: float = 1200.0) -> Path:
    """Cache the rows of a south-polar LDEM product covering a square of +-half_extent_m around (cx,cy) projected
    metres (or the whole file if None). Pixel (row,col) centre: x = (col+0.5-N/2)*res, y = (N/2-(row+0.5))*res
    (pole at the image centre, +y up = lon 0, +x right = lon 90E; label LINE/SAMPLE_PROJECTION_OFFSET = N/2 - 0.5)."""
    base = product
    url = f"{POLAR_URL}/{base}.img"
    size = head_size(url)
    n = int(round(math.sqrt(size / 2)))
    if n * n * 2 != size:
        raise RuntimeError(f"{base}: unexpected size {size}")
    res = {"20m": 20.0, "30m": 30.0, "40m": 40.0, "60m": 60.0, "80m": 80.0, "10m": 10.0, "120m": 120.0}[base.rsplit("_", 1)[1]]
    if half_extent_m is None:
        r0, r1, c0, c1 = 0, n, 0, n
    else:
        r0 = max(0, int(math.floor(n / 2 - (cy_m + half_extent_m) / res)))
        r1 = min(n, int(math.ceil(n / 2 - (cy_m - half_extent_m) / res)))
        c0 = max(0, int(math.floor(n / 2 + (cx_m - half_extent_m) / res)))
        c1 = min(n, int(math.ceil(n / 2 + (cx_m + half_extent_m) / res)))
    name = f"{base}_r{r0}-{r1}_c{c0}-{c1}"
    npy = dem_dir() / f"{name}.npy"
    if npy.exists():
        return npy
    mb = (r1 - r0) * n * 2 / 1e6
    print(f"{base}: {n}x{n} px, rows {r0}..{r1} cols {c0}..{c1}; download ~{mb:.0f} MB")
    if mb > max_mb:
        raise RuntimeError(f"download ~{mb:.0f} MB exceeds {max_mb} MB; ask the lead")
    sess = requests.Session()
    buf = bytearray()
    start, total = r0 * n * 2, (r1 - r0) * n * 2
    while len(buf) < total:
        e = min(start + len(buf) + 50_000_000, start + total) - 1
        buf += _range_get(url, start + len(buf), e, sess)
    arr = np.frombuffer(bytes(buf), dtype="<i2").reshape(r1 - r0, n)[:, c0:c1].copy()
    np.save(npy, arr)
    npy.with_suffix(".json").write_text(json.dumps({
        "kind": "polar_south", "product": f"LOLA {base.upper()} (LRO-L-LOLA-4-GDR-V1.0, V2.0)", "url": url,
        "label_url": f"{POLAR_URL}/{base}.lbl", "scale_m_per_dn": SCALE, "resolution_m": res, "n_full": n,
        "row0": r0, "col0": c0, "nrow": r1 - r0, "ncol": c1 - c0, "proj4": common.MOON_SOUTH_POLAR_STEREO,
    }))
    return npy


POLAR_HALF_KM = {"ldem_80s_20m": 304.0, "ldem_80s_40m": 304.0, "ldem_75s_60m": 457.4}   # n * res / 2 (labels)


def polar_covers(lat: float, range_km: float, product: str = "ldem_80s_40m") -> bool:
    """True if the south-polar product covers range_km around the site (distance from pole + range + 2 km slack)."""
    if lat > -75.0:
        return False
    return (90.0 + lat) * KM_PER_DEG + range_km + 2.0 <= POLAR_HALF_KM[product]


def ensure_dem(lat: float, lon: float, range_km: float, demo: bool = False) -> Path:
    """Return a cached DEM window (.npy) covering range_km around the site; download only if no cached one covers it.
    Polar (south, range inside the product): demo sites LDEM_80S_20M window, others the full LDEM_80S_40M.
    Otherwise global: demo sites LDEM_1024, others LDEM_256 (download budget)."""
    margin = 3.0
    prod = "ldem_80s_20m" if demo else "ldem_80s_40m"
    if not polar_covers(lat, range_km, prod) and not demo and polar_covers(lat, range_km, "ldem_75s_60m"):
        prod = "ldem_75s_60m"
    if (demo and lat <= -80.0) or polar_covers(lat, range_km, prod):   # demo sites keep the 20 m polar window
        from pyproj import Transformer
        t = Transformer.from_crs("+proj=longlat +R=1737400 +no_defs", common.MOON_SOUTH_POLAR_STEREO, always_xy=True)
        x, y = t.transform(lon, lat)
        half = (range_km + margin) * 1000.0
        for js in sorted(dem_dir().glob(f"{prod}_r*.json")):
            m = json.loads(js.read_text())
            n, res = m["n_full"], m["resolution_m"]
            xmin, xmax = (m["col0"] - n / 2) * res, (m["col0"] + m["ncol"] - n / 2) * res
            ymax, ymin = (n / 2 - m["row0"]) * res, (n / 2 - m["row0"] - m["nrow"]) * res
            if ((xmin <= x - half or m["col0"] == 0) and (xmax >= x + half or m["col0"] + m["ncol"] >= n)
                    and (ymin <= y - half or m["row0"] + m["nrow"] >= n) and (ymax >= y + half or m["row0"] == 0)):
                return js.with_suffix(".npy")
        if demo or prod == "ldem_75s_60m":
            return fetch_polar_south(prod, half, x, y)
        return fetch_polar_south(prod, None)
    ppd = 1024 if demo else 256
    dlat = (range_km + margin) / KM_PER_DEG
    # exact longitude half-extent of a spherical disc of angular radius dlat: sin(dlon) = sin(dlat)/cos(lat)
    sx = math.sin(math.radians(dlat)) / max(math.cos(math.radians(lat)), 1e-6)
    dlon = math.degrees(math.asin(sx)) if sx < 1.0 else 180.0
    la0, la1, lo0, lo1 = max(lat - dlat, -90.0), min(lat + dlat, 90.0), lon - dlon, lon + dlon
    for js in sorted(dem_dir().glob(f"ldem{ppd}_*.json")):
        m = json.loads(js.read_text())
        top = m["row0_lat_top"]
        bot = top - m["nrow"] / m["ppd"]
        w = m["col0_lon_west"]
        e = w + m["ncol"] / m["ppd"]
        lw = (lo0 - w) % 360.0
        if bot <= la0 and top >= la1 and lw + (lo1 - lo0) <= e - w:
            return js.with_suffix(".npy")
    name = f"ldem{ppd}_lat{la0:.1f}_{la1:.1f}_lon{lo0:.1f}_{lo1:.1f}"
    return fetch_cylindrical_window(la0, la1, lo0, lo1, name, ppd=ppd, max_mb=600.0)


if __name__ == "__main__":
    if len(sys.argv) >= 6 and sys.argv[1] == "cyl":
        _, _, la0, la1, lo0, lo1, nm = sys.argv[:7]
        p = fetch_cylindrical_window(float(la0), float(la1), float(lo0), float(lo1), nm)
        a = np.load(p, mmap_mode="r")
        print("saved", p, a.shape, "min/max DN", int(a.min()), int(a.max()))
    else:
        print("usage: fetch_dem.py cyl LAT_MIN LAT_MAX LON_W LON_E NAME")
