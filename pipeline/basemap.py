"""Map backgrounds for the web map (visual only; no metric uses them).

  southpole.png + .json  hillshade of LOLA LDEM_80S_40M, Moon-sphere south polar stereographic, whole product
                         (+-304 km, every site with |lat| >= 80), row 0 = top edge = +y (lon 0 up, lon 90E right).
  global.jpg + .json     equirectangular shaded relief from the NASA SVS CGI Moon Kit: colour map
                         (lroc_color_poles_2k.tif) multiplied by a hillshade of the kit's elevation map (ldem_16_uint.tif).
                         lon -180..180 left->right, lat 90..-90 top->bottom.

Kit layout (left edge = -180 deg, top = +90 deg, DN = half metres + 20000) was checked against our cached
LOLA LDEM_256 windows: r = 0.98-0.999 at 6 windows; the 0..360 layout gives r < 0.2.

Run: LLSN_RAW_DIR=... .venv/bin/python pipeline/basemap.py   (needs Pillow; inputs cached in data/raw/)
"""

from __future__ import annotations

import json
import math
import warnings
from pathlib import Path

import numpy as np
from PIL import Image

import common

OUT_DIR = common.DATA_DIR / "basemap"
SVS_PAGE = "https://svs.gsfc.nasa.gov/4720"
SVS_BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720"
R_M = common.MOON_RADIUS_KM * 1000.0


def hillshade(z: np.ndarray, dx: np.ndarray | float, dy: float, az_deg: float, alt_deg: float,
              zfactor: float = 1.0) -> np.ndarray:
    """Lambertian hillshade, 0..1. Rows go toward -y (down = south / away from 'up'), cols toward +x.
    az_deg: light direction measured clockwise from image up. dx may vary per row (shape (nrow,1))."""
    gy, gx = np.gradient(z.astype(np.float64) * zfactor)
    dzdx = gx / dx                      # +x to the right
    dzdy = -gy / dy                     # rows increase downward -> +y is up
    az, alt = math.radians(az_deg), math.radians(alt_deg)
    lx, ly, lz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
    n = np.sqrt(dzdx ** 2 + dzdy ** 2 + 1.0)
    return np.clip((-dzdx * lx - dzdy * ly + lz) / n, 0.0, 1.0)


def _block_mean(arr: np.ndarray, f: int, chunk_rows: int = 400) -> np.ndarray:
    n0, n1 = arr.shape[0] // f, arr.shape[1] // f
    out = np.empty((n0, n1), np.float32)
    for r in range(0, n0, chunk_rows):
        r1 = min(n0, r + chunk_rows)
        blk = np.asarray(arr[r * f:r1 * f, :n1 * f], dtype=np.float32)
        out[r:r1] = blk.reshape(r1 - r, f, n1, f).mean(axis=(1, 3))
    return out


def build_southpole(size_px: int = 2048, pool: int = 4, az_deg: float = 315.0, alt_deg: float = 35.0,
                    zfactor: float = 1.5) -> dict:
    js = common.RAW_DIR / "dem" / "ldem_80s_40m_r0-15200_c0-15200.json"
    side = json.loads(js.read_text())
    assert side["row0"] == 0 and side["col0"] == 0 and side["nrow"] == side["n_full"], "need the whole product"
    n, res, scale = side["n_full"], side["resolution_m"], side["scale_m_per_dn"]
    half = n * res / 2.0
    dem = np.load(js.with_suffix(".npy"), mmap_mode="r")
    z = _block_mean(dem, pool) * scale                              # metres, pool*res spacing
    hs = hillshade(z, res * pool, res * pool, az_deg, alt_deg, zfactor)
    img = Image.fromarray((np.power(hs, 0.8) * 255).round().astype(np.uint8), "L")
    img = img.resize((size_px, size_px), Image.LANCZOS)
    q = np.asarray(img).astype(np.float64)                          # 64 grey levels keep the PNG under 2 MB
    img = Image.fromarray(np.clip(np.floor(q / 4.0) * 4.0 + 2.0, 0, 255).astype(np.uint8), "L")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    png = OUT_DIR / "southpole.png"
    img.save(png, optimize=True)
    credit = "Hillshade: LRO LOLA LDEM_80S_40M (NASA PDS)"
    doc = {
        "meta": common.make_meta("pipeline/basemap.py", [{
            "name": side["product"], "url": side["url"],
            "notes": f"label {side['label_url']}; whole product {n}x{n} px at {res:g} m, block-mean x{pool} "
                     f"({res * pool:g} m), hillshade, Lanczos resample to {size_px} px "
                     f"({2 * half / size_px:.1f} m/px), 64 grey levels. Planar gradient (scale factor <= 1.6% at 80S ignored)."}]),
        "image": "basemap/southpole.png",
        "projection": common.MOON_SOUTH_POLAR_STEREO,
        "extent_m": [-half, half, -half, half],
        "width": size_px, "height": size_px,
        "row0": "top",
        "pixel_layout": "row 0 = top edge (y = ymax), col 0 = left edge (x = xmin); +y = toward lon 0, +x = toward lon 90E",
        "shading": {"sun_az_deg": az_deg, "sun_alt_deg": alt_deg, "z_factor": zfactor,
                    "az_reference": "image-relative: clockwise from image up (+y). Cartographic light, not a real Sun position."},
        "credit": credit,
        "notes": "Visual background only; no metric uses it.",
    }
    common.write_json(OUT_DIR / "southpole.json", doc)
    return {"png_kb": png.stat().st_size / 1024, "half_m": half}


