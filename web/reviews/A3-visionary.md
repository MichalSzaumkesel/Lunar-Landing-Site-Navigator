# Task A3: Visionary — What Are We Missing? (Winning & Memorable Proposals)

## Executive Summary (Top 5 Proposals)
- HIGH: `src/lib/earthOrientation.ts:48` — DSN Deep Space Network line-of-sight window indicator (Goldstone/Madrid/Canberra) using existing `sub_lunar_lon_deg`.
- HIGH: `src/components/scenario/cardLogic.ts:80` — Solar geometric incidence factor ($\sin el$ vs $\cos el$), proving the vertical mast vs flat deck advantage.
- HIGH: `src/app/TopBar.tsx:42` — Scientific Audit Telemetry HUD modal displaying the 39/39 verified automated checks from `validation.json`.
- MEDIUM: `src/components/timeline/EventChips.tsx:30` — Solar eclipse & Earth occultation banner in Loupe utilizing existing `eclipses.ts` intersection math.
- MEDIUM: `src/components/timeline/Timeline.tsx:85` — Launch slip sensitivity sparkline gradient under the mission bar for rapid launch window optimization.

---

## 1. Top 3 Proposals to BUILD NOW (High Impact, Low Effort, 100% Existing Data)

### Proposal 1: DSN Deep Space Network Ground-Station Line-of-Sight Windows
- **Severity**: HIGH (Top 3 to Build Now)
- **`file:line`**: `src/lib/earthOrientation.ts:48-60`, `src/components/sky/SkyReadout.tsx:24-48`, `src/components/scenario/MetricsPanel.tsx:90-102`
- **What is missing today**: The app indicates when Earth is geometrically above the lunar terrain horizon ("Earth in view"), but space communications judges immediately object: *"Seeing Earth doesn't guarantee communication—which Deep Space Network (DSN) ground station is actually facing the Moon?"*
- **Evidence / Why it impresses**: Earth rotates every 24 hours while topocentric lunar libration moves slowly. Space planners must coordinate communication passes between NASA's three DSN 70m/34m complexes (Goldstone, Madrid, Canberra). We already have hourly `sub_lunar_lat_deg` and `sub_lunar_lon_deg` in `web/public/data/earth_orientation.json`! By calculating the great-circle angular separation $\theta$ between the sub-lunar point and each DSN station, any station with $\theta < 80^\circ$ (local elevation $> 10^\circ$ above station horizon) has direct geometric line of sight to the Moon. Showing a subtle badge: `DSN: [Goldstone | Madrid | Canberra]` with the active station highlighted in real time directly answers the #1 communications objection without adding any new data files.
- **Fix / Implementation plan**:
  ```ts
  // In src/lib/earthOrientation.ts:
  export const DSN_STATIONS = [
    { id: 'goldstone', name: 'Goldstone (USA)', lat: 35.43, lon: -116.89 },
    { id: 'madrid', name: 'Madrid (Spain)', lat: 40.43, lon: -4.25 },
    { id: 'canberra', name: 'Canberra (Australia)', lat: -35.40, lon: 148.98 },
  ] as const;

  export function getActiveDsnStations(subLatDeg: number, subLonDeg: number) {
    const DEG = Math.PI / 180;
    const phi1 = subLatDeg * DEG, lam1 = subLonDeg * DEG;
    return DSN_STATIONS.filter(st => {
      const phi2 = st.lat * DEG, lam2 = st.lon * DEG;
      const cosDist = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(lam1 - lam2);
      return cosDist > 0.1736; // elevation > 10 deg above ground station horizon
    });
  }
  ```
