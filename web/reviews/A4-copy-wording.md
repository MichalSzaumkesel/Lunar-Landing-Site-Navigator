# Review A4: Wording and Copy Audit

## Summary (Top 5 Findings)
- HIGH: Forbidden claims of solar power, heat, and direct radio communication in MetricsPanel note (`MetricsPanel.tsx:104`).
- HIGH: Non-neutral value judgment declaring "Best site" in mission window finder (`windowMapView.ts:229`).
- HIGH: Non-standard terms "Sunlight map" and "sunniest spot" instead of "Sun visible" in 3D surface view (`SurfaceView.tsx:919, 949`).
- HIGH: Unprofessional and colloquial "Fake data" wording in synthetic badge tooltip (`DataBadges.tsx:21`).
- MEDIUM: Internal developer contract specification references leaked in user-facing form tooltips (`MissionRulesForm.tsx:218`).

---

## Findings (Ordered by Severity)

### Finding 1
- **Severity**: high
- **Location**: `src/components/scenario/MetricsPanel.tsx:104`
- **Description**: Explicitly claims power, heat, and radio communication availability in user-visible text. Hard quality rule strictly prohibits claiming power, energy, signal, link, or communication availability, permitting only "Sun visible" and "Earth in view".
- **Evidence**: Line 104 states: `"Sun visible matters for solar power and heat. Earth in view is needed for direct-to-Earth radio. This tool shows geometry only, not power or link guarantees."`
- **Suggested Fix**:
  ```tsx
  <p className="metrics__note">
    This tool shows geometry only: Sun visible and Earth in view above the local terrain horizon, not power or communication availability.
  </p>
  ```

### Finding 2
- **Severity**: high
- **Location**: `src/components/finder/windowMapView.ts:229`
- **Description**: Declares an evaluative verdict ("Best site") violating the challenge rule of objective neutrality ("no verdict", "forbidden: ['best site']").
- **Evidence**: `windowMapView.ts:229` returns ``Best site: ${best.name} (${best.validDays} valid ${dayWord})``, which is rendered directly in the window map header.
- **Suggested Fix**:
  ```ts
  return `Most valid landing days: ${best.name} (${best.validDays} ${dayWord})`
  ```

### Finding 3
- **Severity**: high
- **Location**: `src/viz3d/SurfaceView.tsx:919`, `src/viz3d/SurfaceView.tsx:949`
- **Description**: Uses non-standard terms "Sunlight map" and "sunniest spot" instead of the required standard concept "Sun visible", creating inconsistency with `PoleMap.tsx` ("Illumination heatmap") and `SurfaceView.tsx:1085` ("Sun visible map").
- **Evidence**: Line 919 button text is `"Sunlight map"`, line 949 button text is `"Find sunniest spot"`, and line 925 sets `aria-label="Sunniest spot search"`.
- **Suggested Fix**:
  ```tsx
  // SurfaceView.tsx:919
  <button type="button" aria-pressed={showHeatmap} onClick={() => setShowHeatmap((prev) => !prev)}>
    Sun visible map
  </button>
  // SurfaceView.tsx:949
  <button type="button" disabled={isSearching} onClick={handleFindBestSpot}>
    Find spot with most Sun visible
  </button>
  ```

### Finding 4
- **Severity**: high
- **Location**: `src/components/badges/DataBadges.tsx:21`
- **Description**: Tooltip uses colloquial and awkward English ("Fake data") rather than the established scientific terminology "Synthetic data".
- **Evidence**: Line 21 has `title="Fake data for interface development, not a measurement."`
- **Suggested Fix**:
  ```tsx
  title="Synthetic test data for interface development, not an observational measurement."
  ```

### Finding 5
- **Severity**: medium
- **Location**: `src/config/presets.ts:45`
- **Description**: Preset title is excessively long (67 characters) and wraps awkwardly in menus and dropdowns.
- **Evidence**: Line 45 defines `label: 'Compare: Apollo 11 (equator) vs South Pole (Artemis candidate region)'` which is rendered as a primary action title in `AddScenarioMenu.tsx:201`.
- **Suggested Fix**:
  ```ts
  label: 'Apollo 11 vs South Pole',
  description: 'Two cards with the same dates: equator versus Artemis candidate region on the south pole horizon.',
  ```