def build_global(width: int = 2048, az_deg: float = 315.0, alt_deg: float = 45.0, zfactor: float = 3.0,
                 quality: int = 85) -> dict:
    import rasterio
    svs = common.RAW_DIR / "svs"
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")            # the kit TIFFs carry no georeferencing
        with rasterio.open(svs / "ldem_16_uint.tif") as d:
            dn = d.read(1).astype(np.float64)
        with rasterio.open(svs / "lroc_color_poles_2k.tif") as d:
            rgb = np.moveaxis(d.read(), 0, -1).astype(np.float64) / 255.0
    h, w = dn.shape                                       # 2880 x 5760, 16 px/deg
    z = (dn - 20000.0) * 0.5                              # metres (offset only shifts, slopes unaffected)
    lat = 90.0 - (np.arange(h) + 0.5) / (h / 180.0)
    dy = math.pi * R_M / h
    dx = (2 * math.pi * R_M / w) * np.maximum(np.cos(np.radians(lat)), 0.02)[:, None]
    hs = hillshade(z, dx, dy, az_deg, alt_deg, zfactor)
    flat = math.sin(math.radians(alt_deg))
    mult = np.clip(hs / flat, 0.25, 1.8)
    height = width // 2
    mult_img = Image.fromarray((mult / 1.8 * 255).astype(np.uint8), "L").resize((width, height), Image.LANCZOS)
    m = np.asarray(mult_img, np.float64) / 255.0 * 1.8
    assert rgb.shape[:2] == (height, width), rgb.shape
    # sanity: albedo vs elevation (maria low and dark) must agree in this layout
    zs = np.asarray(Image.fromarray(z.astype(np.float32)).resize((width, height), Image.BILINEAR))
    r_layout = float(np.corrcoef(zs.ravel(), rgb.mean(axis=2).ravel())[0, 1])
    r_shift = float(np.corrcoef(np.roll(zs, width // 2, axis=1).ravel(), rgb.mean(axis=2).ravel())[0, 1])
    assert r_layout > 0.3 and r_layout > r_shift + 0.2, (r_layout, r_shift)
    out = np.clip(rgb * (0.35 + 0.65 * m[..., None]) * 1.05, 0, 1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jpg = OUT_DIR / "global.jpg"
    Image.fromarray((out * 255).round().astype(np.uint8), "RGB").save(jpg, quality=quality, optimize=True,
                                                                        progressive=True)
    credit = "NASA's Scientific Visualization Studio, CGI Moon Kit (svs.gsfc.nasa.gov/4720)"
    doc = {
        "meta": common.make_meta("pipeline/basemap.py", [
            {"name": "NASA SVS CGI Moon Kit: lroc_color_poles_2k.tif", "url": f"{SVS_BASE}/lroc_color_poles_2k.tif",
             "notes": f"page {SVS_PAGE}; credit: NASA's Scientific Visualization Studio. The kit says it is "
                      "optimized for aesthetics, not science."},
            {"name": "NASA SVS CGI Moon Kit: ldem_16_uint.tif", "url": f"{SVS_BASE}/ldem_16_uint.tif",
             "notes": f"5760x2880, 16 px/deg, half-metre DN; hillshade az {az_deg:g} (from north) alt {alt_deg:g} "
                      f"z x{zfactor:g}, multiplied into the colour map. Layout check: elevation vs albedo r = "
                      f"{r_layout:.2f} (shifted 180 deg: {r_shift:.2f}); vs LOLA LDEM_256 windows r >= 0.98."}]),
        "image": "basemap/global.jpg",
        "projection": "equirectangular",
        "lon_range": [-180.0, 180.0],
        "lat_range": [-90.0, 90.0],
        "width": width, "height": height,
        "row0": "top",
        "pixel_layout": "row 0 = lat 90 (top), col 0 = lon -180 (left); pixel centres at half-pixel offsets",
        "shading": {"sun_az_deg": az_deg, "sun_alt_deg": alt_deg, "z_factor": zfactor,
                    "az_reference": "clockwise from north (map up). Cartographic light, not a real Sun position."},
        "credit": credit,
        "notes": "Visual background only; no metric uses it.",
    }
    common.write_json(OUT_DIR / "global.json", doc)
    return {"jpg_kb": jpg.stat().st_size / 1024, "r_layout": r_layout, "r_shift": r_shift}


if __name__ == "__main__":
    print("southpole", build_southpole())
    print("global", build_global())
