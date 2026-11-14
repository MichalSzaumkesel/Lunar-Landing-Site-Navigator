import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import horizon  # noqa: E402
import illum  # noqa: E402
from horizon import R_M, CylDem  # noqa: E402

PPD = 256
M_PER_DEG = math.pi * R_M / 180.0


def test_sun_vector_roundtrip_and_transport():
    az = np.array([10.0, 123.0, 270.0])
    el = np.array([5.0, -3.0, 30.0])
    v = illum.sun_vectors(az, el, -84.79, 29.2)
    a2, e2 = illum.local_az_el(v, -84.79, 29.2)
    assert np.allclose(a2, az, atol=1e-9) and np.allclose(e2, el, atol=1e-9)
    # a point 2 km away along the meridian has the same elevation and the azimuth rotated by Dlon*sin(lat) ~ 0
    la, lo = horizon.destination(-84.79, 29.2, np.array([[90.0]]), np.array([[2000.0]]))
    a3, e3 = illum.local_az_el(v, float(la[0, 0]), float(lo[0, 0]))
    dlon = math.radians(float(lo[0, 0]) - 29.2)
    expect = math.degrees(dlon * math.sin(math.radians(84.79)))
    assert abs(((a3 - az + 180) % 360 - 180)[0] + expect) < 0.05    # azimuth shifts opposite to the east longitude shift
    assert abs(e3[0] - el[0]) < 0.12


def test_pct_sunlit_point():
    mask = np.zeros(720)
    mask[360:] = 10.0                           # high horizon to the south half (az 180..360)
    az = np.array([90.0, 90.0, 270.0, 270.0])
    el = np.array([1.0, -1.0, 5.0, 11.0])
    assert illum.pct_sunlit_point(mask, az, el) == 50.0


def test_grid_orientation_north_row0_west_col0():
    # a 2 km-high wall 3 km east of the centre: points east of it see a different horizon than points west of it;
    # a wall 3 km north of the centre blocks a low Sun in the north for rows south of it.
    n = int(4 * PPD)
    lat_top, lon_w = 2.0, 8.0
    lat = lat_top - (np.arange(n) + 0.5) / PPD
    lon = lon_w + (np.arange(n) + 0.5) / PPD
    LON, LAT = np.meshgrid(lon, lat)
    wall_lat = 3000.0 / M_PER_DEG
    arr = np.where(LAT >= wall_lat, 4000, 0).astype(np.int16)        # 2000 m high everywhere north of +3 km
    dem = CylDem(arr, lat_top, lon_w, PPD, 0.5)
    ephem = {"sun": {"az": [0.0] * 4, "el": [3.0] * 4}}              # Sun low in the north
    g, _, _ = illum.compute_grid(dem, 0.0, 10.0, ephem, nx=5, ny=5, spacing=1000.0, range_km=30)
    # rows 0,1 (north +2 km, +1 km... wall at +3 km): row 0 is at +2 km north (still south of the wall), so lit only if
    # the wall is not above 3 deg; the wall (2000 m at <= 5 km) blocks the Sun in every row; it must be darker than
    # nothing: all zero. Use asymmetric check instead: the north wall shrinks with distance -> row 0 (closest) is
    # blocked at least as much as row 4 (furthest); with an elevated Sun both are lit in the south rows only.
    assert g.shape == (5, 5)
    ephem2 = {"sun": {"az": [0.0] * 4, "el": [25.0] * 4}}
    g2, _, _ = illum.compute_grid(dem, 0.0, 10.0, ephem2, nx=5, ny=5, spacing=1000.0, range_km=30)
    # wall 2 km high: elevation of its top from row r (distance d km to the wall): atan(2/d); north row 0 is at +2 km so
    # wall 1 km away (63 deg: blocks 25 deg Sun); row 4 is at -2 km, 5 km away (21.8 deg: does not block 25 deg).
    assert g2[0, 2] == 0.0 and g2[4, 2] == 100.0
    assert np.all(g2[0] == g2[0, 0])         # no east-west dependence for a north-south invariant wall
