# Review A2: NASA Space Apps Jury Audit (2–3 Minute Evaluation)

## Executive Summary (Top 5 Findings)
- HIGH: `src/components/demo/demoSteps.ts:81-84` computes countdown from window start `startMs` while `run()` jumps cursor to `sunsetH`, showing "Sun sets in 7 d 16 h" while the cursor is already at sunset.
- HIGH: `docs/demo-script.md:21` spends the first 15 s on secondary UI controls (Tutorial, Demo, mode switch) instead of triggering the Apollo 11 vs South Pole preset and timeline playback.
- HIGH: `README.md:9-16` lists all project screenshots as "Planned files (not yet in the repository)", hurting first impressions for remote jury evaluators.
- MEDIUM: `docs/pitch.md:34-39` vs `src/config/presets.ts:25-27` cites January 2027 numbers (6.8% to 94.0%) that contradict the live app October 2027 preset values (52% to 8%).
- MEDIUM: `src/components/badges/DataBadges.tsx:17-31` displays `Synthetic data` / `Approximate` badges without contextual tooltips explaining why official Artemis regions carry them.

---

## 1. The First 15 Seconds: What the Demo MUST Show

In a 2–3 minute judging session with 20+ competing teams, the jury decides their initial impression in the first 15 seconds. The presenter must **never** open on a blank form, read introductory text, or spend time pointing out utility icons (Tutorial/Settings).

### The First 15 Seconds Choreography
1. **Second 0:00–0:03 — Live Visual Hook (No Empty State)**:
   - The app must already be open in full screen (`F11`, zoom 90%, `/?tour=0`) loaded into the default south-pole scenario (`southpole_landed`).
   - The jury instantly sees the dark-mode NASA telemetry HUD, the 360° polar sky plot with jagged lunar terrain silhouette, and live Sun/Earth markers.
2. **Second 0:03–0:07 — The Core Mission Question**:
   - Narrator speaks 1 sentence: *"Lunar landers live or die by solar illumination and direct-to-Earth line of sight—our tool evaluates both in under 100 milliseconds."*
   - Immediate click on top-bar preset: **"Compare: Apollo 11 (equator) vs South Pole (Artemis candidate region)"**.
3. **Second 0:07–0:12 — The Contrast That Sells the Project**:
   - Two cards render side by side.
   - Apollo 11 shows high Sun (+89.8° zenith) and constant Earth visibility (100%).
   - South Pole shows grazing Sun (<7°) skimming crater rims and fluctuating Earth visibility.
4. **Second 0:12–0:15 — Dynamic Motion (Press Space)**:
   - Press **Space** to start timeline playback at 12 h/s.
   - The Sun and Earth glide across the jagged horizon, the solar disc loupe reveals partial limb clipping by real LOLA topography, and countdown timers tick live.

---

## 2. NASA Space Apps Criteria Scoring (1–10)

| Criterion | Score | Key Driver |
|---|:---:|---|
| **Impact** | **8 / 10** | Massive acceleration for mission pre-planning & education; bounded by strictly geometric scope (no thermal, battery, or RF link models). |
| **Creativity** | **8 / 10** | Pre-computed 720-ray LOLA horizons + client-side workers bypass heavy GIS backends; dynamic solar limb clipping loupe is visually novel. |
| **Validity** | **9 / 10** | 39/39 automated validation checks pass; dual Python/TypeScript metric match to $5.7 \times 10^{-14}$; rigorous tolerance bounds vs JPL & PGDA. |
| **Relevance** | **9 / 10** | Directly addresses 100% of the challenge brief objectives (curated sites, side-by-side cards, date slip slider, 2D/3D views, accessibility modes). |
| **Presentation** | **8 / 10** | Professional NASA telemetry UI, tight 2-minute script, and built-in video recorder; lowered by missing screenshots in README and demo caption bug. |

---

### 2.1 Impact (Score: 8 / 10)

