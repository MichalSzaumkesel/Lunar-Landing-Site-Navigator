"""Compare pipeline/metrics.py with web/src/lib/metrics.ts on real horizon+ephem files (12 runs).
Usage (repo root): python validation/check_metrics_py_vs_ts.py ROOT NODE_BIN   (NODE_BIN runs with --experimental-strip-types)
ROOT holds pipeline/, web/ (data + src); prints a JSON summary.
"""
import json, subprocess, sys
from pathlib import Path
root, node = sys.argv[1], sys.argv[2]
sp = str(Path(__file__).resolve().parent)
sys.path.insert(0, root + "/pipeline"); import metrics
cases = [(s, h, t0, t1, tr) for s in ("apollo_11", "southpole_landed", "artemis_region_1") for h in (2, 10)
         for (t0, t1, tr) in (("2026-12-01T00:00:00Z", "2029-01-01T00:00:00Z", "2026-12-01T00:00:00Z"),
                              ("2027-03-01T00:00:00Z", "2027-03-15T00:00:00Z", "2027-03-07T13:30:00Z"))]
worst, mism, n = 0.0, [], 0
for s, h, t0, t1, tr in cases:
    D = f"{root}/web/public/data/"
    py = metrics.compute_metrics(json.load(open(D + f"horizon/{s}.json")), json.load(open(D + f"ephem/{s}.json")), h, t0, t1, tr)
    ts = json.loads(subprocess.run([node, "--experimental-strip-types", "--no-warnings", f"{sp}/metrics_ts_runner.mts", root, s, str(h), t0, t1, tr],
                                   capture_output=True, text=True, check=True).stdout)
    for k, v in py.items():
        n += 1
        w = ts.get(k)
        if isinstance(v, float) or isinstance(w, float):
            if v is None or w is None:
                mism.append((s, h, t0, k, v, w)); continue
            worst = max(worst, abs(v - w))
            if abs(v - w) > 1e-6: mism.append((s, h, t0, k, v, w))
        elif v != w:
            mism.append((s, h, t0, k, v, w))
print(json.dumps({"n_runs": len(cases), "n_values": n, "max_abs_diff": worst, "mismatches": mism}))