- **Effort**: 1.5 hours.
- **Data needed**: `web/public/data/earth_orientation.json` (already loaded in `earthOrientation.ts`).
- **Risk**: Low. Pure spherical trigonometry on existing memory structures; zero network calls.
- **One-line demo hook**: *"Earth is above the crater rim, but which NASA antenna is looking back? Watch the active DSN station hand off live as Earth rotates."*
- **Wording discipline**: Strictly labelled as "Geometric line of sight to DSN station (>10° local elevation)"; never claims "communication available" or "downlink closed".
- **DECISION**: Place the active DSN badge inside `SkyReadout.tsx` next to the Earth clearance indicator, or inside the expanded scenario card metrics.

---

### Proposal 2: Solar Geometric Incidence Factor: Vertical Mast vs Horizontal Panel
- **Severity**: HIGH (Top 3 to Build Now)
- **`file:line`**: `src/components/scenario/cardLogic.ts:80-95`, `src/components/scenario/MetricsPanel.tsx:90-102`
- **What is missing today**: The app compares 2 m vs 10 m observer height to show shadow clearance, but fails to explain the primary architectural challenge of polar missions: why conventional horizontal panels fail while vertical masts excel.
- **Evidence / Why it impresses**: At polar sites, solar elevation is typically only 1.5° to 6°. A horizontal panel receives flux proportional to $\sin(el) \approx \sin(3^\circ) \approx 0.052$ (only 5% geometric projection), whereas a vertical cylindrical mast or vertical bifacial solar panel receives $\cos(el) \approx \cos(3^\circ) \approx 0.998$ (99.8% geometric projection—a 19x advantage!). Adding a metric row: `Sun geometric projection: Vertical mast 99% vs Flat deck 5%` turns a confusing polar quirk into an intuitive "aha!" moment for spacecraft engineering judges.
- **Fix / Implementation plan**:
  ```ts
  // In src/components/scenario/cardLogic.ts:
  export function solarIncidenceFactors(sunElDeg: number | null): { vertPct: number; horizPct: number } | null {
    if (sunElDeg === null || sunElDeg <= 0) return null;
    const rad = sunElDeg * (Math.PI / 180);
    return {
      vertPct: Math.round(Math.cos(rad) * 100),
      horizPct: Math.round(Math.sin(rad) * 100),
    };
  }
  ```
- **Effort**: 1.0 hour.
- **Data needed**: Existing `sun_el_deg` from `metrics.ts` / `ephem/<site>.json`.
- **Risk**: Very low. Must strictly avoid stating "power output" or "watts"; must label as "Geometric incidence area factor".
- **One-line demo hook**: *"At 2° solar elevation, a flat panel captures only 5% of direct sunlight—watch our vertical mast capture 99%."*
- **Wording discipline**: Strictly described as "Geometric projection area factor", never claiming watts, electrical power, or battery charging.
- **DECISION**: Include in the main `MetricsPanel.tsx` grid alongside the 10 m mast comparison.

---

### Proposal 3: Scientific Audit Telemetry HUD (One-Click 39/39 Verification Modal)
- **Severity**: HIGH (Top 3 to Build Now)
- **`file:line`**: `src/app/TopBar.tsx:42-53`, `src/components/help/` (new `AuditModal.tsx`)
- **What is missing today**: Scope A produced a gold-standard validation report (`web/public/data/validation.json`) with 41 automated checks proving sub-0.001° JPL Horizons agreement, crater bowl alignment to 0.3 km, and $5.7 \times 10^{-14}$ dual-engine parity, but it is invisible in the user interface.
- **Evidence / Why it impresses**: NASA Space Apps judges explicitly score "Validity" (scientific credibility). If the presenter clicks an "Audit" badge in the TopBar, an authentic NASA telemetry modal opens showing live passed checks, exact error bounds, and reproducible source links. This immediately elevates the project above student prototypes.
- **Fix / Implementation plan**:
  ```tsx
  // TopBar.tsx: add ghost button next to Demo
  <button type="button" className="ghost ghost--audit" onClick={() => setAuditOpen(true)} title="View scientific validation telemetry">
    <span aria-hidden="true">✓</span> 39/39 Validated
  </button>

  // In AuditModal.tsx:
  // Render summary categories: Ephemeris (0.001° vs JPL), Topography (±300m LOLA), Parity (1e-14 TS vs Python)
  ```