#### Reasons for Score
- **Rapid Decision Support**: Compares alternative landing sites and launch slips in <100 ms in a static offline browser, replacing hours of manual ephemeris batch querying in JPL Horizons and heavy GIS layer rendering in NASA Moon Trek.
- **Dual-Audience Adaptability**: Bridges the gap between space agency planners (Advanced mode with mission rules, stay presets, and window maps) and educators/public (Simple mode with plain-language summaries and no jargon).
- **Honest Functional Boundary**: Adheres strictly to NASA Space Apps truth-in-data guidelines: states "Sun visible" and "Earth in view", avoiding misleading claims of power or communication availability.
- **Deduction (-2)**: The tool does not calculate solar incidence angle on tilted solar arrays, cosine efficiency losses, thermal survival in shadows, or RF link margins for DSN stations. A mission planner cannot finalize a mission design without downstream engineering tools.

#### What Would Raise Score by +1 Point (to 9 / 10)
- Add a first-order **Solar Power Proxy** toggle (e.g., incident solar flux taking vertical cylindrical mast vs horizontal solar array orientation into account) and an Earth DTE ground-station rotation mask (showing DSN Goldstone/Madrid/Canberra visibility windows).

#### Three Most Likely Jury Questions & Weak Answers
1. **Jury Q**: *"Can a mission planner actually size a battery or solar array using your tool?"*  
   - **Weak Answer**: *"Yes, our metrics show the percentage of Sun visible and longest dark period."*  
   - **Strong Answer**: *"No, and we explicitly avoid that claim. Our tool models topocentric geometric line-of-sight against LOLA topography. Array output depends on cell temperature, incidence angle, and dust degradation; we provide the unocculted solar illumination input for those downstream thermal/power models."*
2. **Jury Q**: *"Seeing the Earth doesn't mean you can communicate—how do you handle Deep Space Network (DSN) ground station line of sight?"*  
   - **Weak Answer**: *"Earth is always in the same place in the lunar sky, so if you see Earth you have communication."*  
   - **Strong Answer**: *"While lunar libration keeps Earth in a narrow sky box, Earth rotates every 24 hours. A complete link requires both topocentric clearance over the crater rim (our tool) and an active DSN ground station facing the Moon. We model the lunar-horizon barrier, which is the primary terrain constraint at polar sites."*
3. **Jury Q**: *"How can high school teachers use this in a classroom without getting lost in aerospace coordinates?"*  
   - **Weak Answer**: *"They can use the tutorial button."*  
   - **Strong Answer**: *"We built 'Simple Mode' specifically for education: it removes all numerical coordinates and elevation angles, presenting a single sky plot and plain-language sentences ('The Sun is below the horizon; next sunrise in 3 days')."*

---

### 2.2 Creativity (Score: 8 / 10)

#### Reasons for Score
- **Zero-Backend Architecture**: Solves a complex planetary geometry problem entirely on client-side static web architecture. Pre-computing 720 rays with curvature drop and streaming compressed horizons enables instant multi-scenario comparisons without server costs or network latency.
- **Solar Disc Loupe**: Rather than treating the Sun as an idealized point source, the UI features an interactive loupe rendering the 0.53° solar disc being sliced by lunar ridges, giving immediate visual intuition of penumbral transitions.
- **Dynamic Mission Slip Slider**: The ability to scrub ±60 days and see multi-scenario timeline ribbons update simultaneously provides immediate tactile understanding of lunar illumination dynamics.
- **Deduction (-2)**: The 3D view is restricted to a local 2 km DEM mesh rather than full Moon rendering, and the custom coordinate feature relies on rotating the nearest site's ephemeris rather than computing arbitrary on-demand horizons.

#### What Would Raise Score by +1 Point (to 9 / 10)
- Implement an interactive **Lunar Sundial / Shadow Clock** mode in 3D that traces lander shadow patterns across a full lunar day, or an animated Earth Libration Lissajous trail in the polar sky plot.