### Finding 6
- **Severity**: medium
- **Location**: `src/components/finder/MissionRulesForm.tsx:218`, `src/components/finder/MissionRulesForm.tsx:244`, `src/components/finder/MissionRulesForm.tsx:270`, `src/components/finder/MissionRulesForm.tsx:299`, `src/components/finder/MissionRulesForm.tsx:315`, `src/components/finder/MissionRulesForm.tsx:341`
- **Description**: Internal software contract references (`contract §3: ...`) are exposed to end users in HTML `title` attributes on labels and duplicated on input elements.
- **Evidence**: Lines 218 & 234: `title="Total mission duration on the lunar surface (contract §3: missionDurationH, 1 to 1440 hours)"`; Lines 244 & 260: `title="Required minimum percentage of mission duration with the Sun visible above horizon (contract §3: minPctSunlit, 0 to 100%)"`.
- **Suggested Fix**: Remove developer contract citations from user tooltips and deduplicate titles from inputs:
  ```tsx
  // On <label> only; omit title from <input>:
  title="Total mission duration on the lunar surface (1 to 1440 hours)."
  title="Minimum percentage of mission duration with the Sun visible above the horizon (0 to 100%)."
  ```

### Finding 7
- **Severity**: medium
- **Location**: `src/components/simple/PlacePicker.tsx:160` vs `src/components/library/SiteLibrary.tsx:146`
- **Description**: Inconsistent terminology for candidate lunar locations between Simple mode ("Place") and Advanced mode ("Site"). DECISION: Lead should decide whether the simplification to "Place" in Simple mode is intentional or should be unified to "Site".
- **Evidence**: Simple mode uses `aria-label="Pick a place on the Moon"`, `"Choose a place on the Moon"`, `"Search places"`, while Advanced mode uses `"Site Library"`, `"Search sites"`, `"Use this site"`, `"Site ID"`.
- **Suggested Fix**: Standardize on "landing site" across both modes, or document intentional mode-specific vocabulary in UI guidelines.
  ```tsx
  aria-label="Pick a landing site on the Moon"
  ```

### Finding 8
- **Severity**: medium
- **Location**: `src/components/simple/placeLabels.ts:18` vs `src/components/scenario/cardLogic.ts:9` vs `src/components/library/SiteLibrary.tsx:24`
- **Description**: Inconsistent naming of site categories across components.
- **Evidence**: `artemis_region` is called "Possible future landing zone" in Simple mode (`placeLabels.ts:45`), "Artemis candidate region" in scenario cards (`cardLogic.ts:14`), "Artemis Candidate Regions" in Site Library (`SiteLibrary.tsx:29`), and "Artemis" in Map Panel (`MapPanel.tsx:377`). Similarly, `clps` is "Other landers" / "Lander site" in Simple mode, "CLPS site" in cards, and "Commercial Lunar Payload Services (CLPS)" in Site Library.
- **Suggested Fix**: Harmonize category naming definitions in a shared configuration so every view uses consistent canonical short and full names.

### Finding 9
- **Severity**: medium
- **Location**: `src/components/simple/simpleSummary.ts:167, 194` vs `src/components/scenario/cardLogic.ts:225, 243` vs `src/components/compare/compareLogic.ts:33, 54`
- **Description**: Inconsistent metric labels for the same statistical concepts across views.
- **Evidence**: Simple mode uses `"Sun visible over the window"`, scenario cards use `"Sun visible"`, and CompareTable uses `"Sun visible (% of window)"`.
- **Suggested Fix**: Use the standard base label `"Sun visible"` and `"Earth in view"` across all views, delegating the window context to descriptions or subtitles.

### Finding 10
- **Severity**: medium
- **Location**: `src/components/simple/simpleSummary.ts:153` vs `src/components/scenario/MetricsPanel.tsx:85` vs `src/components/print/printHelpers.ts:69`
- **Description**: Inconsistent casing and phrasing for zero mast height delta.
- **Evidence**: `simpleSummary.ts:153` returns `"No difference"`, while `MetricsPanel.tsx:85` returns `'no difference'` (lowercase), and `printHelpers.ts:69` returns `'no difference'`.
- **Suggested Fix**: Use sentence case consistently across components: `"No difference"`.

