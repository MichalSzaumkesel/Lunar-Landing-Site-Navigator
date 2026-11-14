"""Validate data files against docs/contract.md (contract_version 1.1.1).

Usage (repo root):
    .venv/bin/python pipeline/check_contract.py                  # all of web/public/data (incl. mock/)
    .venv/bin/python pipeline/check_contract.py path/to/file.json path/to/dir ...

The file kind is inferred from its name or parent folder: sites.json, validation.json,
horizon/*.json, ephem/*.json, terrain/*.json (+ .bin), illum/*.json.
Exit code 1 if any ERROR. WARN lines are advisory.

Checks: meta block, conventions (ISO 'Z' times, lat/lon/az/el ranges, snake_case ids),
array lengths, value ranges, compact serialization, <= 3 decimals, file size <= 5 MB.
"""

from __future__ import annotations

import json
import math
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from common import CONTRACT_VERSION, DATA_DIR, EPHEM_END_UTC, EPHEM_START_UTC, KEEP_PRECISION_KEYS

MAX_BYTES = 5 * 1024 * 1024
ISO_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")
SNAKE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")
CATEGORIES = {"apollo", "clps", "commercial", "international", "artemis_region", "custom"}
STATUSES = {"landed", "crashed", "planned", "candidate_region"}
KINDS = ("sites", "validation", "horizon", "ephem", "terrain", "illum", "earth_orientation")


@dataclass
class Issue:
    level: str   # ERROR | WARN
    path: str
    msg: str

    def __str__(self) -> str:
        return f"{self.level:5} {self.path}: {self.msg}"


class Checker:
    def __init__(self, path: Path):
        self.path = path
        self.issues: list[Issue] = []

    def err(self, msg: str) -> None:
        self.issues.append(Issue("ERROR", str(self.path), msg))

    def warn(self, msg: str) -> None:
        self.issues.append(Issue("WARN", str(self.path), msg))

    # -- primitive helpers -------------------------------------------------
    def require(self, obj: dict, key: str, types, where: str):
        if not isinstance(obj, dict) or key not in obj:
            self.err(f"{where}: missing '{key}'")
            return None
        val = obj[key]
        if types is not None and (not isinstance(val, types) or (isinstance(val, bool) and bool not in _tuple(types))):
            self.err(f"{where}.{key}: expected {_tname(types)}, got {type(val).__name__}")
            return None
        return val

    def iso(self, val, where: str, nullable: bool = False) -> bool:
        if val is None and nullable:
            return True
        if not isinstance(val, str) or not ISO_Z.match(val):
            self.err(f"{where}: not ISO 8601 UTC with 'Z': {val!r}")
            return False
        try:
            datetime.fromisoformat(val[:-1] + "+00:00")
        except ValueError:
            self.err(f"{where}: invalid date {val!r}")
            return False
        return True

    def num_range(self, val, lo: float, hi: float, where: str, hi_open: bool = False) -> None:
        if not _is_num(val):
            self.err(f"{where}: expected number, got {val!r}")
        elif val < lo or (val >= hi if hi_open else val > hi):
            self.err(f"{where}: {val} outside [{lo}, {hi}{')' if hi_open else ']'}")

    def num_array(self, arr, n: int | None, lo: float, hi: float, where: str, hi_open: bool = False) -> None:
        if not isinstance(arr, list):
            self.err(f"{where}: expected array")
            return
        if n is not None and len(arr) != n:
            self.err(f"{where}: length {len(arr)} != {n}")
        bad = [(i, v) for i, v in enumerate(arr)
               if not _is_num(v) or v < lo or (v >= hi if hi_open else v > hi)]
        if bad:
            i, v = bad[0]
            self.err(f"{where}: {len(bad)} value(s) not numbers in [{lo}, {hi}{')' if hi_open else ']'}], "
                     f"first at [{i}] = {v!r}")


def _tuple(t):
    return t if isinstance(t, tuple) else (t,)


def _tname(t):
    return " | ".join(x.__name__ for x in _tuple(t))


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


# -- raw text checks -------------------------------------------------------

def check_compact(c: Checker, text: str) -> None:
    """Compact = no whitespace outside strings (json.dump(..., separators=(',', ':')))."""
    in_str = esc = False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch in " \t\r\n":
            if i == len(text) - 1 and ch == "\n":
                continue          # one trailing newline is harmless
            c.err(f"not compact JSON: whitespace at offset {i} (write with separators=(',', ':'))")
            return


