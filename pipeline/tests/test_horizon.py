"""Synthetic-DEM tests for pipeline/horizon.py (known answers)."""

import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402
import horizon  # noqa: E402
from horizon import R_M, CylDem, PolarDem, compute_masks  # noqa: E402

PPD = 256  # coarse synthetic grid: 118.6 m/px at the equator
M_PER_DEG = math.pi * R_M / 180.0


def make_cyl(fn, lat_c=0.0, lon_c=10.0, half_deg=3.0):
    """Cylindrical DEM whose height (m) at (lat, lon) is fn(lat, lon); DN = h/0.5."""
    n = int(2 * half_deg * PPD)
    lat_top = lat_c + half_deg
    lon_w = lon_c - half_deg
    lat = lat_top - (np.arange(n) + 0.5) / PPD
    lon = lon_w + (np.arange(n) + 0.5) / PPD
    LON, LAT = np.meshgrid(lon, lat)
    arr = np.round(fn(LAT, LON) / 0.5).astype(np.int16)
    return CylDem(arr, lat_top, lon_w, PPD, 0.5)


def test_flat_plane_is_curvature_dip():
    dem = make_cyl(lambda la, lo: np.zeros_like(la))
    masks, h0 = compute_masks(dem, 0.0, 10.0, 100, observer_heights=(2, 10), n_rays=72)
    assert h0 == 0.0
    for h in (2, 10):
        expected = -math.degrees(math.sqrt(2 * h / R_M))
        assert np.allclose(masks[h], expected, atol=0.004), (h, masks[h][:3], expected)


def test_wall_known_angle_east():
    # wall: everything with lon >= 10 + 20 km/M_PER_DEG is 500 m high -> from d = 20 km the angle is
    # atan2(500 - 2 - d^2/2R, d) at the nearest wall point (d = 20 km) due east (az 90).
    lon_wall = 10.0 + 20000.0 / M_PER_DEG
    dem = make_cyl(lambda la, lo: np.where(lo >= lon_wall, 500.0, 0.0))
    masks, _ = compute_masks(dem, 0.0, 10.0, 100, observer_heights=(2,), n_rays=720)
    d = 20000.0
    expected = math.degrees(math.atan2(500.0 - 2 - d * d / (2 * R_M), d))
    m = masks[2]
    assert abs(m[180] - expected) < 0.03            # az 90 deg = index 180 (0.5 deg steps)
    # azimuth convention: north (0), south (180) and west (270) see only the flat dip
    dip = -math.degrees(math.sqrt(2 * 2 / R_M))
    for idx in (0, 360, 540):
        assert abs(m[idx] - dip) < 0.01, (idx, m[idx])
    assert m[180] > 1.0


def test_wall_north_is_azimuth_zero():
    lat_wall = 0.0 + 10000.0 / M_PER_DEG
    dem = make_cyl(lambda la, lo: np.where(la >= lat_wall, 300.0, 0.0))
    masks, _ = compute_masks(dem, 0.0, 10.0, 100, observer_heights=(2,), n_rays=720)
    assert masks[2][0] > 1.0 and masks[2][360] < 0.0 and masks[2][180] < 0.0 and masks[2][540] < 0.0


def test_site_height_is_subtracted():
    dem = make_cyl(lambda la, lo: np.full_like(la, 1234.0))
    masks, h0 = compute_masks(dem, 0.0, 10.0, 50, observer_heights=(2,), n_rays=36)
    assert abs(h0 - 1234.0) < 0.5
    assert np.allclose(masks[2], -math.degrees(math.sqrt(4 / R_M)), atol=0.01)


def test_longitude_wrap_0_360():
    # window straddling lon 0/360: west edge unwrapped at 358
    n = int(6 * PPD)
    lat_top, lon_w = 3.0, 357.0
    lon = (lon_w + (np.arange(n) + 0.5) / PPD) % 360.0
    arr = np.zeros((n, n), dtype=np.int16)
    arr[:, (lon > 0.0) & (lon < 3)] = 1600   # 800 m high plateau east of lon 0.5
    dem = CylDem(arr, lat_top, lon_w, PPD, 0.5)
    # site at lon -1.0 (== 359.0): east of it, plateau starts at lon 0 -> 1 deg away ~ 30 km
    masks, _ = compute_masks(dem, 0.0, -1.0, 60, observer_heights=(2,), n_rays=4)
    assert masks[2][1] > 0.5       # az 90 sees the plateau across the wrap
    assert masks[2][3] < 0.0       # az 270 flat