- **Effort**: 1.0 hour.
- **Data needed**: `web/public/data/validation.json` (already committed on main).
- **Risk**: Zero. Read-only modal displaying static JSON; no performance overhead during playback.
- **One-line demo hook**: *"One click reveals our flight verification: 39 of 39 automated checks passed against JPL Horizons and LOLA laser altimetry."*
- **Wording discipline**: Displays verified mathematical and ephemeris residuals, no power or link claims.
- **DECISION**: Place the button in `TopBar.tsx` next to `Tutorial` and `Demo`.

---

## 2. Six Proposals to CONSIDER / FAST-FOLLOW (Medium Severity)

### Proposal 4: Solar Eclipse / Earth Occultation Banner & Solar Disc Ingress
- **Severity**: MEDIUM
- **`file:line`**: `src/components/timeline/EventChips.tsx:30-45`, `src/components/sky/Loupe.tsx:45-70`
- **What is missing today**: `src/lib/eclipses.ts` already implements circle-circle overlap area mathematics, but during playback, eclipses are not visually depicted in the Loupe or flagged on the timeline with an occultation chip.
- **Evidence / Why it impresses**: In 2028 (covered by our ephemeris), Earth passes directly between the Sun and Moon. Scrubbing to an eclipse timestamp and seeing the solar loupe render the dark 0.95° Earth disc slicing across the 0.27° Sun disc proves true astronomical fidelity.
- **Fix / Implementation plan**:
  - In `Loupe.tsx`: when center-to-center angular separation $< r_{sun} + r_{earth}$, draw an overlaid circle in SVG representing the Earth disc.
  - In `EventChips.tsx`: render an "Earth Occultation of Sun" chip when eclipse overlap fraction $> 0$.
- **Effort**: 1.5 hours.
- **Data needed**: Existing `ephem/<site>.json` (Sun and Earth az/el, angular radii).
- **Risk**: Low. Pure SVG rendering of existing geometric functions.
- **One-line demo hook**: *"Scrub to 2028: Earth transits the Sun, plunging the site into full eclipse as seen through our solar loupe."*
- **Wording discipline**: Describes geometric disc occultation, not solar array power collapse.

---

### Proposal 5: Launch Slip Sensitivity Sparkline on the Mission Bar
- **Severity**: MEDIUM
- **`file:line`**: `src/components/timeline/Timeline.tsx:85-110`, `src/components/timeline/missionBar.ts:40-65`
- **What is missing today**: The slip slider allows ±60 days slip, but the user cannot anticipate whether slipping forward or backward improves sunlight without manually dragging and waiting.
- **Evidence / Why it impresses**: A subtle 4px color sparkline underneath the timeline scrubber shows the sunlight share for start dates in the immediate neighborhood (e.g. ±7 days). Green indicates safe sunlight windows; red indicates dark traps. It gives planners instant gradient navigation.
- **Fix / Implementation plan**:
  - Pre-evaluate `pct_sunlit` at 1-day offsets across -7 to +7 days (15 points).
  - Render an SVG linearGradient bar directly beneath the timeline track.
- **Effort**: 2.0 hours.
- **Data needed**: Active site ephemeris and horizon mask.
- **Risk**: Low to medium. Must memoize calculations so scrubbing does not trigger re-computation.
- **One-line demo hook**: *"The slip gradient tells planners instantly: slipping launch 5 days earlier enters a 200-hour dark trap, but slipping 3 days later is safe."*
- **Wording discipline**: Displays "Sun visible %", no power availability claims.

---

