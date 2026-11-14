"""Optional contract §2.8 (v1.2.0): earth_orientation.json from JPL Horizons.

Query (docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html; legend in the response): target Earth '399', observer at the
Moon's centre CENTER='500@301' (body centre, geocentric-style site code 500 @ body 301), EPHEM_TYPE='OBSERVER',
QUANTITIES='14,17', hourly, same grid as ephem/ (18288 samples), CSV, ANG_FORMAT='DEG'.
  * Quantity 14 'ObsSub-LON, ObsSub-LAT': apparent planetodetic longitude/latitude of the centre of the Earth disc seen
    by the observer = the point on Earth that sees the Moon at the zenith. "Positive longitude is to the EAST for this
    target" (also the header: Target pole/equ ITRF93 {East-longitude positive}). Returned in -180..180 in practice; we
    normalise to -180..180 anyway. Latitude is planetodetic (geodetic on the Earth ellipsoid), not geocentric.
  * Quantity 17 'NP.ang, NP.dist': apparent north-pole position angle, "counter-clockwise with respect to the direction
    of the true-of-date reference-frame north pole" = measured from celestial north toward east on the sky, as the
    contract wants. Normalised to 0..360.
Sequential, cached in $LLSN_RAW_DIR/horizons/ (shared with fetch_ephem).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import fetch_ephem  # noqa: E402

EXPECTED = fetch_ephem.EXPECTED_COUNT


def build_params() -> dict:
    return {
        "format": "json", "COMMAND": "'399'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'500@301'", "START_TIME": f"'{fetch_ephem.START}'", "STOP_TIME": f"'{fetch_ephem.STOP}'",
        "STEP_SIZE": "'1h'", "QUANTITIES": "'14,17'", "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'",
    }


def parse(result: str):
    lines = result.splitlines()
    i0 = next(i for i, l in enumerate(lines) if l.strip() == "$$SOE")
    i1 = next(i for i, l in enumerate(lines) if l.strip() == "$$EOE")
    lon, lat, pa, times = [], [], [], []
    for l in lines[i0 + 1:i1]:
        f = [x.strip() for x in l.split(",")]
        times.append(f[0])
        lon.append(float(f[3]))
        lat.append(float(f[4]))
        pa.append(float(f[5]))
    return lon, lat, pa, times


def wrap180(x: float) -> float:
    v = round((x + 180.0) % 360.0 - 180.0, 3)
    return 180.0 if v == -180.0 and x > 0 else v


def build() -> dict:
    params = build_params()
    data = fetch_ephem.fetch_raw(params)
    lon, lat, pa, times = parse(data["result"])
    if len(lon) != EXPECTED:
        raise RuntimeError(f"{len(lon)} samples, expected {EXPECTED}")
    fetch_ephem.check_times(times)
    q = {k: v for k, v in params.items() if k != "format"}
    return {
        "meta": common.make_meta("pipeline/fetch_earth_orientation.py", [{
            "name": "JPL Horizons API: target 399 Earth seen from the Moon centre (500@301), QUANTITIES 14 (ObsSub-LON/LAT) and 17 (NP.ang)",
            "url": "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
            "notes": "Query: " + "; ".join(f"{k}={v}" for k, v in q.items()) +
                     ". ObsSub lon is East-positive (Horizons legend), lat planetodetic; NP.ang is counter-clockwise from "
                     "true-of-date north = east of north; normalised to lon -180..180, pa 0..360."}]),
        "start_utc": common.EPHEM_START_UTC,
        "step_minutes": 60,
        "count": EXPECTED,
        "sub_lunar_lat_deg": lat,
        "sub_lunar_lon_deg": [wrap180(x) for x in lon],
        "pole_pa_deg": [round(x % 360.0, 3) % 360.0 for x in pa],
    }


def main() -> None:
    doc = build()
    out = common.DATA_DIR / "earth_orientation.json"
    common.write_json(out, doc)
    lat = np.array(doc["sub_lunar_lat_deg"])
    lon = np.array(doc["sub_lunar_lon_deg"])
    pa = np.array(doc["pole_pa_deg"])
    # period of the latitude oscillation: dominant FFT frequency of the demeaned series
    f = np.abs(np.fft.rfft(lat - lat.mean()))
    k = int(np.argmax(f[1:])) + 1
    print(f"sub_lunar_lat [{lat.min():.2f}, {lat.max():.2f}] deg, dominant period {len(lat) / k / 24:.1f} days")
    d = np.diff(np.unwrap(np.radians(lon)))
    print(f"sub_lunar_lon range [{lon.min():.1f}, {lon.max():.1f}], mean drift {np.degrees(d.mean()):.3f} deg/h (Earth rotation)")
    print(f"pole_pa range [{pa.min():.1f}, {pa.max():.1f}] deg")
    print("wrote", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
