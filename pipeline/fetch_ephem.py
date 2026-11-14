"""A4: fetch Sun (10) and Earth (399) apparent az/el for a Moon site from JPL Horizons -> ephem/<id>.json (contract §2.3).

API: https://ssd.jpl.nasa.gov/api/horizons.api  (docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html)
Conventions verified against the Horizons output header/legend:
  * SITE_COORD with COORD_TYPE='GEODETIC' is 'E-lon(deg),Lat(deg),Alt(km)' (header: {E-lon(deg),Lat(deg),Alt(km)};
    Moon body frame MEAN_ME, "East-longitude positive") -> same as our contract (east-positive, -180..180).
  * QUANTITIES='4' = airless apparent azimuth/elevation of the target centre; azimuth clockwise from north
    (N=0,E=90,S=180,W=270); elevation w.r.t. a plane perpendicular to the local zenith of the reference surface
    (1737.4 km sphere) -> identical to the contract; we only normalise az to [0,360).
Requests are strictly sequential (1 s apart); raw responses are cached in $LLSN_RAW_DIR/horizons/.
Usage: fetch_ephem.py SITE_ID --lat LAT --lon LON [--alt-km 0] [--out PATH]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
START = "2026-12-01 00:00"
STOP = "2028-12-31 23:00"
EXPECTED_COUNT = 18288  # 762 days * 24
TARGETS = {"sun": "10", "earth": "399"}


def build_params(command: str, lon: float, lat: float, alt_km: float) -> dict:
    return {
        "format": "json",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon:.6f},{lat:.6f},{alt_km:.6f}'",
        "START_TIME": f"'{START}'",
        "STOP_TIME": f"'{STOP}'",
        "STEP_SIZE": "'1h'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
    }


def cache_path(params: dict) -> Path:
    key = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    return common.RAW_DIR / "horizons" / f"{key}.json"


def fetch_raw(params: dict) -> dict:
    """Return the Horizons JSON response; cached on disk, never re-fetched when present."""
    p = cache_path(params)
    if p.exists():
        return json.loads(p.read_text())
    r = requests.get(API, params=params, timeout=300)
    r.raise_for_status()
    data = r.json()
    if "result" not in data:
        raise RuntimeError(f"Horizons error: {data}")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"params": params, "fetched_utc": common.utc_now_iso(), **data}))
    time.sleep(1.0)
    return data


def parse_az_el(result: str) -> tuple[list[float], list[float], list[str]]:
    lines = result.splitlines()
    try:
        i0 = next(i for i, l in enumerate(lines) if l.strip() == "$$SOE")
        i1 = next(i for i, l in enumerate(lines) if l.strip() == "$$EOE")
    except StopIteration:
        raise RuntimeError("no $$SOE/$$EOE in Horizons response:\n" + result[:500])
    az, el, times = [], [], []
    for l in lines[i0 + 1:i1]:
        f = [x.strip() for x in l.split(",")]
        if len(f) < 5:
            raise RuntimeError(f"bad row: {l!r}")
        times.append(f[0])
        az.append(float(f[3]) % 360.0)
        el.append(float(f[4]))
    return az, el, times


def check_times(times: list[str]) -> None:
    t0 = datetime(2026, 12, 1, tzinfo=timezone.utc)
    for k in (0, len(times) // 2, len(times) - 1):
        want = (t0 + timedelta(hours=k)).strftime("%Y-%b-%d %H:%M")
        if times[k] != want:
            raise RuntimeError(f"time mismatch at {k}: {times[k]} != {want}")


def build_ephem(site_id: str, lat: float, lon: float, alt_km: float = 0.0, alt_note: str = "") -> dict:
    out, queries = {}, {}
    for name, cmd in TARGETS.items():
        params = build_params(cmd, lon, lat, alt_km)
        data = fetch_raw(params)
        az, el, times = parse_az_el(data["result"])
        if len(az) != EXPECTED_COUNT:
            raise RuntimeError(f"{name}: {len(az)} samples, expected {EXPECTED_COUNT}")
        check_times(times)
        out[name] = {"az": az, "el": el}
        queries[name] = {k: v for k, v in params.items() if k != "format"}
    q = queries["sun"]
    return {
        "meta": common.make_meta("pipeline/fetch_ephem.py", [{
            "name": "JPL Horizons API (targets 10 Sun, 399 Earth; observer on Moon 301)",
            "url": "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
            "notes": "Apparent airless az/el (QUANTITIES=4), hourly UTC. Horizons Moon frame MEAN_ME (DE441); "
                     f"E-lon positive, az clockwise from N. {alt_note}".strip(),
        }]),
        "site_id": site_id,
        "start_utc": common.EPHEM_START_UTC,
        "step_minutes": 60,
        "count": EXPECTED_COUNT,
        "sun": out["sun"],
        "earth": out["earth"],
        "sun_ang_radius_deg": common.SUN_ANG_RADIUS_DEG,
        "earth_ang_radius_deg": common.EARTH_ANG_RADIUS_DEG,
        "horizons_query": {
            "CENTER": q["CENTER"], "COORD_TYPE": q["COORD_TYPE"], "SITE_COORD": q["SITE_COORD"],
            "QUANTITIES": q["QUANTITIES"], "STEP_SIZE": q["STEP_SIZE"], "START_TIME": q["START_TIME"],
            "STOP_TIME": q["STOP_TIME"], "COMMAND_sun": queries["sun"]["COMMAND"],
            "COMMAND_earth": queries["earth"]["COMMAND"], "CSV_FORMAT": q["CSV_FORMAT"],
            "ANG_FORMAT": q["ANG_FORMAT"], "EPHEM_TYPE": q["EPHEM_TYPE"],
        },
    }


def summary(doc: dict) -> str:
    import numpy as np
    s = []
    for b in ("sun", "earth"):
        el = np.array(doc[b]["el"])
        az = np.array(doc[b]["az"])
        up = el > 0
        trans = int(np.sum(up[1:] != up[:-1]))
        s.append(f"{b}: el [{el.min():.1f},{el.max():.1f}] az [{az.min():.1f},{az.max():.1f}] "
                 f"pct_el>0={100 * up.mean():.1f}% transitions={trans}")
    return "\n".join(s)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("site_id")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--alt-km", type=float, default=0.0)
    ap.add_argument("--alt-note", default="Site height 0 km (reference sphere); not taken from the DEM.")
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    doc = build_ephem(a.site_id, a.lat, a.lon, a.alt_km, a.alt_note)
    out = a.out or common.DATA_DIR / "ephem" / f"{a.site_id}.json"
    common.write_json(out, doc)
    print(summary(doc))
    print("wrote", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
