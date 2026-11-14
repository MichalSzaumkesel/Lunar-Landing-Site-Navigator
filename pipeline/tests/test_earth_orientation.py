import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import check_contract  # noqa: E402
import common  # noqa: E402
import fetch_earth_orientation as feo  # noqa: E402


def doc(n=4, **over):
    d = {
        "meta": common.make_meta("pipeline/fetch_earth_orientation.py",
                                 [{"name": "x", "url": "https://ssd-api.jpl.nasa.gov/doc/horizons.html", "notes": ""}]),
        "start_utc": "2026-12-01T00:00:00Z", "step_minutes": 60, "count": n,
        "sub_lunar_lat_deg": [8.5, 8.3, 8.0, 7.8][:n],
        "sub_lunar_lon_deg": [87.1, 72.6, 58.0, 43.5][:n],
        "pole_pa_deg": [19.98, 20.07, 20.16, 20.24][:n],
    }
    d.update(over)
    return d


def run(tmp_path, d):
    p = tmp_path / "earth_orientation.json"
    common.write_json(p, d)
    return [i for i in check_contract.check_file(p) if i.level == "ERROR"]


def test_valid(tmp_path):
    assert run(tmp_path, doc()) == []


def test_bad_lon_lat_pa_and_length(tmp_path):
    assert run(tmp_path, doc(sub_lunar_lon_deg=[200.0, 1, 2, 3]))
    assert run(tmp_path, doc(sub_lunar_lat_deg=[91.0, 1, 2, 3]))
    assert run(tmp_path, doc(pole_pa_deg=[360.0, 1, 2, 3]))
    assert run(tmp_path, doc(sub_lunar_lat_deg=[1.0, 2.0]))


def test_parse_and_wrap():
    text = "x\n$$SOE\n 2026-Dec-01 00:00, , ,  87.138733,   8.563936,   19.9863, 3443.712,\n$$EOE\n"
    lon, lat, pa, t = feo.parse(text)
    assert (lon, lat, pa) == ([87.138733], [8.563936], [19.9863]) and t == ["2026-Dec-01 00:00"]
    assert feo.wrap180(190.0) == -170.0 and feo.wrap180(-190.0) == 170.0 and feo.wrap180(180.0) == 180.0