def test_polar_stereo_roundtrip():
    n_full = 4000
    arr = np.zeros((n_full, n_full), dtype=np.int16)
    dem = PolarDem(arr, n_full, 0, 0, 20.0)
    for lat, lon in [(-89.9, 129.8), (-84.79, 29.19), (-80.0, -170.0), (-85.0, 0.0), (-85.0, 90.0)]:
        x, y = dem.to_xy(np.array([lat]), np.array([lon]))
        rho = math.hypot(x[0], y[0])
        # stereographic on a sphere, k0 = 1 at the pole: rho = 2 R tan((90 - |lat|)/2)
        assert rho == pytest.approx(2 * R_M * math.tan(math.radians(90 + lat) / 2), rel=1e-9)
        # orientation: x = rho sin(lon), y = rho cos(lon) for the south pole with lon_0 = 0
        assert x[0] == pytest.approx(rho * math.sin(math.radians(lon)), abs=1e-6)
        assert y[0] == pytest.approx(rho * math.cos(math.radians(lon)), abs=1e-6)
        row, col = dem.xy_to_rowcol(x, y)
        # invert pixel -> xy -> lat/lon with the inverse transformer
        xx = (col[0] + 0.5 - n_full / 2) * 20.0
        yy = (n_full / 2 - (row[0] + 0.5)) * 20.0
        assert xx == pytest.approx(x[0], abs=1e-6) and yy == pytest.approx(y[0], abs=1e-6)
        lo, la = dem.fwd.transform(x, y, direction="INVERSE")
        assert la[0] == pytest.approx(lat, abs=1e-9)
        assert ((lo[0] - lon + 180) % 360 - 180) == pytest.approx(0.0, abs=1e-9)


def test_polar_flat_and_wall():
    # 400 x 400 km window around the pole at 100 m/px (n_full = 8000 => +-400 km)
    n_full = 8000
    arr = np.zeros((n_full, n_full), dtype=np.int16)
    dem = PolarDem(arr, n_full, 0, 0, 100.0)
    dem.res = 100.0
    lat0, lon0 = -85.0, 30.0
    masks, h0 = compute_masks(dem, lat0, lon0, 150, observer_heights=(10,), n_rays=72)
    assert np.allclose(masks[10], -math.degrees(math.sqrt(20 / R_M)), atol=0.01)
    # now a 1000 m wall in the polar plane: all pixels beyond x_wall (projected). Ground distance from the site toward
    # +x (east at lon 30? use the pole-centred x axis): check that the elevation is consistent with the great-circle d.
    x0, y0 = dem.to_xy(np.array([lat0]), np.array([lon0]))
    xs = (np.arange(n_full) + 0.5 - n_full / 2) * 100.0
    arr2 = np.zeros((n_full, n_full), dtype=np.int16)
    xwall = x0[0] + 20000.0
    arr2[:, xs > xwall] = 2000   # 1000 m
    dem2 = PolarDem(arr2, n_full, 0, 0, 100.0)
    masks2, _ = compute_masks(dem2, lat0, lon0, 150, observer_heights=(10,), n_rays=720)
    # max over rays must correspond to a wall point at ground distance ~ 20 km / k (k = 2/(1+sin|lat|) ~ 1.0038);
    # planar 20 km -> ground ~ 19.92 km -> angle ~ atan(990/19920) = 2.85 deg minus curvature
    d = 20000.0 / (2 / (1 + math.sin(math.radians(85))))
    expected = math.degrees(math.atan2(1000.0 - 10 - d * d / (2 * R_M), d))
    assert masks2[10].max() == pytest.approx(expected, abs=0.15)