#### Three Most Likely Jury Questions & Weak Answers
1. **Jury Q**: *"Why precalculate horizons instead of doing real-time raytracing over LOLA DEMs directly in WebGL shaders?"*  
   - **Weak Answer**: *"WebGL shaders were too difficult to write in time."*  
   - **Strong Answer**: *"A polar horizon at low elevation angles requires raymarching out to 150 km with lunar curvature. Over a 20 m DEM, that is 7,500 elevation samples per azimuth ray across 720 rays (5.4 million elevation lookups). Pre-computing these offline into a 720-float array reduces bandwidth to 3 KB per site and drops frame render times to <1 ms."*
2. **Jury Q**: *"Your solar loupe shows disc clipping, but doesn't it just use a straight line across the disc?"*  
   - **Weak Answer**: *"No, it shows the exact mountains."*  
   - **Strong Answer**: *"Yes, the loupe approximates the intersecting terrain as a tangent chord at the horizon elevation. At 0.53° angular diameter, distant crater rims 50 km away subtend several degrees of azimuth, making a local linear horizon approximation accurate to within 3% of disc area."*
3. **Jury Q**: *"How is this different from existing tools like NASA Moon Trek or LROC QuickMap?"*  
   - **Weak Answer**: *"Our tool is faster and looks more modern."*  
   - **Strong Answer**: *"Moon Trek and QuickMap are orbital GIS viewers: they look straight down from space and require server-side batch jobs for lighting simulations. Our tool is a topocentric surface navigator: it looks up from the lander's perspective, running side-by-side multi-site comparisons instantly in the browser without network requests."*

---

### 2.3 Validity (Scientific Credibility) (Score: 9 / 10)

#### Reasons for Score
- **Independent Cross-Validation**: 39 out of 39 automated checks pass (`web/public/data/validation.json`).
  - JPL Horizons ephemerides verified against independent discrete Julian-day queries with maximum error <0.0012°.
  - Dual implementation of metrics in Python (`pipeline/metrics.py`) and TypeScript (`src/lib/metrics.ts`) matching to $5.7 \times 10^{-14}$.
  - LOLA polar stereographic projection verified against IAU/USGS crater centres (Shackleton within 0.3 km, Shoemaker within 1.7 km).
  - Illumination benchmarks cross-checked against NASA PGDA 18.6-year polar illumination maps (Mazarico et al. 2011) within 2 percentage points.
- **Rigorous Physics Formulation**: Includes lunar mean radius ($R = 1737.4\text{ km}$), topocentric horizon curvature drop ($d^2 / 2R$), no atmospheric refraction, finite angular radii for Sun (0.2666°) and Earth (0.95°), and dual observer heights (2 m lander deck vs 10 m mast).
- **Data Provenance**: 100% of landing sites have documented source URLs from LROC and NASA NSSDCA; synthetic and approximate data are explicitly tagged.
- **Deduction (-1)**: Ephemeris validation checks JPL Horizons against JPL Horizons (different query format) rather than an independent SPICE kernel integration (e.g., NAIF SPICE kernels de440/moon_pa_de440), and LOLA interpolation noise in deep permanent shadows is not formally bounded.

#### What Would Raise Score by +1 Point (to 10 / 10)
- Incorporate direct cross-checks against NAIF SPICE kernel trajectories (`spiceypy`) and account for the non-spherical lunar gravitational figure (selenoid geoid variations).

#### Three Most Likely Jury Questions & Weak Answers
1. **Jury Q**: *"Your validation compares your ephemeris to JPL Horizons, but wasn't Horizons the source of your data in the first place?"*  
   - **Weak Answer**: *"Yes, but it proved our parser works."*  
   - **Strong Answer**: *"That is correct, and we explicitly document that limitation in `docs/method.md`. It validates parsing, unit conversion, and UTC timestamp alignment against an independent discrete query form; it is not an independent orbital mechanics model. Both derive from JPL's lunar ephemeris."*
2. **Jury Q**: *"The Moon has an 18.6-year nodal precession cycle that changes polar lighting—how valid is a 2-year dataset (2026–2028)?"*  
   - **Weak Answer**: *"Two years is enough for Artemis missions."*  
   - **Strong Answer**: *"The two-year window matches the active operational planning window for Artemis and CLPS (2026–2028). While long-term average illumination requires an 18.6-year integration (which we validate against via PGDA), operational missions need exact hourly topocentric positions for specific launch dates, which our dataset delivers."*
