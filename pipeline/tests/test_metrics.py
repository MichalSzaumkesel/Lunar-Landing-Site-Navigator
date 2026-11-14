"""metrics.py against the hand-derived fixtures (contract §4) plus a few unit checks."""

import json
import math
from pathlib import Path

import pytest

import metrics

FIXTURES = Path(__file__).resolve().parents[2] / "validation" / "fixtures" / "metrics_cases.json"
DOC = json.loads(FIXTURES.read_text(encoding="utf-8"))
TOL = DOC["tolerance_abs"]


def test_fixture_file_shape():
    assert DOC["meta"]["contract_version"] == "1.1.1"
    assert len(DOC["cases"]) >= 8
    for case in DOC["cases"]:
        assert case["ephem"]["count"] <= 48
        assert case["derivation"]


@pytest.mark.parametrize("case", DOC["cases"], ids=[c["id"] for c in DOC["cases"]])
def test_fixture_case(case):
    inp = case["input"]
    got = metrics.compute_metrics(case["horizon"], case["ephem"], inp["observer_height_m"],
                                  inp["t0_utc"], inp["t1_utc"], inp["t_ref_utc"])
    exp = case["expected"]
    assert set(got) == set(exp)
    for key, want in exp.items():
        have = got[key]
        if isinstance(want, (int, float)) and not isinstance(want, bool):
            assert have is not None and abs(have - want) <= TOL, f"{key}: got {have}, want {want}"
        else:
            assert have == want, f"{key}: got {have!r}, want {want!r}"


def test_disc_fraction_closed_forms():
    assert metrics.disc_fraction(0.0, 0.2666) == 0.5
    assert metrics.disc_fraction(5.0, 0.2666) == 1.0
    assert metrics.disc_fraction(-5.0, 0.2666) == 0.0
    assert math.isclose(metrics.disc_fraction(0.5, 1.0), 2 / 3 + math.sqrt(3) / (4 * math.pi), abs_tol=1e-12)


def test_horizon_wrap():
    mask = [0.0] * 720
    mask[719], mask[0] = 4.0, 2.0
    assert metrics.horizon_at(mask, 0.5, 359.75) == pytest.approx(3.0)
    assert metrics.horizon_at(mask, 0.5, -0.25) == pytest.approx(3.0)
    assert metrics.horizon_at(mask, 0.5, 360.0) == pytest.approx(2.0)


def test_time_format_requires_z():
    with pytest.raises(ValueError):
        metrics.parse_utc("2027-01-01T00:00:00")
    assert metrics.format_utc(metrics.parse_utc("2027-01-01T00:00:00Z") + 0.5) == "2027-01-01T00:00:01Z"
