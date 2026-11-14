// Usage (repo root): ~/.local/opt/node24/bin/node --experimental-strip-types --no-warnings validation/check_metrics_ts_fixtures.mts $PWD /tmp/out.json
// Runs scope B's web/src/lib/metrics.ts against validation/fixtures/metrics_cases.json (read-only).
import { readFileSync, writeFileSync } from 'node:fs';
const root = process.argv[2];
const out = process.argv[3];
const { computeMetrics } = await import(root + '/web/src/lib/metrics.ts');
const doc = JSON.parse(readFileSync(root + '/validation/fixtures/metrics_cases.json', 'utf8'));
let fails = 0;
let maxErr = 0;
const failed: string[] = [];
for (const c of doc.cases) {
  const i = c.input;
  const got: any = computeMetrics({ horizon: c.horizon, ephem: c.ephem }, {
    observerHeightM: i.observer_height_m, startMs: Date.parse(i.t0_utc),
    endMs: Date.parse(i.t1_utc), refMs: Date.parse(i.t_ref_utc),
  });
  const bad: string[] = [];
  for (const [k, want] of Object.entries(c.expected)) {
    const have = got?.[k];
    let ok: boolean;
    if (typeof want === 'number') {
      ok = typeof have === 'number' && Math.abs(have - want) <= doc.tolerance_abs;
      if (typeof have === 'number') maxErr = Math.max(maxErr, Math.abs(have - want));
    } else {
      ok = JSON.stringify(have) === JSON.stringify(want);
    }
    if (!ok) bad.push(`${k}: got ${JSON.stringify(have)} want ${JSON.stringify(want)}`);
  }
  if (bad.length) { fails++; failed.push(c.id); }
  console.log(bad.length ? 'FAIL' : 'ok  ', c.id, bad.join('; '));
}
const n = doc.cases.length;
console.log(`${n - fails}/${n} pass, max numeric error ${maxErr}`);
if (out) writeFileSync(out, JSON.stringify({ n_cases: n, n_pass: n - fails, failed, max_numeric_error: maxErr }));
process.exit(fails ? 1 : 0);