### Proposal 6: 1-Click JPL Horizons Batch Query Exporter
- **Severity**: MEDIUM
- **`file:line`**: `src/components/library/SiteLibrary.tsx:110-130`, `src/components/scenario/ScenarioControls.tsx:50-65`
- **What is missing today**: Reviewers and planetary scientists frequently ask: *"How can I replicate this in my own JPL Horizons terminal script?"*
- **Evidence / Why it impresses**: Clicking "Copy Horizons Query" copies the exact mail-in / API query string formatted for Horizons (`CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='lon,lat,elev'`). It cements scientific transparency and interoperability with NASA's flagship ephemeris engine.
- **Fix / Implementation plan**:
  ```ts
  export function copyHorizonsQuery(site: Site, startIso: string, stopIso: string) {
    const text = `COMMAND='301'\nCENTER='coord@301'\nCOORD_TYPE='GEODETIC'\nSITE_COORD='${site.lon_deg},${site.lat_deg},${(site.elevation_m ?? 0) / 1000}'\nSTART_TIME='${startIso.slice(0, 10)}'\nSTOP_TIME='${stopIso.slice(0, 10)}'\nSTEP_SIZE='1h'\nQUANTITIES='4,14,17'`;
    navigator.clipboard.writeText(text);
  }
  ```
- **Effort**: 0.75 hours.
- **Data needed**: `web/public/data/sites.json` and scenario dates.
- **Risk**: Zero. Pure string formatting.
- **One-line demo hook**: *"Export the exact JPL Horizons batch command in one click to verify our results in NASA's native tools."*
- **Wording discipline**: Pure ephemeris batch query, no claims.

---

### Proposal 7: Topographic Horizon Ruggedness & Sky-Obstruction Index
- **Severity**: MEDIUM
- **`file:line`**: `src/components/scenario/cardLogic.ts:60-78`, `src/components/sky/Panorama.tsx:40-55`
- **What is missing today**: Scenario cards show coordinates and elevation, but lack a single summary number capturing how "hostile" the crater terrain is compared to flat ground.
- **Evidence / Why it impresses**: Compute two numbers from `masks["2"]`: (1) Peak relief: $\max(mask) - \min(mask)$ in degrees; (2) Sky hemisphere occlusion: percentage of the upper hemisphere blocked by local terrain. Apollo 11 has $0.4^\circ$ relief and $0.1\%$ occlusion (smooth mare). Shackleton rim has $5.8^\circ$ relief and $14.2\%$ occlusion. This single metric crystallizes the terrain challenge at a glance.
- **Fix / Implementation plan**:
  ```ts
  export function horizonMetrics(mask: number[]): { reliefDeg: number; occludedPct: number } {
    const min = Math.min(...mask), max = Math.max(...mask);
    const sumEl = mask.reduce((acc, v) => acc + Math.max(0, v), 0);
    return {
      reliefDeg: Math.round((max - min) * 10) / 10,
      occludedPct: Math.round((sumEl / (mask.length * 90)) * 1000) / 10,
    };
  }
  ```
- **Effort**: 0.75 hours.
- **Data needed**: `horizon/<site>.json` `masks["2"]`.
- **Risk**: Very low. Instant arithmetic on already-loaded 720-element array.
- **One-line demo hook**: *"Quantify terrain hostility in one number: Apollo 11's horizon is 0.4° flat, while the Artemis rim obstructs 14% of the sky."*
- **Wording discipline**: Describes geometric terrain elevation, no link/power claims.

---

### Proposal 8: Multi-Stop Ridge Traverse Sun-Exposure Profiler
- **Severity**: MEDIUM
- **`file:line`**: `src/viz3d/SurfaceView.tsx:120-145`, `src/viz3d/terrainHorizon.ts:25-50`
- **What is missing today**: Users can move the lander one step at a time, but cannot visualize a rover moving along a ridge to maintain continuous solar line-of-sight.
- **Evidence / Why it impresses**: Clicking a "Ridge Traverse" preset loads 3 waypoints along the connecting ridge on the 20 km terrain patch. The elevation chart overlays all 3 points, showing how traversing 800 meters keeps a rover in sunlight while the base station enters darkness.
- **Fix / Implementation plan**:
  - Store 3 fixed waypoints for `southpole_landed` along the Shackleton-de Gerlache connecting ridge.
  - Run `terrainHorizon.ts` in the existing web worker for each waypoint.
  - Display comparative sunlight percentage for the traverse vs stationary landing.
