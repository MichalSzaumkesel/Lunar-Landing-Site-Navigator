import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import terrain  # noqa: E402
from horizon import R_M, CylDem, PolarDem, destination  # noqa: E402

PPD = 512
M_PER_DEG = math.pi * R_M / 180.0


def cyl(fn, half=1.0, lat_c=0.0, lon_c=10.0):
    n = int(2 * half * PPD)
    lat_top, lon_w = lat_c + half, lon_c - half
    lat = lat_top - (np.arange(n) + 0.5) / PPD
    lon = lon_w + (np.arange(n) + 0.5) / PPD
    LON, LAT = np.meshgrid(lon, lat)
    return CylDem(np.round(fn(LAT, LON) / 0.5).astype(np.int16), lat_top, lon_w, PPD, 0.5)


def test_feature_east_and_north_pixels():
    # ridge 4 km east (col 128+50) and ridge 2 km north (row 128-25)
    e_lon = 10.0 + 4000 / M_PER_DEG
    n_lat = 2000 / M_PER_DEG
    dem = cyl(lambda la, lo: np.where(np.abs(lo - e_lon) < 0.002, 400.0, 0.0)
              + np.where(np.abs(la - n_lat) < 0.002, 200.0, 0.0))
    h = terrain.enu_grid(dem, 0.0, 10.0)
    assert h.shape == (256, 256)
    assert abs(int(np.argmax(h[128 + 40])) - (128 + 50)) <= 1     # south of the north ridge: only the east ridge
    assert abs(int(np.argmax(h[:, 128 - 40])) - (128 - 25)) <= 1  # west of the east ridge: only the north ridge
    assert h[128, 128] == pytest.approx(0.0, abs=1.0)


def test_encode_decode_roundtrip():
    rng = np.random.default_rng(1)
    h = rng.uniform(-4200, 1900, (256, 256))
    v, lo, hi = terrain.encode(h)
    assert v.dtype == np.uint16
    assert np.max(np.abs(terrain.decode(v, lo, hi) - h)) <= (hi - lo) / 65535 / 2 + 1e-9


def test_polar_east_is_not_grid_right():
    # feature placed geographically east of a polar site must land in the east column whatever the grid axes are
    n_full = 8000
    arr = np.zeros((n_full, n_full), dtype=np.int16)
    dem = PolarDem(arr, n_full, 0, 0, 40.0)
    lat0, lon0 = -85.0, 30.0
    la_e, lo_e = destination(lat0, lon0, np.array([[90.0]]), np.array([[4000.0]]))
    x, y = dem.to_xy(la_e.ravel(), lo_e.ravel())
    r, c = dem.xy_to_rowcol(x, y)
    arr[int(r[0]) - 3:int(r[0]) + 4, int(c[0]) - 3:int(c[0]) + 4] = 2000
    h = terrain.enu_grid(dem, lat0, lon0)
    r_pk, c_pk = np.unravel_index(np.argmax(h), h.shape)
    assert abs(c_pk - (128 + 50)) <= 2 and abs(r_pk - 128) <= 2