def check_decimals(c: Checker, obj, where: str = "$", counter: list | None = None) -> None:
    """Floats rounded to 3 decimals (except constants the contract shows with more)."""
    if counter is None:
        counter = [0, None]
    if isinstance(obj, float):
        if round(obj, 3) != obj:
            counter[0] += 1
            counter[1] = counter[1] or f"{where} = {obj!r}"
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in KEEP_PRECISION_KEYS or k == "meta":
                continue
            check_decimals(c, v, f"{where}.{k}", counter)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            check_decimals(c, v, f"{where}[{i}]", counter)
    if where == "$" and counter[0]:
        c.err(f"{counter[0]} float(s) with more than 3 decimals, first: {counter[1]}")


# -- meta -------------------------------------------------------------------

def check_meta(c: Checker, doc: dict, is_mock: bool) -> dict | None:
    meta = c.require(doc, "meta", dict, "$")
    if meta is None:
        return None
    ver = c.require(meta, "contract_version", str, "meta")
    if ver is not None and ver != CONTRACT_VERSION:
        c.err(f"meta.contract_version {ver!r} != {CONTRACT_VERSION!r}")
    gen = c.require(meta, "generated_utc", str, "meta")
    if gen is not None:
        c.iso(gen, "meta.generated_utc")
    g = c.require(meta, "generator", str, "meta")
    if g is not None and not g.strip():
        c.err("meta.generator is empty")
    syn = c.require(meta, "synthetic", bool, "meta")
    c.require(meta, "approximate", bool, "meta")
    inputs = c.require(meta, "inputs", list, "meta")
    if inputs is not None:
        for i, inp in enumerate(inputs):
            if not isinstance(inp, dict):
                c.err(f"meta.inputs[{i}]: expected object")
                continue
            c.require(inp, "name", str, f"meta.inputs[{i}]")
            url = c.require(inp, "url", str, f"meta.inputs[{i}]")
            if syn is False and url is not None and not url.startswith("http"):
                c.err(f"meta.inputs[{i}].url must be an http(s) URL for real data (rule 8)")
        if syn is False and not inputs:
            c.err("meta.inputs is empty for real data (rule 8: record inputs)")
    if is_mock and syn is not True:
        c.err("file under mock/ must have meta.synthetic = true")
    if not is_mock and syn is True:
        c.warn("synthetic file outside mock/ (the UI will show the synthetic badge)")
    return meta


def check_site_id(c: Checker, doc: dict) -> None:
    sid = c.require(doc, "site_id", str, "$")
    if sid is not None:
        if not SNAKE.match(sid):
            c.err(f"site_id {sid!r} is not snake_case ASCII")
        if sid != c.path.stem:
            c.err(f"site_id {sid!r} does not match file name {c.path.name!r}")


# -- per kind ---------------------------------------------------------------

def check_sites(c: Checker, doc: dict, real: bool) -> None:
    sites = c.require(doc, "sites", list, "$")
    if sites is None:
        return
    seen = set()
    for i, s in enumerate(sites):
        w = f"sites[{i}]"
        if not isinstance(s, dict):
            c.err(f"{w}: expected object")
            continue
        sid = c.require(s, "id", str, w)
        if sid is not None:
            w = f"sites[{sid}]"
            if not SNAKE.match(sid):
                c.err(f"{w}: id is not snake_case ASCII")
            if sid in seen:
                c.err(f"{w}: duplicate id")
            seen.add(sid)
        for key in ("name", "notes"):
            c.require(s, key, str, w)
        # Contract §2.1 does not say whether these may be null (custom / candidate sites have no mission).
        for key in ("mission", "agency", "country"):
            if key not in s:
                c.err(f"{w}: missing '{key}'")
            elif s[key] is not None and not isinstance(s[key], str):
                c.err(f"{w}.{key}: expected string or null")
            elif s[key] is None and real:
                c.warn(f"{w}.{key} is null")
        cat = c.require(s, "category", str, w)
        if cat is not None and cat not in CATEGORIES:
            c.err(f"{w}.category {cat!r} not in {sorted(CATEGORIES)}")
        st = c.require(s, "status", str, w)
        if st is not None and st not in STATUSES:
            c.err(f"{w}.status {st!r} not in {sorted(STATUSES)}")
        lat = c.require(s, "lat_deg", (int, float), w)
        if lat is not None:
            c.num_range(lat, -90, 90, f"{w}.lat_deg")
        lon = c.require(s, "lon_deg", (int, float), w)
        if lon is not None:
            c.num_range(lon, -180, 180, f"{w}.lon_deg")
        if "elevation_m" not in s:
            c.err(f"{w}: missing 'elevation_m' (null allowed)")
        elif s["elevation_m"] is not None and not _is_num(s["elevation_m"]):
            c.err(f"{w}.elevation_m: expected number or null")
        elif real and s["elevation_m"] is None:
            c.warn(f"{w}.elevation_m is null (pipeline should fill it from the DEM)")
        if "landing_date_utc" not in s:
            c.err(f"{w}: missing 'landing_date_utc' (null allowed)")
        else:
            c.iso(s["landing_date_utc"], f"{w}.landing_date_utc", nullable=True)
        if "region_radius_km" not in s:
            c.err(f"{w}: missing 'region_radius_km' (null allowed)")
        else:
            rr = s["region_radius_km"]
            if rr is not None and (not _is_num(rr) or rr <= 0):
                c.err(f"{w}.region_radius_km must be a positive number or null")
            if st == "candidate_region" and rr is None:
                c.warn(f"{w}: candidate_region without region_radius_km")
            if rr is not None and not s.get("notes"):
                c.err(f"{w}: region lat/lon is a representative point and must be described in notes")
        src = c.require(s, "source", dict, w)
        if src is not None:
            c.require(src, "title", str, f"{w}.source")
            url = c.require(src, "url", str, f"{w}.source")
            if real and url is not None and not url.startswith("http"):
                c.err(f"{w}.source.url is mandatory (rule 1)")


