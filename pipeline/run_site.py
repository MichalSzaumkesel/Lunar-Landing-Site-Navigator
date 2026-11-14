"""Driver: run horizon -> ephem -> terrain -> build_sites for one site (cache-aware; DEM windows and Horizons
responses are reused from $LLSN_RAW_DIR). Rows come from pipeline/sites_input.json.
Usage: run_site.py SITE_ID [SITE_ID ...]"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_sites  # noqa: E402
import common  # noqa: E402
import fetch_dem  # noqa: E402
import fetch_ephem  # noqa: E402
import horizon  # noqa: E402
import terrain  # noqa: E402

HERE = Path(__file__).resolve().parent


def run(site_id: str) -> None:
    rows = {r["id"]: r for r in json.loads((HERE / "sites_input.json").read_text())["sites"]}
    s = rows[site_id]
    lat, lon = s["lat_deg"], s["lon_deg"]
    npy = fetch_dem.ensure_dem(lat, lon, 150 if abs(lat) >= 80 else 100)
    dem, side = terrain.load_dem(npy)
    doc = horizon.build_horizon(site_id, lat, lon, dem, side["product"], side["url"])
    h0 = horizon.write_horizon(doc, common.DATA_DIR / "horizon" / f"{site_id}.json")
    hp = HERE / "site_heights.json"
    heights = json.loads(hp.read_text()) if hp.exists() else {}
    heights[site_id] = {"height_m": round(h0, 1), "dem": side["product"]}
    hp.write_text(json.dumps(heights, indent=1))
    eph = fetch_ephem.build_ephem(
        site_id, lat, lon, round(h0 / 1000.0, 3),
        f"Site height {h0 / 1000:.3f} km = {side['product']} ground height at the site (rel. R=1737.4 km).")
    common.write_json(common.DATA_DIR / "ephem" / f"{site_id}.json", eph)
    t = terrain.build_terrain(site_id, lat, lon, dem, side["product"], side["url"], common.DATA_DIR)
    print(f"{site_id}: h0 {h0:.1f} m; terrain {t['height_min_m']:.0f}..{t['height_max_m']:.0f} m")


if __name__ == "__main__":
    ids = sys.argv[1:]
    if not ids:
        raise SystemExit(__doc__)
    for i in ids:
        run(i)
    build_sites.main()