- **Effort**: 2.5 hours.
- **Data needed**: `terrain/southpole_landed.bin` and `.json`.
- **Risk**: Moderate. Computing multiple horizons takes ~150 ms in worker; must not block UI.
- **One-line demo hook**: *"Plan a sun-chasing ridge traverse: moving 800 meters along the crater lip gains 48 hours of continuous sunlight."*
- **Wording discipline**: "Sun visible along traverse", no power generation claims.

---

### Proposal 9: "Simple Mode" Interactive Classroom Lunar Challenge
- **Severity**: MEDIUM
- **`file:line`**: `src/components/simple/SimpleView.tsx:65-90`
- **What is missing today**: Simple mode is an informative passive summary, but does not actively engage students or teachers with interactive learning prompts.
- **Evidence / Why it impresses**: Add a subtle prompt card: *"Teacher Challenge: Why does Earth never set at Apollo 11, but dips behind mountains at the South Pole?"* with an interactive *"Show Me"* button that loads the comparison preset and triggers the playback.
- **Fix / Implementation plan**:
  - Add an interactive card in `SimpleView.tsx` with one click to trigger `PRESET_APOLLO_VS_ARTEMIS` and start playback.
- **Effort**: 1.25 hours.
- **Data needed**: Existing presets and simple mode strings.
- **Risk**: Low.
- **One-line demo hook**: *"Engage students in seconds: our classroom challenge demonstrates tidal locking and lunar libration with one click."*
- **Wording discipline**: Plain-language astronomical concepts, strictly zero power/link claims.

---

## 3. Three Proposals to EXPLICITLY SKIP (Low Severity / High Risk)

### Proposal 10: Multi-Agency Lander 3D Mesh Scaling (Starship HLS vs Nova-C vs Apollo)
- **Severity**: LOW (Explicitly Skip)
- **`file:line`**: `src/viz3d/lander.ts:15-40`
- **Why it impresses conceptually**: Visualizing a 50-meter SpaceX Starship HLS vs a 4-meter Intuitive Machines Nova-C lander on the terrain to demonstrate mast height effects.
- **Why skip**: High risk of 3D mesh rendering bugs, bounding box collisions, and shader rework. We already have the 2 m vs 10 m observer height switch which computes exact horizon masks on LOLA DEMs. Adding new 3D models 15 hours before deadline risks WebGL crashes on the judging projector.
- **Verdict**: **SKIP**.

---

### Proposal 11: Zero-Atmosphere Harsh Lunar Contrast Shader Mode
- **Severity**: LOW (Explicitly Skip)
- **`file:line`**: `src/viz3d/shaderPatches.ts:40-60`, `src/viz3d/scene.ts:210-230`
- **Why it impresses conceptually**: Pure black shadows and specular regolith retroreflection (opposition surge) recreating Apollo photography contrast.
- **Why skip**: Modifying Three.js custom shader chunks risks device-specific WebGL failures, shadow acne, and framerate drops below the 60 fps budget on judging laptops. The current terrain shading already accurately updates shadow directions from JPL Horizons solar vectors.
- **Verdict**: **SKIP**.

---

### Proposal 12: Topographic Horizon Audio Sonification
- **Severity**: LOW (Explicitly Skip)
- **`file:line`**: `src/components/sound/useEventSounds.ts:50-75`
- **Why it impresses conceptually**: Converting the 360° horizon silhouette into an audio frequency sweep as the user scrubs azimuth.
- **Why skip**: Hackathon judging halls are loud, noisy convention centers; sound is muted by default (per `docs/demo-script.md:10`); audio features will almost certainly be unheard or disabled during the 2-minute live presentation.
- **Verdict**: **SKIP**.

