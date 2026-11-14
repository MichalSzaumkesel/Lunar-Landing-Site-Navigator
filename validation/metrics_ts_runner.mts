// Runs web/src/lib/metrics.ts on a real horizon+ephem pair. Called by check_metrics_py_vs_ts.py.
// Usage: node --experimental-strip-types --no-warnings validation/metrics_ts_runner.mts ROOT SITE HEIGHT T0 T1 TREF
import { readFileSync } from 'node:fs';
const [root, site, h, t0, t1, tref] = process.argv.slice(2);
const { computeMetrics } = await import(root + '/web/src/lib/metrics.ts');
const D = root + '/web/public/data/';
const horizon = JSON.parse(readFileSync(D + `horizon/${site}.json`, 'utf8'));
const ephem = JSON.parse(readFileSync(D + `ephem/${site}.json`, 'utf8'));
console.log(JSON.stringify(computeMetrics({ horizon, ephem }, { observerHeightM: Number(h), startMs: Date.parse(t0), endMs: Date.parse(t1), refMs: Date.parse(tref) })));