### Finding 11
- **Severity**: medium
- **Location**: `src/components/scenario/cardLogic.ts:77` vs `src/components/scenario/cardLogic.ts:72`
- **Description**: Inconsistent and colloquial phrasing for absence of events.
- **Evidence**: Line 72 uses `"No dark stretch in this window"`, but line 77 uses `"No gap in this window"` (vague colloquialism). In `simpleSummary.ts:115`, it returns `"None in this window"`.
- **Suggested Fix**:
  ```ts
  export function longestNoEarthLine(h: number): string {
    return h > 0 ? `Longest without Earth ${formatDuration(h)}` : 'Earth continuously in view in this window'
  }
  ```

### Finding 12
- **Severity**: medium
- **Location**: `src/components/chart/elevationSeries.ts:70` vs `src/components/scenario/cardLogic.ts:208` vs `src/components/finder/MissionRulesForm.tsx:344`
- **Description**: Inconsistent angle unit formatting on the same card interface (`°` vs `deg` vs `degrees`).
- **Evidence**: Elevation chart header displays `+4.3°`, while the MetricsPanel row directly underneath displays `+4.30 deg`, and MissionRulesForm displays `degrees`.
- **Suggested Fix**: Standardize angle display: use symbol `°` for visual readouts and chart labels (`+4.3°`), or define a uniform unit convention (`deg`) across all metric tables.

### Finding 13
- **Severity**: medium
- **Location**: `src/components/scenario/cardLogic.ts:199` vs `src/components/simple/simpleSummary.ts:147` vs `src/components/finder/windowMapView.ts:395`
- **Description**: Inconsistent spacing before the percent symbol (`%`).
- **Evidence**: `cardLogic.ts:199` and `printHelpers.ts:57` insert a space: `"85.0 %"`, whereas `simpleSummary.ts:147`, `windowMapView.ts:395`, and `PoleMap.tsx:504` omit it: `"85%"`.
- **Suggested Fix**: Standardize on a single convention across the app (either no space `"85.0%"` or consistent space `"85.0 %"`).

### Finding 14
- **Severity**: medium
- **Location**: `src/components/sky/geometry.ts:324` vs `src/components/scenario/cardLogic.ts:56` vs `src/components/simple/simpleSummary.ts:80`
- **Description**: Inconsistent duration formatting across views. `geometry.ts:324` prescribes `fmtHours` (`"374.0 h"`) as the single duration format, but other components invent divergent representations.
- **Evidence**: A 72-hour duration renders as `"72.0 h"` in MetricsPanel, `"3 d"` in Countdowns (`cardLogic.ts:67`), `"72 h"` in PrintBrief (`printHelpers.ts:116`), and `"72 hours (about 3 days)"` in Simple mode (`simpleSummary.ts:85`).
- **Suggested Fix**: Formalize two distinct format tiers in `geometry.ts`: compact numeric (`72.0 h`) for dashboards/cards and conversational (`72 hours (3 days)`) for prose summaries.

### Finding 15
- **Severity**: medium
- **Location**: `src/components/print/printHelpers.ts:171`
- **Description**: Printable brief provenance table lists internal DEM and JPL Horizons IDs but omits the primary site source title and URL.
- **Evidence**: `formatProvenance` outputs `Real data · Site ID: southpole_landed · DEM: LOLA_30m · JPL Horizons ID: 301`, omitting `bundle.site.source.title` and `bundle.site.source.url`.
- **Suggested Fix**:
  ```ts
  const src = bundle.site?.source?.title ? ` · Source: ${bundle.site.source.title}` : ''
  return `Real data · Site ID: ${siteId}${src}${dem}${ephemQuery}`
  ```

### Finding 16
- **Severity**: low
- **Location**: `src/app/Transport.tsx:67` vs `src/components/sky/geometry.ts:329`
- **Description**: Scrubber timestamp in bottom transport bar renders raw ISO date without explicit UTC designation, conflicting with the quality rule: "Times are UTC and say so".
- **Evidence**: `Transport.tsx:67` renders `{scenarioCursorUtc(active, cursorH)} · +0.0 h` which outputs `2027-10-06T00:00:00Z · +0.0 h`.
- **Suggested Fix**: Use `fmtUtc(cursorMs)` from `geometry.ts` to display `2027-10-06 00:00 UTC · +0.0 h`.

