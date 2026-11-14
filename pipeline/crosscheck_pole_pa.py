"""Independent cross-check of earth_orientation.json `pole_pa_deg` (Horizons QUANTITY 17, NP.ang).

Finding: for an observer on the Moon, NP.ang is measured from the direction of the OBSERVER BODY's (Moon's) north pole
(its rotation axis), not from Earth's celestial north. This script proves it with Horizons data only:
  1. VECTORS of the Earth and the Sun from the Moon centre (500@301) in two frames: ICRF equatorial (REF_PLANE FRAME) and
     the Moon's body-equator frame (REF_PLANE 'BODY EQUATOR', whose z axis is the Moon's pole). Two non-parallel
     vectors known in both frames fix the rotation between them, hence the Moon pole in ICRF.
  2. Earth's pole is taken as the ICRF z axis (true-of-date pole differs by < 0.2 deg of precession/nutation in 2026-28).
  3. PA of the projected Earth pole, measured from the projected Moon pole toward east (counter-clockwise on the sky),
     compared with NP.ang from the same Horizons service (also fetched here, 3-day samples).
Run: python pipeline/crosscheck_pole_pa.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_ephem  # noqa: E402

START, STOP, STEP = "2026-12-01 00:00", "2027-01-30 00:00", "3d"


def params(cmd: str, kind: str, plane: str | None = None) -> dict:
    p = {"format": "json", "COMMAND": f"'{cmd}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "CENTER": "'500@301'",
         "START_TIME": f"'{START}'", "STOP_TIME": f"'{STOP}'", "STEP_SIZE": f"'{STEP}'", "CSV_FORMAT": "'YES'"}
    if kind == "np":
        p.update({"EPHEM_TYPE": "'OBSERVER'", "QUANTITIES": "'17'", "ANG_FORMAT": "'DEG'"})
    else:
        p.update({"EPHEM_TYPE": "'VECTORS'", "VEC_TABLE": "'1'", "VEC_CORR": "'LT'", "OUT_UNITS": "'KM-S'",
                  "REF_PLANE": f"'{plane}'", "REF_SYSTEM": "'ICRF'"})
    return p


def rows(p: dict, ncols: int) -> np.ndarray:
    res = fetch_ephem.fetch_raw(p)["result"].splitlines()
    i0 = next(i for i, l in enumerate(res) if l.strip() == "$$SOE")
    i1 = next(i for i, l in enumerate(res) if l.strip() == "$$EOE")
    out = []
    for l in res[i0 + 1:i1]:
        f = [x.strip() for x in l.split(",")]
        out.append([float(x) for x in f[-ncols - 1:-1]] if p["EPHEM_TYPE"] == "'VECTORS'" else [float(f[3])])
    return np.array(out)


def unit(v):
    return v / np.linalg.norm(v)


def main() -> None:
    ang = rows(params("399", "np"), 1)[:, 0]
    e_icrf = rows(params("399", "v", "FRAME"), 3)
    s_icrf = rows(params("10", "v", "FRAME"), 3)
    e_body = rows(params("399", "v", "BODY EQUATOR"), 3)
    s_body = rows(params("10", "v", "BODY EQUATOR"), 3)
    res = []
    for k in range(len(ang)):
        # rotation body->ICRF from the triad (Earth, Sun) known in both frames (TRIAD method)
        def triad(a, b):
            t1 = unit(a)
            t2 = unit(np.cross(a, b))
            return np.column_stack([t1, t2, np.cross(t1, t2)])
        R = triad(e_icrf[k], s_icrf[k]) @ triad(e_body[k], s_body[k]).T
        moon_pole = R @ np.array([0, 0, 1.0])
        earth_pole = np.array([0, 0, 1.0])
        d = unit(e_icrf[k])
        n = unit(moon_pole - moon_pole.dot(d) * d)
        east = unit(np.cross(moon_pole, d))
        pp = earth_pole - earth_pole.dot(d) * d
        pa = np.degrees(np.arctan2(pp.dot(east), pp.dot(n))) % 360
        res.append(((pa - ang[k] + 180) % 360 - 180))
    res = np.array(res)
    print(f"{len(ang)} samples; NP.ang range {ang.min():.1f}..{ang.max():.1f}")
    print(f"PA from Moon-pole frame vs Horizons NP.ang: max |diff| {abs(res).max():.3f} deg, rms {np.sqrt((res**2).mean()):.3f}")


if __name__ == "__main__":
    main()