3. **Jury Q**: *"How do you handle DEM inaccuracies or interpolation voids in deep shadowed craters?"*  
   - **Weak Answer**: *"NASA LOLA data is completely accurate."*  
   - **Strong Answer**: *"We performed horizon sensitivity analysis across all 21 sites by coarsening the DEM $2\times$ and $4\times$ and jittering the site position. Horizon uncertainty ranges from 0.03° at the south pole landed site to 0.75° at Artemis Region 2, inducing less than 0.9 percentage point variations in Sun visible metrics for most sites."*

---

### 2.4 Relevance to the Challenge Brief (Score: 9 / 10)

#### Reasons for Score
- **Comprehensive Brief Alignment**: Fully delivers on every functional requirement listed in the NASA Space Apps challenge brief:
  - Curated library of 21 historical and planned sites (Apollo, CLPS, Artemis, international) + custom coordinates.
  - Side-by-side comparison board supporting 2 to 4 simultaneous site/date cards.
  - Mission date slip slider (±60 days) and dynamic date picker.
  - Polar sky plots and panorama strips with terrain-masked Sun and Earth trajectories.
  - Real-time countdowns to sunset, sunrise, Earthset, and Earthrise.
  - Comprehensive metrics panel (percent sunlit, longest dark stretch, Earth in view).
  - Multi-speed timeline animation with scrubber.
  - 3D interactive terrain view with dynamic sun-driven shadows and movable lander.
  - Accessible interfaces tailored for both planners and the general public.
- **Deduction (-1)**: Custom coordinates use a simplified client-side nearest-site rotation approximation when the optional backend service is absent, which cannot compute true local mountain horizons for arbitrary points.

#### What Would Raise Score by +1 Point (to 10 / 10)
- Client-side WebAssembly DEM raymarching worker capable of computing the exact 720-ray horizon for any arbitrary latitude and longitude on the Moon without external services.

#### Three Most Likely Jury Questions & Weak Answers
1. **Jury Q**: *"If I enter arbitrary custom coordinates, do I get the real mountain horizon?"*  
   - **Weak Answer**: *"Yes, it calculates the horizon for any point."*  
   - **Strong Answer**: *"If the optional backend DEM service is configured, yes. In the standalone static browser app, it uses a client-side approximation that applies nearest-site ephemeris rotation with an idealized spherical horizon, clearly flagged with an orange 'Approximate' badge."*
2. **Jury Q**: *"Does this tool support moving rovers (like VIPER or lunar terrain vehicles) traversing crater slopes?"*  
   - **Weak Answer**: *"Yes, you can drag the lander in 3D."*  
   - **Strong Answer**: *"In the 3D surface view, users can relocate the lander up to ±2 km using arrow keys and recalculate the local horizon and sunlight exposure in real time. However, it models stationary stops along a traverse, not a continuous dynamic kinematic path."*
3. **Jury Q**: *"How does the tool assist with landing site selection if missions have a 1–2 km landing ellipse?"*  
   - **Weak Answer**: *"Just pick the center point."*  
   - **Strong Answer**: *"We provide the 'Find Sunniest Spot' Web Worker feature in the 3D panel: it scans a 500 m, 1 km, or 2 km radius around the target coordinates, evaluating local illumination heatmaps to show how sunlight availability varies across the dispersion ellipse."*

---

### 2.5 Presentation (Score: 8 / 10)