### Finding 17
- **Severity**: low
- **Location**: `src/components/map/PoleMap.tsx:508`
- **Description**: Pole map heatmap legend renders raw ISO timestamp strings directly into the DOM.
- **Evidence**: Line 508 renders `{activeHeat.grid.periodStart && `, ${activeHeat.grid.periodStart} to ${activeHeat.grid.periodEnd}`}`, showing e.g. `, 2027-01-01T00:00:00Z to 2027-01-15T00:00:00Z`.
- **Suggested Fix**: Slice or format dates to readable UTC days:
  ```tsx
  {activeHeat.grid.periodStart && `, ${activeHeat.grid.periodStart.slice(0, 10)} to ${activeHeat.grid.periodEnd.slice(0, 10)} UTC`}
  ```

### Finding 18
- **Severity**: low
- **Location**: `src/components/help/tourSteps.ts:94`
- **Description**: Grammatically awkward run-on sentence in tour step description for Views.
- **Evidence**: `"Polar: the sky seen from above, rim is the horizon and the centre is the elevation named in the Zoom label under the plot (straight up only at 90°)."`
- **Suggested Fix**:
  ```ts
  text: 'Polar: the sky seen from above, where the outer rim is the horizon and the centre is the zenith or zoomed elevation. Panorama: the 360° horizon unrolled. 3D: the local terrain with dynamic shadows.'
  ```

### Finding 19
- **Severity**: low
- **Location**: `src/app/TopBar.tsx:85`
- **Description**: Uses raw ASCII characters `(?)` in the tutorial button icon.
- **Evidence**: Line 85 contains `<span aria-hidden="true">(?)</span> Tutorial`.
- **Suggested Fix**: Replace text `(?)` with an SVG icon or consistent `?` glyph matching `SkyHelp.tsx`.

### Finding 20
- **Severity**: low
- **Location**: `src/components/finder/MissionRulesForm.tsx:372`
- **Description**: Redundant and over-long button tooltip re-listing all parameter values.
- **Evidence**: `title="Restore example mission rules (240 h, 70% Sun, 48 h dark stretch, Earth at landing, 50% Earth)"` on a button labeled "Reset to example mission".
- **Suggested Fix**: Simplify to `title="Restore default example mission rules."`.

### Finding 21
- **Severity**: low
- **Location**: `src/components/library/SiteLibrary.tsx:246`
- **Description**: Casual and unpolished fallback label when a site has no external source URL.
- **Evidence**: Line 246 renders `{site.source.title || 'Mock data, no source'}`.
- **Suggested Fix**: Replace with `'Synthetic test site (no external source)'`.

### Finding 22
- **Severity**: low
- **Location**: `src/components/simple/SkyHelp.tsx:13`
- **Description**: 3D terrain credit line references NASA Blue Marble for Earth imagery without a source link or URL.
- **Evidence**: Line 13 returns `Terrain: ${terrain}. Earth imagery: NASA Blue Marble.` without a reference URL.
- **Suggested Fix**: Update credit to reference NASA Visible Earth with URL in About Data documentation.

### Finding 23
- **Severity**: low
- **Location**: `src/components/map/MapPanel.tsx:351`
- **Description**: Custom point form explanation mentions approximate spherical horizon model without referencing the project methodology document.
- **Evidence**: Line 351 states: `"Custom points use a smooth horizon and the ephemeris of the nearest site (approximate)."`
- **Suggested Fix**: Add link or reference: `"Custom points use a smooth horizon and ephemeris of the nearest site (approximate; see docs/method.md)."`

### Finding 24
- **Severity**: low
- **Location**: `src/components/chart/elevationSeries.ts:70` vs `src/components/scenario/cardLogic.ts:52`
- **Description**: Inconsistent minus sign character: ASCII hyphen-minus (`-`, U+002D) versus typographic Unicode minus (`−`, U+2212).
- **Evidence**: `formatElevationDeg(-1.84)` outputs `"-1.8°"`, while `formatSlip(-14)` outputs `"slip −14 d"`, and CompareTable outputs `"−0.85 deg"`.
- **Suggested Fix**: Use Unicode minus `−` (`\u2212`) consistently across all formatted negative values.
