"""Collect validation/results/*.json (not *.detail.json) into web/public/data/validation.json (contract 2.4).

Re-runnable: run it again after adding new checks to validation/results/. Checks are sorted by id.
Keys whose value is null are dropped (the contract checker wants numbers where a key exists).
Uses make_meta/write_json from the shared pipeline/common.py (loaded by path, not modified).

Usage: build_validation_json.py [--results DIR] [--out PATH] [--pipeline-dir DIR]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MAIN_PIPELINE = Path("/home/michal/nasa-space-apps/Lunar-Landing-Site-Navigator/pipeline")


def load_common(pipeline_dir: Path):
    spec = importlib.util.spec_from_file_location("llsn_common", pipeline_dir / "common.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", type=Path, default=REPO / "validation" / "results")
    ap.add_argument("--out", type=Path, default=REPO / "web" / "public" / "data" / "validation.json")
    ap.add_argument("--pipeline-dir", type=Path, default=(REPO / "pipeline") if (REPO / "pipeline" / "common.py").exists() else MAIN_PIPELINE)
    a = ap.parse_args()
    common = load_common(a.pipeline_dir)

    checks = []
    for p in sorted(a.results.glob("*.json")):
        if p.name.endswith(".detail.json"):
            continue
        ch = json.loads(p.read_text())
        checks.append({k: v for k, v in ch.items() if v is not None})
    checks.sort(key=lambda c: c["id"])

    inputs = [
        {"name": "JPL Horizons API (independent TLIST query, QUANTITIES=4)", "url": "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
         "notes": "ephemeris checks: our files vs Horizons with a different query form; not an independent ephemeris model"},
        {"name": "USGS/IAU Gazetteer of Planetary Nomenclature (Shackleton, Shoemaker, de Gerlache centres)", "url": "https://planetarynames.wr.usgs.gov/",
         "notes": "polar orientation check; LDEM_80S_20M cached window"},
        {"name": "PGDA LOLA polar illumination products AVGVISIB_75S_120M_201608 (+_EARTH)", "url": "https://pgda.gsfc.nasa.gov/products/69",
         "notes": "illumination_reference checks; ~18.6 yr average vs our 2 yr; plausibility tolerance 15 pp"},
    ]
    meta = common.make_meta("validation/build_validation_json.py", inputs)
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()
        meta["generator"] = f"validation/build_validation_json.py@{sha}"
    except (OSError, subprocess.CalledProcessError):
        pass
    doc = {"meta": meta, "checks": checks}
    common.write_json(a.out, doc)
    print(f"wrote {a.out} ({len(checks)} checks, {a.out.stat().st_size} bytes); failing: {[c['id'] for c in checks if not c['pass']]}")


if __name__ == "__main__":
    main()