def check_ephem(c: Checker, doc: dict, real: bool) -> None:
    check_site_id(c, doc)
    start = c.require(doc, "start_utc", str, "$")
    start_ok = start is not None and c.iso(start, "start_utc")
    step = c.require(doc, "step_minutes", (int, float), "$")
    if step is not None and step <= 0:
        c.err("step_minutes must be > 0")
    count = c.require(doc, "count", int, "$")
    if count is not None and count <= 0:
        c.err("count must be > 0")
    for body in ("sun", "earth"):
        b = c.require(doc, body, dict, "$")
        if b is None:
            continue
        c.num_array(b.get("az"), count, 0, 360, f"{body}.az", hi_open=True)
        c.num_array(b.get("el"), count, -90, 90, f"{body}.el")
    for key, lo, hi in (("sun_ang_radius_deg", 0.2, 0.35), ("earth_ang_radius_deg", 0.8, 1.1)):
        v = c.require(doc, key, (int, float), "$")
        if v is not None:
            c.num_range(v, lo, hi, key)
    hq = doc.get("horizons_query")
    if real and not isinstance(hq, dict):
        c.err("horizons_query (exact Horizons request) is required for real data")
    elif hq is not None and not (isinstance(hq, dict) and all(isinstance(v, str) for v in hq.values())):
        c.err("horizons_query must be an object of strings")
    if start_ok and _is_num(step) and isinstance(count, int) and count > 0:
        t0 = datetime.fromisoformat(start[:-1] + "+00:00")
        last = t0.timestamp() + (count - 1) * step * 60
        want0 = datetime.fromisoformat(EPHEM_START_UTC[:-1] + "+00:00").timestamp()
        want1 = datetime.fromisoformat(EPHEM_END_UTC[:-1] + "+00:00").timestamp()
        if t0.timestamp() != want0 or last != want1:
            c.warn(f"coverage {start} + {count} x {step} min does not span {EPHEM_START_UTC} .. {EPHEM_END_UTC} "
                   f"(hourly that is {int((want1 - want0) / 3600) + 1} samples)")


def check_horizon(c: Checker, doc: dict, real: bool) -> None:
    check_site_id(c, doc)
    step = c.require(doc, "az_step_deg", (int, float), "$")
    n = c.require(doc, "n", int, "$")
    if step is not None and step != 0.5:
        c.err(f"az_step_deg {step} != 0.5 (720 rays, CLAUDE.md)")
    if n is not None and n != 720:
        c.err(f"n {n} != 720")
    heights = c.require(doc, "observer_heights_m", list, "$")
    masks = c.require(doc, "masks", dict, "$")
    if heights is not None and sorted(heights) != [2, 10]:
        c.err(f"observer_heights_m {heights} != [2, 10]")
    if heights is not None and masks is not None:
        want = {str(h) for h in heights}
        if set(masks) != want:
            c.err(f"masks keys {sorted(masks)} != observer heights {sorted(want)}")
        for key, arr in masks.items():
            c.num_array(arr, n, -90, 90, f"masks[{key!r}]")
    dem = c.require(doc, "dem", dict, "$")
    if dem is not None:
        c.require(dem, "product", str, "dem")
        c.require(dem, "resolution_m", (int, float), "dem")
        url = c.require(dem, "url", str, "dem")
        rng = c.require(dem, "max_range_km", (int, float), "dem")
        if real and url is not None and not url.startswith("http") and not doc.get("meta", {}).get("approximate"):
            c.err("dem.url must be an http(s) URL for real data")
        if real and rng is not None and rng not in (100, 150) and not doc.get("meta", {}).get("approximate"):
            c.warn(f"dem.max_range_km {rng} is not 100 or 150 (CLAUDE.md)")
    if "uncertainty_deg" in doc and (not _is_num(doc["uncertainty_deg"]) or doc["uncertainty_deg"] < 0):
        c.err("uncertainty_deg must be a number >= 0")