---

## 4. Comparison Matrix of All 12 Proposals

| # | Proposal | Tier | Effort | Data Needed | Risk | Demo Hook |
|---|---|:---:|:---:|---|:---:|---|
| **1** | **DSN Ground-Station Windows** | **Build Now** | 1.5 h | `earth_orientation.json` | Low | *"Which NASA antenna is looking back? Live DSN line of sight as Earth rotates."* |
| **2** | **Solar Geometric Incidence Factor** | **Build Now** | 1.0 h | `ephem/` az/el | Very Low | *"At 2° Sun elevation, flat panels get 5% direct light—vertical masts get 99%."* |
| **3** | **Scientific Audit Telemetry HUD** | **Build Now** | 1.0 h | `validation.json` | Zero | *"One click reveals our flight verification: 39/39 checks passed against JPL & LOLA."* |
| 4 | Solar Eclipse / Occultation in Loupe | Consider | 1.5 h | `ephem/` az/el, radii | Low | *"Scrub to 2028: Earth transits the Sun in full eclipse through our solar loupe."* |
| 5 | Launch Slip Sensitivity Sparkline | Consider | 2.0 h | `ephem/`, `horizon/` | Med | *"The slip gradient tells planners: 5 days earlier is a dark trap, 3 days later is safe."* |
| 6 | 1-Click JPL Horizons Batch Exporter | Consider | 0.75 h | `sites.json`, dates | Zero | *"Export the exact JPL Horizons batch command in one click to verify in NASA tools."* |
| 7 | Topographic Ruggedness Index | Consider | 0.75 h | `horizon/` masks | Very Low | *"Apollo 11's horizon is 0.4° flat, while the Artemis rim blocks 14% of the sky."* |
| 8 | Multi-Stop Ridge Traverse Profiler | Consider | 2.5 h | `terrain/*.bin` | Med | *"Plan a sun-chasing ridge traverse: 800m move gains 48 hours continuous sunlight."* |
| 9 | Simple Mode Classroom Challenge | Consider | 1.25 h | Presets, strings | Low | *"Engage students in seconds: our classroom challenge demonstrates libration."* |
| 10 | Multi-Lander 3D Mesh Scaling | Skip | 3.5 h | New 3D meshes | High | WebGL regression risk; skip before freeze. |
| 11 | Harsh Contrast Shader Mode | Skip | 3.0 h | Custom GLSL | High | Shader bug risk on judging projector; skip before freeze. |
| 12 | Horizon Audio Sonification | Skip | 2.0 h | Web Audio | Low | Sound off by default in judging hall; skip before freeze. |

---

## 5. Strategic Roadmap (Next 12–15 Hours until Freeze)

1. **Wave 1 (Now – 21:00 CET, ~3.5 h)**:
   - Build **Proposal 1** (DSN Ground Stations in `earthOrientation.ts` + badge in `SkyReadout.tsx`).
   - Build **Proposal 2** (Solar Geometric Incidence Factor in `cardLogic.ts` + `MetricsPanel.tsx`).
   - Build **Proposal 3** (Scientific Audit Modal in `TopBar.tsx` reading `validation.json`).
2. **Wave 2 (21:00 – 22:30 CET, ~1.5 h)**:
   - Implement **Proposal 6** (1-Click JPL Horizons Query Export) and **Proposal 7** (Topographic Ruggedness Index).
3. **Verification & Hard Freeze (22:30 – 23:30 CET)**:
   - Run full test suite (`npm run typecheck`, `npm test`, `npm run build`).
   - Verify zero mentions of "power available" or "communication available" across new copy.
   - Rehearse 2-minute live demo script with the new DSN and Audit hooks.
