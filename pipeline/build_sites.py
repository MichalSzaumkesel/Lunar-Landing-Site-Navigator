"""A3/A8: build web/public/data/sites.json from sourced rows (contract §2.1).

Input: pipeline/sites_input.json (rows with source URLs; rule 1) and pipeline/site_heights.json (site ground height
in metres from the LOLA DEM, written by horizon.py). Output: web/public/data/sites.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

HERE = Path(__file__).resolve().parent


def main() -> None:
    rows = json.loads((HERE / "sites_input.json").read_text())["sites"]
    hp = HERE / "site_heights.json"
    heights = json.loads(hp.read_text()) if hp.exists() else {}
    for r in rows:
        if not r.get("source", {}).get("url"):
            raise SystemExit(f"{r['id']}: no source url (rule 1)")
        h = heights.get(r["id"])
        r["elevation_m"] = round(h["height_m"], 1) if h else None
        if h and "slope_deg" in h:                      # pipeline/slope.py; insert right after elevation_m
            items = list(r.items())
            k = [key for key, _ in items].index("elevation_m") + 1
            r.clear()
            r.update(items[:k] + [("slope_deg", h["slope_deg"])] + [(a, b) for a, b in items[k:] if a != "slope_deg"])
        if h is None:
            print(f"WARNING: {r['id']}: no DEM height yet, elevation_m = null")
    doc = {
        "meta": common.make_meta("pipeline/build_sites.py", [
            {"name": "Site rows with primary sources (see each site.source)", "url": "https://lroc.im-ldi.com/",
             "notes": "Rows from pipeline/sites_input.json. Coordinates planetocentric, east-positive, from LROC pages (exact URL in each site.source)."},
            {"name": "elevation_m = LOLA DEM ground height at the site (rel. R=1737.4 km)",
             "url": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/",
             "notes": "from pipeline/site_heights.json (written by pipeline/horizon.py)"},
            {"name": "slope_deg = Horn 3x3 slope at the site, same LOLA DEM as the horizon, window = 3 DEM pixels",
             "url": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/",
             "notes": "pipeline/slope.py; spacing = horizon/<id>.json dem.resolution_m (20-118 m), so values are "
                      "not comparable at lander-footprint scale. See docs/method.md."}]),
        "sites": rows,
    }
    out = common.DATA_DIR / "sites.json"
    common.write_json(out, doc)
    print("wrote", out, len(rows), "sites")


if __name__ == "__main__":
    main()