def check_terrain(c: Checker, doc: dict, real: bool, data_root: Path) -> None:
    check_site_id(c, doc)
    size = c.require(doc, "size_px", int, "$")
    spacing = c.require(doc, "spacing_m", (int, float), "$")
    if spacing is not None and spacing <= 0:
        c.err("spacing_m must be > 0")
    for key, want in (("frame", "local_tangent_enu"), ("origin", "site"), ("encoding", "uint16-le")):
        v = c.require(doc, key, str, "$")
        if v is not None and v != want:
            c.err(f"{key} {v!r} != {want!r}")
    hmin = c.require(doc, "height_min_m", (int, float), "$")
    hmax = c.require(doc, "height_max_m", (int, float), "$")
    hsite = c.require(doc, "site_height_m", (int, float), "$")
    if _is_num(hmin) and _is_num(hmax):
        if hmin >= hmax:
            c.err("height_min_m must be < height_max_m")
        elif _is_num(hsite) and not hmin <= hsite <= hmax:
            c.err(f"site_height_m {hsite} outside [height_min_m, height_max_m]")
    dem = c.require(doc, "dem", dict, "$")
    if dem is not None:
        c.require(dem, "product", str, "dem")
        c.require(dem, "resolution_m", (int, float), "dem")
        url = c.require(dem, "url", str, "dem")
        if real and url is not None and not url.startswith("http"):
            c.err("dem.url must be an http(s) URL for real data")
    binp = c.require(doc, "bin", str, "$")
    if binp is not None:
        if binp != f"terrain/{c.path.stem}.bin":
            c.err(f"bin {binp!r} != 'terrain/{c.path.stem}.bin'")
        f = data_root / binp
        if not f.is_file():
            c.err(f"bin file not found: {f}")
        elif isinstance(size, int) and f.stat().st_size != size * size * 2:
            c.err(f"bin size {f.stat().st_size} B != size_px^2 * 2 = {size * size * 2} B")


def check_earth_orientation(c: Checker, doc: dict, real: bool) -> None:
    """Contract §2.8 (v1.2.0): one global file, same hourly grid as ephem/."""
    start = c.require(doc, "start_utc", str, "$")
    start_ok = start is not None and c.iso(start, "start_utc")
    step = c.require(doc, "step_minutes", (int, float), "$")
    if step is not None and step <= 0:
        c.err("step_minutes must be > 0")
    count = c.require(doc, "count", int, "$")
    if count is not None and count <= 0:
        c.err("count must be > 0")
    c.num_array(doc.get("sub_lunar_lat_deg"), count, -90, 90, "sub_lunar_lat_deg")
    c.num_array(doc.get("sub_lunar_lon_deg"), count, -180, 180, "sub_lunar_lon_deg")
    c.num_array(doc.get("pole_pa_deg"), count, 0, 360, "pole_pa_deg", hi_open=True)
    if start_ok and _is_num(step) and isinstance(count, int) and count > 0:
        t0 = datetime.fromisoformat(start[:-1] + "+00:00").timestamp()
        want0 = datetime.fromisoformat(EPHEM_START_UTC[:-1] + "+00:00").timestamp()
        want1 = datetime.fromisoformat(EPHEM_END_UTC[:-1] + "+00:00").timestamp()
        if t0 != want0 or t0 + (count - 1) * step * 60 != want1:
            c.warn("grid does not match the ephem/ grid (2026-12-01T00Z .. 2028-12-31T23Z hourly)")


