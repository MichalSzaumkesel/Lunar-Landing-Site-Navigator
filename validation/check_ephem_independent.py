"""Independent check of ephem/<site_id>.json against JPL Horizons (contract 2.3 / 2.4).

Independence from pipeline/fetch_ephem.py:
  * Different request form: discrete times via TLIST (Julian Dates, TLIST_TYPE='JD') instead of
    START_TIME/STOP_TIME/STEP_SIZE; CAL_FORMAT='BOTH', TIME_DIGITS='SECONDS', one target per request.
  * Sample times are picked here (seeded random), not taken from a request.
  * Site lat/lon come from sites.json (or --lat/--lon), not from the ephem file; a mismatch with the
    SITE_COORD recorded in the ephem file's horizons_query is reported as a failure.
  * The calendar time Horizons echoes back is compared with the intended sample time (checks the time mapping).

Requests are strictly sequential, time.sleep(1.0) after each live request. Raw responses are cached in
$LLSN_RAW_DIR/horizons_validation/ and never re-fetched when present.

Usage:
  check_ephem_independent.py EPHEM_JSON [--sites SITES_JSON] [--lat L --lon L --alt-km 0]
                             [--n 50] [--seed 20261114] [--threshold 0.05] [--out-dir validation/results]
Output: <out-dir>/ephem_independent_<site_id>.json  (contract 2.4 check object)
        <out-dir>/ephem_independent_<site_id>.detail.json (per-sample numbers)
Exit code 0 = pass, 1 = fail, 2 = error.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
TARGETS = {"sun": "10", "earth": "399"}
JD_UNIX_EPOCH = 2440587.5
REPO = Path(__file__).resolve().parent.parent
RAW_DIR = Path(os.environ.get("LLSN_RAW_DIR") or REPO / "data" / "raw") / "horizons_validation"


def parse_utc(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def to_jd(dt: datetime) -> float:
    return dt.timestamp() / 86400.0 + JD_UNIX_EPOCH


def wrap180(x: float) -> float:
    return (x + 180.0) % 360.0 - 180.0


def cache_file(params: dict) -> Path:
    key = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    return RAW_DIR / f"{key}.json"


def fetch(params: dict) -> dict:
    p = cache_file(params)
    if p.exists():
        return json.loads(p.read_text())
    r = requests.get(API, params=params, timeout=120)
    r.raise_for_status()
    data = r.json()
    if "result" not in data:
        raise RuntimeError(f"Horizons error: {str(data)[:300]}")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"params": params, "fetched_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **data}))
    time.sleep(1.0)
    return data


def build_params(command: str, lon: float, lat: float, alt_km: float, jds: list[float]) -> dict:
    return {
        "format": "json",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon:.6f},{lat:.6f},{alt_km:.6f}'",
        "TLIST": " ".join(f"'{jd:.6f}'" for jd in jds),
        "TLIST_TYPE": "'JD'",
        "QUANTITIES": "'4'",
        "CAL_FORMAT": "'BOTH'",
        "TIME_DIGITS": "'SECONDS'",
        "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'",
        "CSV_FORMAT": "'YES'",
    }


def parse_rows(result: str) -> list[dict]:
    """Return [{'cal': str, 'jd': float, 'az': float, 'el': float}] using the CSV header to locate columns."""
    lines = result.splitlines()
    try:
        i0 = next(i for i, l in enumerate(lines) if l.strip() == "$$SOE")
        i1 = next(i for i, l in enumerate(lines) if l.strip() == "$$EOE")
    except StopIteration:
        raise RuntimeError("no $$SOE/$$EOE in response:\n" + result[:600])
    header = None
    for l in reversed(lines[:i0]):
        if "Azi" in l and "Elev" in l:
            header = [h.strip() for h in l.split(",")]
            break
    if header is None:
        raise RuntimeError("no Azi/Elev header in response:\n" + result[:600])
    ia = next(i for i, h in enumerate(header) if h.startswith("Azi"))
    ie = next(i for i, h in enumerate(header) if h.startswith("Elev"))
    ij = next((i for i, h in enumerate(header) if "JD" in h), 1)
    rows = []
    for l in lines[i0 + 1:i1]:
        f = [x.strip() for x in l.split(",")]
        rows.append({"cal": f[0], "jd": float(f[ij]), "az": float(f[ia]) % 360.0, "el": float(f[ie])})
    return rows


def cal_to_dt(s: str) -> datetime:
    for fmt in ("%Y-%b-%d %H:%M:%S.%f", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d %H:%M"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    raise ValueError(f"unparsed calendar time {s!r}")


def lookup_site(sites_path: Path, site_id: str) -> tuple[float, float]:
    for s in json.loads(sites_path.read_text())["sites"]:
        if s["id"] == site_id:
            return s["lat_deg"], s["lon_deg"]
    raise SystemExit(f"site {site_id} not in {sites_path}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ephem")
    ap.add_argument("--sites", type=Path, default=REPO / "web/public/data/sites.json")
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--alt-km", type=float, default=0.0)
    ap.add_argument("--n", type=int, default=50)
    ap.add_argument("--seed", type=int, default=20261114)
    ap.add_argument("--threshold", type=float, default=0.05)
    ap.add_argument("--out-dir", type=Path, default=REPO / "validation/results")
    a = ap.parse_args()

    eph = json.loads(Path(a.ephem).read_text())
    sid = eph["site_id"]
    start = parse_utc(eph["start_utc"])
    step = eph["step_minutes"]
    count = eph["count"]
    notes = []
    synthetic = bool(eph.get("meta", {}).get("synthetic"))
    if synthetic:
        notes.append("EPHEM FILE IS SYNTHETIC (meta.synthetic=true): failure expected, code-path test only.")

    if a.lat is not None and a.lon is not None:
        lat, lon = a.lat, a.lon
    else:
        lat, lon = lookup_site(a.sites, sid)

    ok_site = True
    sc = eph.get("horizons_query", {}).get("SITE_COORD")
    if sc:
        try:
            elon, elat = [float(x) for x in sc.strip("'").split(",")[:2]]
            if abs(elon - lon) > 5.1e-4 or abs(elat - lat) > 5.1e-4:  # sites.json is rounded to 3 decimals
                ok_site = False
                notes.append(f"SITE MISMATCH: ephem used lon/lat {elon},{elat}; sites.json {lon},{lat}.")
            elif abs(elon - lon) > 1e-9 or abs(elat - lat) > 1e-9:
                notes.append(f"site coordinates differ only by sites.json rounding (<= 0.0005 deg, about 15 m): ephem {elon},{elat} vs {lon},{lat}.")
        except ValueError:
            notes.append(f"could not parse SITE_COORD {sc!r}")

    rng = random.Random(a.seed)
    ks = sorted(rng.sample(range(count), min(a.n, count)))
    times = [start + timedelta(minutes=step * k) for k in ks]
    jds = [to_jd(t) for t in times]

    per_body = {}
    detail = {"site_id": sid, "seed": a.seed, "lat_deg": lat, "lon_deg": lon, "samples": []}
    time_ok = True
    for body, cmd in TARGETS.items():
        params = build_params(cmd, lon, lat, a.alt_km, jds)
        data = fetch(params)
        rows = parse_rows(data["result"])
        if len(rows) != len(ks):
            raise RuntimeError(f"{body}: got {len(rows)} rows for {len(ks)} requested times")
        d_az, d_el, d_azc = [], [], []
        for k, t, row in zip(ks, times, rows):
            if abs((cal_to_dt(row["cal"]) - t).total_seconds()) > 1.0:
                time_ok = False
                notes.append(f"{body}: Horizons time {row['cal']} != requested {t.isoformat()}")
            az0, el0 = eph[body]["az"][k], eph[body]["el"][k]
            daz = abs(wrap180(az0 - row["az"]))
            del_ = abs(el0 - row["el"])
            d_az.append(daz)
            d_el.append(del_)
            d_azc.append(daz * math.cos(math.radians(row["el"])))
            detail["samples"].append({"body": body, "k": k, "t": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                      "file_az": az0, "file_el": el0, "hz_az": row["az"], "hz_el": row["el"]})
        per_body[body] = {"max_daz": max(d_az), "max_daz_cos_el": max(d_azc), "max_del": max(d_el)}

    max_del = max(b["max_del"] for b in per_body.values())
    max_azc = max(b["max_daz_cos_el"] for b in per_body.values())
    max_daz = max(b["max_daz"] for b in per_body.values())
    err = max(max_del, max_azc)
    passed = bool(err <= a.threshold and ok_site and time_ok)
    notes.insert(0, f"max|d_el|={max_del:.5f} deg; max|d_az|={max_daz:.5f} deg raw, {max_azc:.5f} deg weighted by cos(el); "
                    f"error = max(d_el, d_az*cos el); sun {per_body['sun']['max_del']:.5f}/{per_body['sun']['max_daz_cos_el']:.5f}, "
                    f"earth {per_body['earth']['max_del']:.5f}/{per_body['earth']['max_daz_cos_el']:.5f} (el/az*cos el); "
                    f"independent form: TLIST JD, seed {a.seed}, {len(ks)} times x 2 bodies; wrap-aware azimuth.")
    check_id = f"ephem_independent_{sid}"
    check = {"id": check_id, "kind": "ephemeris", "site_id": sid, "max_abs_error_deg": round(err, 6),
             "n_samples": len(ks), "pass": passed, "threshold_deg": a.threshold, "notes": " ".join(notes)}
    a.out_dir.mkdir(parents=True, exist_ok=True)
    (a.out_dir / f"{check_id}.json").write_text(json.dumps(check, indent=2) + "\n")
    detail["per_body"] = per_body
    (a.out_dir / f"{check_id}.detail.json").write_text(json.dumps(detail, indent=1) + "\n")
    print(json.dumps(check, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        print("ERROR:", e, file=sys.stderr)
        sys.exit(2)