#### Reasons for Score
- **Professional Telemetry Aesthetics**: Sleek, high-contrast dark theme reminiscent of mission operations control rooms; crisp SVG sky plots and responsive layouts.
- **Demonstration Architecture**: Built-in 2-minute live demo script, automated narration demo mode with video recorder (`.webm` download), and structured 15-second visual hook.
- **Accessibility & Internationalization**: Full keyboard navigation, visible focus rings, non-color-dependent status badges, and English interface with Polish live-presentation narration guidelines.
- **Deduction (-2)**:
  - `README.md` placeholder text ("Planned files (not yet in the repository)") damages remote evaluation.
  - Demo narration bug in `demoSteps.ts` reports wrong countdown hours at sunset.
  - The default density of the Advanced mode can visually overwhelm a non-technical judge if not guided smoothly.

#### What Would Raise Score by +1 Point (to 9 / 10)
- Commit actual screenshots to `docs/screenshots/` and display them prominently in `README.md`; fix the step 3 countdown caption bug; add a one-click "Big Screen / Projector Mode" that enlarges key telemetry numbers.

#### Three Most Likely Jury Questions & Weak Answers
1. **Jury Q**: *"Why should I look at this dense telemetry interface instead of a simple 3D video?"*  
   - **Weak Answer**: *"Our tool is made for serious engineers."*  
   - **Strong Answer**: *"A pre-rendered video cannot answer 'what if the launch slips 14 days?'. Our interface gives you both: a 1-click Simple mode for instant visual answers, and an interactive telemetry board where you can scrub dates and test mission rules live."*
2. **Jury Q**: *"What happens if your WebGL 3D view crashes on an auditorium projector?"*  
   - **Weak Answer**: *"It won't crash."*  
   - **Strong Answer**: *"Our core navigation relies entirely on 2D SVG and canvas (Polar Sky Plot and Panorama), which load with zero Three.js dependencies. The 3D view is lazy-loaded; if WebGL fails, 100% of comparison and planning features continue to work flawlessly."*
3. **Jury Q**: *"Can I share a specific scenario or mission window with my team?"*  
   - **Weak Answer**: *"You can take a screenshot."*  
   - **Strong Answer**: *"Every parameter—scenarios, dates, slip days, observer mast height, and active tab—is encoded directly into the URL hash. Clicking 'Share' copies a permalink that restores the exact multi-card workspace on any computer."*

---

## 3. Detailed Review Findings (Ordered by Severity)

### 1. `src/components/demo/demoSteps.ts:81-84`
- **Severity**: High
- **Issue**: Demo narration step 3 computes countdown from `startMs` instead of `cursorMs`, displaying an incorrect countdown while the cursor is already at sunset.
- **Failing Scenario**: During the live demo or recorded 30-s video, step 3 jumps `cursorH` directly to `sunsetH` (Sun touches the horizon). The caption displays: *"IM-2 Athena: Sun sets in 7 d 16 h (demo data)"*, confusing judges who see the Sun setting on screen right now.
- **Suggested Fix**:
```ts
// Calculate countdown from the current cursor timestamp, not window start:
const hoursUntil = Math.max(0, (firstSunset.ms - cursorMs) / HOUR_MS)
const countdownText = hoursUntil * 60 < 1 ? 'less than a minute' : formatDuration(hoursUntil)
```

### 2. `docs/demo-script.md:21`
- **Severity**: High
- **Issue**: Demo script wastes the first 15 seconds pointing out secondary UI controls rather than triggering the primary visual contrast preset.
- **Failing Scenario**: In a 2-minute jury presentation, the speaker spends 0:00–0:15 pointing to Tutorial (?), Demo, and mode toggles. The jury is disengaged before the comparative power of the tool is demonstrated.
- **DECISION**: Update `docs/demo-script.md` table to open with Apollo vs South Pole preset immediately at 0:00, hit Space at 0:05, and show the live disc loupe clipping by 0:12.

### 3. `README.md:9-16`
- **Severity**: High
- **Issue**: README explicitly lists planned screenshots as missing ("Planned files (not yet in the repository)"), creating an impression of an incomplete project for remote jurors.
- **Failing Scenario**: A jury member grading the project asynchronously clicks the GitHub repository link, sees missing screenshot placeholders, and assumes the UI was never finished.
- **DECISION**: Take clean 1280×800 screenshots of the 6 planned views, save them to `docs/screenshots/`, and embed them directly in `README.md`.

