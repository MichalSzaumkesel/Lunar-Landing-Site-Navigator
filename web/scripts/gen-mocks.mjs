import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mulberry32 seeded pseudo-random number generator
function createMulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function circularAzDist(az1, az2) {
  const diff = Math.abs(az1 - az2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function round3(v) {
  const n = Number(v.toFixed(3));
  return Object.is(n, -0) ? 0 : n;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }
}

// 2D Value Noise generator (5 octaves, bilinear interpolation on random lattice)
function makeValueNoise(rng, baseL = 64) {
  const octaves = [];
  let L = baseL;
  for (let o = 0; o < 5; o++) {
    const numCells = Math.ceil(256 / L) + 2;
    const grid = [];
    for (let y = 0; y < numCells; y++) {
      const row = [];
      for (let x = 0; x < numCells; x++) {
        row.push(rng() * 2 - 1);
      }
      grid.push(row);
    }
    octaves.push({ L, grid });
    L = Math.max(1, Math.floor(L / 2));
  }

  return function (r, c) {
    let sum = 0;
    let weight = 1.0;
    let totalWeight = 0;
    for (let o = 0; o < 5; o++) {
      const { L, grid } = octaves[o];
      const gx = c / L;
      const gy = r / L;
      const x0 = Math.floor(gx);
      const x1 = x0 + 1;
      const y0 = Math.floor(gy);
      const y1 = y0 + 1;
      const u = gx - x0;
      const v = gy - y0;
      const val =
        (1 - u) * (1 - v) * grid[y0][x0] +
        u * (1 - v) * grid[y0][x1] +
        (1 - u) * v * grid[y1][x0] +
        u * v * grid[y1][x1];
      sum += val * weight;
      totalWeight += weight;
      weight *= 0.5;
    }
    return sum / totalWeight;
  };
}

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..');

  const mockDir = path.join(projectRoot, 'public', 'data', 'mock');
  const horizonDir = path.join(mockDir, 'horizon');
  const ephemDir = path.join(mockDir, 'ephem');
  const terrainDir = path.join(mockDir, 'terrain');

  fs.mkdirSync(mockDir, { recursive: true });
  fs.mkdirSync(horizonDir, { recursive: true });
  fs.mkdirSync(ephemDir, { recursive: true });
  fs.mkdirSync(terrainDir, { recursive: true });

  const rng = createMulberry32(42);

  // 4.1 Common Meta
  const meta = {
    contract_version: '1.1.1',
    generated_utc: '2026-11-14T00:00:00Z',
    generator: 'web/scripts/gen-mocks.mjs',
    synthetic: true,
    approximate: false,
    inputs: [
      {
        name: 'Synthetic analytic model',
        url: '',
        notes: 'Fake data for UI development. Not a measurement.'
      }
    ]
  };

  // 4.2 Sites
  const sites = [
    {
      id: 'apollo_11',
      name: '[MOCK] Equatorial site',
      category: 'apollo',
      mission: null,
      agency: null,
      country: null,
      lat_deg: 0.0,
      lon_deg: 0.0,
      elevation_m: null,
      landing_date_utc: null,
      status: 'landed',
      region_radius_km: null,
      source: {
        title: 'Synthetic mock, not a real source',
        url: ''
      },
      notes: "Synthetic placeholder. Real coordinates come from scope A's sites.json."
    },
    {
      id: 'southpole_landed',
      name: '[MOCK] South-pole lander site',
      category: 'clps',
      mission: null,
      agency: null,
      country: null,
      lat_deg: -89.5,
      lon_deg: 45.0,
      elevation_m: null,
      landing_date_utc: null,
      status: 'planned',
      region_radius_km: null,
      source: {
        title: 'Synthetic mock, not a real source',
        url: ''
      },
      notes: "Synthetic placeholder. Real coordinates come from scope A's sites.json."
    },
    {
      id: 'artemis_region_1',
      name: '[MOCK] Artemis III candidate region',
      category: 'artemis_region',
      mission: null,
      agency: null,
      country: null,
      lat_deg: -87.0,
      lon_deg: -30.0,
      elevation_m: null,
      landing_date_utc: null,
      status: 'candidate_region',
      region_radius_km: 5,
      source: {
        title: 'Synthetic mock, not a real source',
        url: ''
      },
      notes: "Synthetic placeholder. Real coordinates come from scope A's sites.json."
    }
  ];

  const sitesFilePath = path.join(mockDir, 'sites.json');
  fs.writeFileSync(sitesFilePath, JSON.stringify({ meta, sites }));

  // 4.4 Date range for ephemeris
  const startUtc = '2026-12-01T00:00:00Z';
  const endUtc = '2028-12-31T23:00:00Z';
  const startDate = new Date(startUtc);
  const endDate = new Date(endUtc);
  const count = Math.round((endDate.getTime() - startDate.getTime()) / (3600 * 1000)) + 1;
  assert(count === 18288, `Ephemeris count must be 18288, got ${count}`);

  const summaryLines = [];

  for (const site of sites) {
    // ----------------------------------------------------
    // 4.3 Horizon Masks
    // ----------------------------------------------------
    let base = 0;
    let A = 0;
    let peaks = [];

    if (site.id === 'apollo_11') {
      base = 0.2;
      A = 0.1;
      peaks = [];
    } else if (site.id === 'southpole_landed') {
      base = 0.6;
      A = 1.2;
      const nominalCentres = [0, 40, 80, 120, 150, 180, 220, 270, 315];
      peaks = nominalCentres.map((c, idx) => {
        const centre = (idx === 0 || idx === 5) ? c : (c + (rng() - 0.5) * 15 + 360) % 360;
        const width = 2.0 + rng() * 4.0;
        const height = 1.5 + rng() * 4.5;
        return { centre, width, height };
      });
    } else if (site.id === 'artemis_region_1') {
      base = 0.5;
      A = 0.5;
      const nominalCentres = [25, 75, 260, 295, 335];
      peaks = nominalCentres.map(c => ({
        centre: (c + (rng() - 0.5) * 10 + 360) % 360,
        width: 4.0 + rng() * 4.0,
        height: 0.8 + rng() * 1.4
      }));
    }

    const rawW = Array.from({ length: 6 }, () => rng());
    const phases = Array.from({ length: 6 }, () => rng() * 2 * Math.PI);
    let maxAbs = 0;
    for (let i = 0; i < 720; i++) {
      const azRad = i * 0.5 * Math.PI / 180;
      let s = 0;
      for (let k = 1; k <= 6; k++) {
        s += rawW[k - 1] * Math.sin(k * azRad + phases[k - 1]);
      }
      if (Math.abs(s) > maxAbs) maxAbs = Math.abs(s);
    }
    const scale = maxAbs > 0 ? A / maxAbs : 0;

    const mask2 = new Array(720);
    const mask10 = new Array(720);

    for (let i = 0; i < 720; i++) {
      const az = i * 0.5;
      const azRad = az * Math.PI / 180;
      let s = 0;
      for (let k = 1; k <= 6; k++) {
        s += rawW[k - 1] * scale * Math.sin(k * azRad + phases[k - 1]);
      }
      let pSum = 0;
      for (const p of peaks) {
        const d = circularAzDist(az, p.centre);
        pSum += p.height * Math.exp(-0.5 * Math.pow(d / p.width, 2));
      }
      let val = base + s + pSum;
      if (site.id === 'artemis_region_1' && az >= 120 && az <= 240) {
        val *= 0.1;
      }
      val = Math.max(-0.5, Math.min(12, val));
      const m2 = round3(val);
      mask2[i] = m2;
      mask10[i] = round3(m2 - 0.107);
    }

    const horizonFile = {
      meta,
      site_id: site.id,
      az_step_deg: 0.5,
      n: 720,
      observer_heights_m: [2, 10],
      masks: {
        '2': mask2,
        '10': mask10
      },
      dem: {
        product: 'SYNTHETIC',
        resolution_m: 0,
        url: '',
        max_range_km: 0
      },
      uncertainty_deg: 0
    };

    const horizonPath = path.join(horizonDir, `${site.id}.json`);
    fs.writeFileSync(horizonPath, JSON.stringify(horizonFile));

    // ----------------------------------------------------
    // 4.4 Ephemeris
    // ----------------------------------------------------
    const sun = { az: new Array(count), el: new Array(count) };
    const earth = { az: new Array(count), el: new Array(count) };

    const phi = site.lat_deg * Math.PI / 180;
    const lam = site.lon_deg * Math.PI / 180;
    const T_syn = 29.530589;

    let minSunEl = Infinity;
    let maxSunEl = -Infinity;
    let minEarthEl = Infinity;
    let maxEarthEl = -Infinity;

    for (let k = 0; k < count; k++) {
      const t = k / 24;

      // Sun
      const H = 2 * Math.PI * t / T_syn - lam + 1.0;
      const delta = (1.54 * Math.PI / 180) * Math.sin(2 * Math.PI * t / 365.25 + 0.7);
      const sin_el = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H);
      const elClamped = Math.max(-1, Math.min(1, sin_el));
      const el = Math.asin(elClamped) * 180 / Math.PI;
      const y = -Math.cos(delta) * Math.sin(H);
      const x = Math.sin(delta) * Math.cos(phi) - Math.cos(delta) * Math.sin(phi) * Math.cos(H);
      let az = (Math.atan2(y, x) * 180 / Math.PI) % 360;
      if (az < 0) az += 360;
      let azRound = round3(az);
      if (azRound >= 360) azRound = 0;

      const elRound = round3(el);
      sun.az[k] = azRound;
      sun.el[k] = elRound;
      if (elRound < minSunEl) minSunEl = elRound;
      if (elRound > maxSunEl) maxSunEl = elRound;

      // Earth
      const phi_e_deg = 6.7 * Math.sin(2 * Math.PI * t / 27.212 + 0.3);
      const lam_e_deg = 7.9 * Math.sin(2 * Math.PI * t / 27.555 + 1.1);
      const phi_e = phi_e_deg * Math.PI / 180;
      const lam_e = lam_e_deg * Math.PI / 180;
      const d = lam_e - lam;
      const sin_el_e = Math.sin(phi) * Math.sin(phi_e) + Math.cos(phi) * Math.cos(phi_e) * Math.cos(d);
      const el_eClamped = Math.max(-1, Math.min(1, sin_el_e));
      const el_e = Math.asin(el_eClamped) * 180 / Math.PI;
      const y_e = Math.sin(d) * Math.cos(phi_e);
      const x_e = Math.cos(phi) * Math.sin(phi_e) - Math.sin(phi) * Math.cos(phi_e) * Math.cos(d);
      let az_e = (Math.atan2(y_e, x_e) * 180 / Math.PI) % 360;
      if (az_e < 0) az_e += 360;
      let az_eRound = round3(az_e);
      if (az_eRound >= 360) az_eRound = 0;

      const el_eRound = round3(el_e);
      earth.az[k] = az_eRound;
      earth.el[k] = el_eRound;
      if (el_eRound < minEarthEl) minEarthEl = el_eRound;
      if (el_eRound > maxEarthEl) maxEarthEl = el_eRound;
    }

    const ephemFile = {
      meta,
      site_id: site.id,
      start_utc: startUtc,
      step_minutes: 60,
      count,
      sun,
      earth,
      sun_ang_radius_deg: 0.2666,
      earth_ang_radius_deg: 0.95,
      horizons_query: {
        MOCK: 'synthetic'
      }
    };

    const ephemPath = path.join(ephemDir, `${site.id}.json`);
    fs.writeFileSync(ephemPath, JSON.stringify(ephemFile));

    // ----------------------------------------------------
    // 4.5 Terrain (.json + .bin)
    // ----------------------------------------------------
    const noise = makeValueNoise(rng, 64);
    const slopeTan = Math.tan(0.5 * Math.PI / 180);
    const heights = new Float64Array(256 * 256);

    let actualMin = Infinity;
    let actualMax = -Infinity;
    let siteHeight = 0;

    for (let r = 0; r < 256; r++) {
      const north = (128 - r) * 80;
      for (let c = 0; c < 256; c++) {
        const east = (c - 128) * 80;
        let h = 0;
        if (site.id === 'apollo_11') {
          h = 20 * noise(r, c);
        } else if (site.id === 'southpole_landed') {
          const rDist = Math.sqrt(Math.pow(east - 1500, 2) + Math.pow(north - 1000, 2));
          // Relief kept gentle on purpose: the terrain must not hide the Sun more than the mock horizon mask says.
          const bowl = -50 * Math.exp(-Math.pow(rDist / 3000, 2)) + 20 * Math.exp(-Math.pow((rDist - 3000) / 500, 2));
          h = 60 * noise(r, c) + bowl;
        } else if (site.id === 'artemis_region_1') {
          const slope = north * slopeTan;
          h = 40 * noise(r, c) + slope;
        }

        if (r === 128 && c === 128) siteHeight = h;
        if (h < actualMin) actualMin = h;
        if (h > actualMax) actualMax = h;
        heights[r * 256 + c] = h;
      }
    }

    const hMin = round3(actualMin);
    const hMax = round3(actualMax);
    const hSite = round3(siteHeight);

    const binBuf = Buffer.alloc(256 * 256 * 2);
    const hRange = hMax - hMin;
    for (let i = 0; i < 256 * 256; i++) {
      const h = heights[i];
      const v = hRange > 0
        ? Math.max(0, Math.min(65535, Math.round(((h - hMin) / hRange) * 65535)))
        : 0;
      binBuf.writeUInt16LE(v, i * 2);
    }

    const binPath = path.join(terrainDir, `${site.id}.bin`);
    fs.writeFileSync(binPath, binBuf);

    const terrainFile = {
      meta,
      site_id: site.id,
      size_px: 256,
      spacing_m: 80,
      frame: 'local_tangent_enu',
      origin: 'site',
      encoding: 'uint16-le',
      bin: `terrain/${site.id}.bin`,
      height_min_m: hMin,
      height_max_m: hMax,
      site_height_m: hSite,
      dem: {
        product: 'SYNTHETIC',
        resolution_m: 0,
        url: ''
      }
    };

    const terrainPath = path.join(terrainDir, `${site.id}.json`);
    fs.writeFileSync(terrainPath, JSON.stringify(terrainFile));

    // ----------------------------------------------------
    // 4.6 Self-check & Verification
    // ----------------------------------------------------
    // Linear interpolation of 2m horizon mask (wrap at 360)
    function getHorizon2m(az) {
      const norm = ((az % 360) + 360) % 360;
      const idx0 = Math.floor(norm / 0.5);
      const idx1 = (idx0 + 1) % 720;
      const frac = (norm - idx0 * 0.5) / 0.5;
      return mask2[idx0] * (1 - frac) + mask2[idx1] * frac;
    }

    let sunAboveCount = 0;
    let earthAboveCount = 0;

    for (let k = 0; k < count; k++) {
      const sAz = sun.az[k];
      const sEl = sun.el[k];
      const eAz = earth.az[k];
      const eEl = earth.el[k];

      assert(!Number.isNaN(sAz) && sAz >= 0 && sAz < 360, `Invalid sun az: ${sAz} at k=${k}`);
      assert(!Number.isNaN(sEl), `NaN in sun el at k=${k}`);
      assert(!Number.isNaN(eAz) && eAz >= 0 && eAz < 360, `Invalid earth az: ${eAz} at k=${k}`);
      assert(!Number.isNaN(eEl), `NaN in earth el at k=${k}`);

      if (sEl > getHorizon2m(sAz)) sunAboveCount++;
      if (eEl > getHorizon2m(eAz)) earthAboveCount++;
    }

    assert(mask2.length === 720, `Horizon mask 2m length ${mask2.length} != 720`);
    assert(mask10.length === 720, `Horizon mask 10m length ${mask10.length} != 720`);
    for (let i = 0; i < 720; i++) {
      assert(!Number.isNaN(mask2[i]), `NaN in mask2 at ${i}`);
      assert(!Number.isNaN(mask10[i]), `NaN in mask10 at ${i}`);
    }

    assert(binBuf.length === 256 * 256 * 2, `Terrain bin length ${binBuf.length} != 131072`);
    assert(!Number.isNaN(hMin) && !Number.isNaN(hMax) && !Number.isNaN(hSite), 'NaN in terrain heights');

    const horizonSize = fs.statSync(horizonPath).size;
    const ephemSize = fs.statSync(ephemPath).size;
    const terrainSize = fs.statSync(terrainPath).size;
    const binSize = fs.statSync(binPath).size;

    assert(horizonSize <= 5 * 1024 * 1024, `Horizon file > 5MB: ${horizonSize}`);
    assert(ephemSize <= 5 * 1024 * 1024, `Ephem file > 5MB: ${ephemSize}`);
    assert(terrainSize <= 5 * 1024 * 1024, `Terrain json file > 5MB: ${terrainSize}`);
    assert(binSize <= 5 * 1024 * 1024, `Terrain bin file > 5MB: ${binSize}`);

    const sunPct = (sunAboveCount / count * 100).toFixed(1);
    const earthPct = (earthAboveCount / count * 100).toFixed(1);
    const minMask2 = Math.min(...mask2);
    const maxMask2 = Math.max(...mask2);

    const summaryLine = `${site.id}: files: horizon ${(horizonSize / 1024).toFixed(1)} KB, ephem ${(ephemSize / 1024).toFixed(1)} KB, terrain ${(terrainSize / 1024).toFixed(1)} KB, bin ${(binSize / 1024).toFixed(1)} KB | count: ${count} | Sun el: [${minSunEl.toFixed(3)}, ${maxSunEl.toFixed(3)}] deg (${sunPct}% > horiz) | Earth el: [${minEarthEl.toFixed(3)}, ${maxEarthEl.toFixed(3)}] deg (${earthPct}% > horiz) | horizon: [${minMask2.toFixed(3)}, ${maxMask2.toFixed(3)}] deg | terrain: [${hMin.toFixed(3)}, ${hMax.toFixed(3)}] m, site_height: ${hSite.toFixed(3)} m`;
    summaryLines.push(summaryLine);
  }

  // Sites file check
  const sitesSize = fs.statSync(sitesFilePath).size;
  assert(sitesSize <= 5 * 1024 * 1024, `Sites file > 5MB: ${sitesSize}`);
  assert(sites.length === 3, `Sites count ${sites.length} != 3`);

  // Print summary lines (one line per site, no arrays)
  for (const line of summaryLines) {
    console.log(line);
  }
}

main();
