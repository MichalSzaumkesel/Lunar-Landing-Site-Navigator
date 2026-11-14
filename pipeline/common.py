"""Shared helpers for every pipeline step: contract constants, meta block, compact JSON writer."""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

CONTRACT_VERSION = "1.1.1"
REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "web" / "public" / "data"      # real data (scope A); mock/ belongs to scope B
RAW_DIR = REPO_ROOT / "data" / "raw"                  # git-ignored downloads and API caches

MOON_RADIUS_KM = 1737.4
SUN_ANG_RADIUS_DEG = 0.2666
EARTH_ANG_RADIUS_DEG = 0.95
DEMO_SITE_IDS = ("apollo_11", "southpole_landed", "artemis_region_1")
EPHEM_START_UTC = "2026-12-01T00:00:00Z"
EPHEM_END_UTC = "2028-12-31T23:00:00Z"
# Moon sphere polar stereographic (CLAUDE.md, physics notes). Never an Earth EPSG code.
MOON_SOUTH_POLAR_STEREO = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def git_short_sha() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT, capture_output=True,
                              text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def make_meta(generator_file: str, inputs: list[dict], *, synthetic: bool = False,
              approximate: bool = False) -> dict:
    """Contract §1 meta block. generator_file is e.g. 'pipeline/horizon.py'."""
    return {
        "contract_version": CONTRACT_VERSION,
        "generated_utc": utc_now_iso(),
        "generator": f"{generator_file}@{git_short_sha()}",
        "synthetic": synthetic,
        "approximate": approximate,
        "inputs": inputs,
    }


def round_floats(obj, ndigits: int = 3):
    """Recursively round floats (contract: 3 decimals in files)."""
    if isinstance(obj, float):
        r = round(obj, ndigits)
        return 0.0 if r == 0 else r          # no "-0.0"
    if isinstance(obj, dict):
        return {k: round_floats(v, ndigits) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [round_floats(v, ndigits) for v in obj]
    return obj


# Keys whose values the contract itself shows with more than 3 decimals (§2.3 example: 0.2666).
KEEP_PRECISION_KEYS = ("sun_ang_radius_deg", "earth_ang_radius_deg")


def write_json(path: Path, doc: dict) -> Path:
    """Write compact JSON with floats rounded to 3 decimals (except KEEP_PRECISION_KEYS)."""
    kept = {k: doc[k] for k in KEEP_PRECISION_KEYS if k in doc}
    out = round_floats(doc)
    out.update(kept)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    return path