### 4. `docs/pitch.md:34-39` vs `src/config/presets.ts:25-27`
- **Severity**: Medium
- **Issue**: The pitch deck table quotes numbers for a 14-day mission in January 2027 (6.8% to 94.0%), while the live app preset runs a 30-day window in October 2027 (52% to 8%).
- **Failing Scenario**: A judge checks the numbers on slide 4 against the live screen running the "Same site, 14 days later" preset and sees an apparent discrepancy.
- **Suggested Fix**: Add an explicit footnote in `docs/pitch.md` clarifying that the slide highlights the peak dynamic range window (January 2027), whereas the default interactive preset demonstrates an October 2027 window.

### 5. `src/components/badges/DataBadges.tsx:17-31`
- **Severity**: Medium
- **Issue**: Synthetic/Approximate badges lack contextual detail explaining why candidate regions carry them.
- **Failing Scenario**: A juror asks: *"Why is Artemis Region 1 marked Approximate?"* The presenter must pause the demo to explain NASA's NAC mosaic coordinate convention.
- **Suggested Fix**:
```tsx
<span className="badge badge--approximate" title={approximateReason ?? "Real LOLA terrain with LROC ROI reference coordinates."}>
  Approximate
</span>
```

### 6. `src/app/TopBar.tsx:47-53`
- **Severity**: Medium
- **Issue**: Tutorial button triggers a multi-step modal overlay that can trap a presenter during a live 2-minute demo.
- **Failing Scenario**: Presenter accidentally clicks `(?) Tutorial`; full-screen dark scrim covers scenario cards with no obvious single-click dismiss.
- **Suggested Fix**: Ensure pressing `Escape` immediately calls `closeTour()`, and add a prominent "Skip / Exit Tutorial" button to every step card.

### 7. `src/viz3d/SurfaceView.tsx:56-60`
- **Severity**: Medium
- **Issue**: 3D badge states `Approximate (terrain patch only)`, misleading judges into believing distant mountain horizons are omitted.
- **Failing Scenario**: A planetary scientist judge questions whether shadows account for crater rims 40 km away.
- **Suggested Fix**: Change badge text to `Local 3D mesh (distant horizon to 150 km included)`.

### 8. `src/components/compare/CompareTable.tsx:59-60`
- **Severity**: Medium
- **Issue**: Full comparison table blocks on loading state if any single scenario is pending.
- **Failing Scenario**: Adding a distant site causes the whole comparison table to show a spinner rather than displaying cached site metrics progressively.
- **Suggested Fix**: Render table rows progressively, showing skeleton loading indicators only in the column corresponding to the pending bundle.

### 9. `docs/demo-script.md:45-48`
- **Severity**: Low
- **Issue**: Projector fallback relies on browser zoom, which can cause font clipping or uneven column wrapping on low-resolution 720p hall displays.
- **Failing Scenario**: On an old 1024×768 or 1280×720 projector, scenario cards wrap onto two lines, pushing the timeline below the fold.
- **Suggested Fix**: Add CSS media query `@media (max-height: 800px)` adjusting card padding and chart height to guarantee single-screen fit.

### 10. `src/app/PresetBar.tsx:23`
- **Severity**: Low
- **Issue**: Featured demo preset lacks an explicit accessible badge or visual callout indicating it is the primary hook.
- **Failing Scenario**: A guest navigating the app independently does not realize the first preset is the premier comparison showcase.
- **Suggested Fix**: Add a subtle "Demo Hook" tag or distinct border highlight to `PRESET_APOLLO_VS_ARTEMIS`.

---

## 4. Verification & Status Summary

- **Typecheck**: `npm run typecheck` passed (exit code 0).
- **Unit & Integration Tests**: 93 test files passed, 932 tests passed (exit code 0).
- **Offline / Dev Server**: Checked `http://localhost:5173` (not running, server was not started per brief rules).
- **Contract & Wording Compliance**: Strict compliance with "Sun visible" and "Earth in view"; no claims of power or radio link availability.
