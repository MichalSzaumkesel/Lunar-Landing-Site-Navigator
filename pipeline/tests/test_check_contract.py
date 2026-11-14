"""check_contract.py: a valid minimal file passes; each broken variant is caught."""

import json
from pathlib import Path

import pytest

import check_contract as cc
from common import CONTRACT_VERSION, write_json


def meta(synthetic=False):
    return {"contract_version": CONTRACT_VERSION, "generated_utc": "2026-11-14T10:00:00Z",
            "generator": "pipeline/test@abc1234", "synthetic": synthetic, "approximate": False,
            "inputs": [{"name": "LOLA test", "url": "https://example.org/x", "notes": ""}]}


def horizon_doc(site="apollo_11"):
    return {"meta": meta(), "site_id": site, "az_step_deg": 0.5, "n": 720, "observer_heights_m": [2, 10],
            "masks": {"2": [0.5] * 720, "10": [0.25] * 720},
            "dem": {"product": "LOLA X", "resolution_m": 118, "url": "https://example.org/dem", "max_range_km": 100},
            "uncertainty_deg": 0.05}


def ephem_doc(site="apollo_11", count=18288):
    return {"meta": meta(), "site_id": site, "start_utc": "2026-12-01T00:00:00Z", "step_minutes": 60,
            "count": count, "sun": {"az": [10.0] * count, "el": [5.0] * count},
            "earth": {"az": [200.0] * count, "el": [40.0] * count},
            "sun_ang_radius_deg": 0.2666, "earth_ang_radius_deg": 0.95,
            "horizons_query": {"CENTER": "'coord@301'"}}


def sites_doc():
    return {"meta": meta(), "sites": [{
        "id": "apollo_11", "name": "Apollo 11", "category": "apollo", "mission": "Apollo 11", "agency": "NASA",
        "country": "USA", "lat_deg": 0.674, "lon_deg": 23.473, "elevation_m": -1900.0,
        "landing_date_utc": "1969-07-20T20:17:40Z", "status": "landed", "region_radius_km": None,
        "source": {"title": "t", "url": "https://example.org/s"}, "notes": ""}]}


def write(tmp_path: Path, rel: str, doc: dict, pretty=False) -> Path:
    p = tmp_path / rel
    if pretty:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(doc, indent=2))
    else:
        write_json(p, doc)
    return p


def errors(path):
    return [i.msg for i in cc.check_file(path) if i.level == "ERROR"]


def test_valid_files_pass(tmp_path):
    assert errors(write(tmp_path, "horizon/apollo_11.json", horizon_doc())) == []
    assert errors(write(tmp_path, "ephem/apollo_11.json", ephem_doc())) == []
    assert errors(write(tmp_path, "sites.json", sites_doc())) == []


@pytest.mark.parametrize("mutate,needle", [
    (lambda d: d["masks"]["2"].pop(), "length 719"),
    (lambda d: d["masks"].pop("10"), "masks keys"),
    (lambda d: d["meta"].pop("inputs"), "missing 'inputs'"),
    (lambda d: d["meta"].update(contract_version="1.0.0"), "contract_version"),
    (lambda d: d.update(site_id="shackleton"), "does not match file name"),
    (lambda d: d["masks"]["2"].__setitem__(5, 0.12345), "more than 3 decimals"),
])
def test_horizon_errors(tmp_path, mutate, needle):
    d = horizon_doc()
    mutate(d)
    p = tmp_path / "horizon" / "apollo_11.json"
    p.parent.mkdir(parents=True)
    p.write_text(json.dumps(d, separators=(",", ":")))
    assert any(needle in m for m in errors(p)), errors(p)


def test_ephem_ranges_and_lengths(tmp_path):
    d = ephem_doc(count=10)
    d["sun"]["az"][3] = 360.0
    d["earth"]["el"] = d["earth"]["el"][:9]
    d["start_utc"] = "2026-12-01T00:00:00"
    p = tmp_path / "ephem" / "apollo_11.json"
    p.parent.mkdir(parents=True)
    p.write_text(json.dumps(d, separators=(",", ":")))
    msgs = errors(p)
    assert any("sun.az" in m for m in msgs)
    assert any("earth.el: length 9" in m for m in msgs)
    assert any("'Z'" in m for m in msgs)


def test_pretty_json_rejected(tmp_path):
    assert any("not compact" in m for m in errors(write(tmp_path, "horizon/apollo_11.json", horizon_doc(), pretty=True)))


def test_sites_rules(tmp_path):
    d = sites_doc()
    s = d["sites"][0]
    s["lon_deg"] = 200.0
    s["category"] = "rover"
    s["source"]["url"] = ""
    msgs = errors(write(tmp_path, "sites.json", d))
    assert any("lon_deg" in m for m in msgs)
    assert any("category" in m for m in msgs)
    assert any("source.url" in m for m in msgs)


def test_mock_must_be_synthetic(tmp_path):
    d = horizon_doc()
    assert any("synthetic" in m for m in errors(write(tmp_path, "mock/horizon/apollo_11.json", d)))


def test_terrain_bin_size(tmp_path):
    d = {"meta": meta(), "site_id": "apollo_11", "size_px": 4, "spacing_m": 80, "frame": "local_tangent_enu",
         "origin": "site", "encoding": "uint16-le", "bin": "terrain/apollo_11.bin", "height_min_m": -10.0,
         "height_max_m": 10.0, "site_height_m": 0.0,
         "dem": {"product": "LOLA X", "resolution_m": 20, "url": "https://example.org/dem"}}
    p = write(tmp_path, "terrain/apollo_11.json", d)
    (tmp_path / "terrain" / "apollo_11.bin").write_bytes(b"\0" * 32)
    assert errors(p) == []
    (tmp_path / "terrain" / "apollo_11.bin").write_bytes(b"\0" * 30)
    assert any("bin size" in m for m in errors(p))