def check_validation(c: Checker, doc: dict, real: bool) -> None:
    checks = c.require(doc, "checks", list, "$")
    if checks is None:
        return
    ids = set()
    for i, ch in enumerate(checks):
        w = f"checks[{i}]"
        if not isinstance(ch, dict):
            c.err(f"{w}: expected object")
            continue
        cid = c.require(ch, "id", str, w)
        if cid in ids:
            c.err(f"{w}: duplicate id {cid!r}")
        ids.add(cid)
        c.require(ch, "kind", str, w)
        c.require(ch, "pass", bool, w)
        for key in ("max_abs_error_deg", "threshold_deg"):
            if key in ch and (not _is_num(ch[key]) or ch[key] < 0):
                c.err(f"{w}.{key} must be a number >= 0")
        if "n_samples" in ch and (not isinstance(ch["n_samples"], int) or ch["n_samples"] < 0):
            c.err(f"{w}.n_samples must be an integer >= 0")


def check_illum(c: Checker, doc: dict, real: bool) -> None:
    check_site_id(c, doc)
    period = c.require(doc, "period", dict, "$")
    if period is not None:
        c.iso(period.get("start_utc"), "period.start_utc")
        c.iso(period.get("end_utc"), "period.end_utc")
    grid = c.require(doc, "grid", dict, "$")
    pct = c.require(doc, "pct_sunlit", list, "$")
    if grid is None or pct is None:
        return
    c.num_range(grid.get("center_lat"), -90, 90, "grid.center_lat")
    c.num_range(grid.get("center_lon"), -180, 180, "grid.center_lon")
    nx, ny = grid.get("nx"), grid.get("ny")
    if not (isinstance(nx, int) and isinstance(ny, int) and nx > 0 and ny > 0):
        c.err("grid.nx / grid.ny must be positive integers")
        return
    if len(pct) != ny:
        c.err(f"pct_sunlit has {len(pct)} rows != ny {ny}")
    for r, row in enumerate(pct[:ny]):
        c.num_array(row, nx, 0, 100, f"pct_sunlit[{r}]")


# -- driver -----------------------------------------------------------------

def kind_of(path: Path) -> str | None:
    if path.name == "sites.json":
        return "sites"
    if path.name == "validation.json":
        return "validation"
    if path.name == "earth_orientation.json":
        return "earth_orientation"
    if path.parent.name in ("horizon", "ephem", "terrain", "illum") and path.suffix == ".json":
        return path.parent.name
    return None


def check_file(path: Path) -> list[Issue]:
    c = Checker(path)
    kind = kind_of(path)
    if kind is None:
        c.warn("unknown file kind (not covered by the contract), skipped")
        return c.issues
    if path.stat().st_size > MAX_BYTES:
        c.err(f"file is {path.stat().st_size / 1e6:.1f} MB > 5 MB (rule 7)")
    text = path.read_text(encoding="utf-8")

    def no_constants(name):
        raise ValueError(f"non-standard JSON constant {name}")
    try:
        doc = json.loads(text, parse_constant=no_constants)
    except ValueError as e:
        c.err(f"invalid JSON: {e}")
        return c.issues
    if not isinstance(doc, dict):
        c.err("top level must be an object")
        return c.issues

    is_mock = "mock" in path.parts
    check_compact(c, text)
    check_decimals(c, doc)
    meta = check_meta(c, doc, is_mock)
    real = bool(meta) and meta.get("synthetic") is False
    data_root = path.parent if kind in ("sites", "validation", "earth_orientation") else path.parent.parent
    if kind == "sites":
        check_sites(c, doc, real)
    elif kind == "ephem":
        check_ephem(c, doc, real)
    elif kind == "horizon":
        check_horizon(c, doc, real)
    elif kind == "terrain":
        check_terrain(c, doc, real, data_root)
    elif kind == "validation":
        check_validation(c, doc, real)
    elif kind == "illum":
        check_illum(c, doc, real)
    elif kind == "earth_orientation":
        check_earth_orientation(c, doc, real)
    return c.issues


def iter_files(args: list[str]):
    for a in args:
        p = Path(a)
        if p.is_dir():
            yield from sorted(f for f in p.rglob("*.json") if f.is_file())
        elif p.is_file():
            yield p
        else:
            print(f"ERROR {p}: no such file or directory")


def main(argv: list[str]) -> int:
    targets = argv or [str(DATA_DIR)]
    n_files = n_err = n_warn = 0
    for f in iter_files(targets):
        n_files += 1
        issues = check_file(f)
        for i in issues:
            print(i)
        e = sum(i.level == "ERROR" for i in issues)
        n_err += e
        n_warn += sum(i.level == "WARN" for i in issues)
        if not issues:
            print(f"OK    {f}")
    print(f"\n{n_files} file(s), {n_err} error(s), {n_warn} warning(s)")
    return 1 if n_err or n_files == 0 else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
