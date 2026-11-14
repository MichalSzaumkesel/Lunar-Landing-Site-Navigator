# Lunar Landing Site Navigator

Lunar Landing Site Navigator is an interactive web application for comparing lunar landing sites and dates side by side to evaluate solar illumination and Earth line-of-sight visibility across candidate mission windows. Designed for mission planners, science communicators, and educators, it models terrain horizon masking, partial solar disc clipping, and Earth visibility directly in the browser without requiring a backend server.

NASA Space Apps Challenge 2026 — Local Event Rzeszów.

## Screenshots

*Screenshots will be added following final UI stabilization (placeholder list):*
- `docs/screenshots/01-side-by-side-comparison.png` — Multi-scenario comparison card view (equatorial vs south pole)
- `docs/screenshots/02-polar-sky-plot-and-loupe.png` — D3 polar sky plot with solar disc limb clipping in the loupe
- `docs/screenshots/03-surface-3d-shadows.png` — Three.js 3D terrain patch with dynamic sun shadows and lander positioning
- `docs/screenshots/04-sunniest-spot-heatmap.png` — 2D sunlight heatmap overlay and optimal landing spot search result
- `docs/screenshots/05-window-map-matrix.png` — Multi-site mission rules window finder matrix
- `docs/screenshots/06-simple-mode.png` — Simplified view with plain-language visibility summaries

## Features

### Compare
- **Side-by-side comparison**: View up to 4 scenario cards simultaneously (`ScenarioBoard`), comparing different sites or different landing dates for the same site.
- **One-click presets**: Instant comparison scenarios including *Apollo 11 (equator) vs Artemis candidate region (south pole)*, *14-day mission slip*, and *CLPS south-pole lander*.
- **Direct metrics comparison**: Side-by-side readouts of Sun visible percentage, longest continuous dark period (hours), Earth in view percentage, and countdowns to next rise/set events.
- **Observer height toggle**: Compare illumination clearance at 2 m (surface instrument) vs 10 m (lander mast).

### Time
- **Unified transport**: Global Play/Pause transport with adjustable playback speed (1 h/s, 2 h/s, 6 h/s, 12 h/s, 1 d/s, 2 d/s, 3 d/s) and interactive time scrubber.
- **Relative time cursor**: Synchronized relative timeline offset (`cursorH` in hours from window start) keeps scenarios with differing calendar dates playing in lockstep.
- **Mission slip slider**: Adjust launch/landing delays (-30 to +30 days) to immediately evaluate how orbital slips change illumination and shadow conditions.
- **Real-time countdowns**: Dynamic timers indicating exact duration until the next sunrise, sunset, Earth-rise, or Earth-set from current cursor time.
- **Strict UTC standards**: All timestamps formatted in UTC ISO 8601 with trailing `Z`.

### Sky
- **D3 Polar Sky Plot**: Stereographic polar projection mapping the local 360° horizon profile with animated Sun and Earth paths.
- **Panorama View**: Cylindrical 360° azimuth (-15° to +90° elevation) unwrapped projection of celestial paths against terrain.
- **Solar Loupe**: High-magnification telescopic view computing the exact unblocked solar disc fraction (0–100%) during ridge limb clipping.
- **Timeline Event Chips**: Visual markers along the timeline indicating exact sunrise, sunset, earthrise, and earthset transitions.
- **Standardized status indicators**: Explicit state readouts: *Sun visible*, *Sun below horizon*, *Earth in view*, and *Earth below horizon*.

### 3D Surface View
- **Three.js WebGL terrain**: High-performance local terrain patch rendering lazy-loaded on demand (`React.lazy`) to ensure light initial page weight.
- **Dynamic real-time shadows**: Surface shadow casting updated instantaneously from the Sun's azimuth and elevation at the current time cursor.
- **Dual camera modes**: First-person surface observer perspective and orbital birds-eye perspective.
- **Quick camera orientation**: Snap view directly toward the Sun or Earth with a single click.
- **Movable lander simulation**: Interactively reposition the lander across the terrain patch with real-time recalculated local horizon and illumination differences.
- **Sunlight Heatmap**: 2D illumination grid overlay displaying cumulative sunlight percentage across the entire mission window.
- **"Find sunniest spot"**: Worker-based background grid search locating coordinates with maximal sun exposure within a selectable search radius (500 m, 1000 m, 2000 m).
- **Textured Earth disc**: NASA Blue Marble Earth disc oriented according to ephemeris coordinates.

### Planning
- **Configurable Mission Rules**: Set requirements for mission duration (e.g. 72 h, 168 h, 240 h, 336 h), minimum sunlit percentage, maximum dark period, Earth line-of-sight, and landing sun elevation.
- **Timeline Mission Bar**: Visual indicator showing whether candidate landing times meet all mission rules (green) or fail (red), with failing criteria identified.
- **Window Map**: 2D site-by-date matrix computed in a Web Worker, scanning valid mission landing windows across the entire ephemeris coverage.
- **Moon Map**: Interactive orthographic lunar globe displaying site markers, subsolar point, and day/night terminator.
- **Site Library**: Catalog of lunar landing sites with status, coordinates, and provenance notes.
- **Custom Site Coordinates**: Input custom lunar latitude and longitude with client-side ephemeris rotation.

### Sharing and Export
- **Deep-link state sharing**: Entire workspace state (scenarios, sites, dates, slip, observer height, active view) encoded directly into URL query parameters.
- **CSV export**: Download hourly time series (UTC time, Sun/Earth azimuth, elevation, and visibility) for external analysis.
- **Built-in 30 s Video Recorder**: Automated capture and download of a 30-second WebM demonstration video directly from the browser tab (`Record video` button).

### Accessibility
- **Full keyboard navigation**: Complete control via keyboard (Tab, Arrow keys for timelines/sliders, Space for Play/Pause, Home/End for tab switching).
- **Visible focus styling**: High-contrast outline focus rings across all interactive controls.
- **Non-color reliance**: Color is never the sole carrier of status; paired with text labels, distinct badges, and iconography.
- **Reduced motion**: Adheres to `prefers-reduced-motion`; demo mode and playback require explicit user interaction to start.
- **Ergonomic targets and typography**: Minimum 40 px touch targets; minimum 14 px body text and 12 px SVG typography.
- **Accessible semantics**: Rigorous ARIA roles (`role="tablist"`, `role="tabpanel"`, `role="region"`, `role="group"`, `aria-live="polite"`).
- **Simple Mode**: Dedicated high-accessibility view with a single sky plot and plain-language summaries for education and public demonstrations.
- **Guided Tutorial**: Built-in interactive step-by-step walkthrough (`(?) Tutorial`).

### Sound
- **Synthesized audio cues**: Web Audio API oscillator synthesis for celestial events (sunrise, sunset, earthrise, earthset) and ambient illumination sonification (no external audio assets).
- **Volume and mute controls**: Sound is off by default with accessible controls in the toolbar.

## Quick Start

### Prerequisites
- Node.js 20+ (Node.js 24 recommended)
- npm

### Installation and Development

```bash
# Navigate to web application directory
cd web

# Install exact dependencies
npm ci

# Start local development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build and Test Scripts

Run these scripts from the `web/` directory:

```bash
# Typecheck TypeScript codebase
npm run typecheck

# Run test suite with Vitest
npm test

# Build production bundle to dist/
npm run build

# Preview production build locally
npm run preview

# Lint codebase with Oxlint
npm run lint

# Regenerate synthetic mock datasets
npm run gen:mocks
```

## Data Architecture and Contract

- **Contract Specification**: All data structures and file conventions follow the [Data Contract](docs/contract.md) (version 1.1.1).
- **Mock vs. Real Data**:
  - The application currently operates on synthetic mock datasets (`web/public/data/mock/`) generated via analytic models (`web/scripts/gen-mocks.mjs`).
  - Real data will be produced offline by Scope A from NASA LOLA (Lunar Orbiter Laser Altimeter) digital elevation models and JPL Horizons ephemerides.
- **Loader Switching**: The site bundle loader (`web/src/lib/loader.ts`) checks for real datasets in `web/public/data/<site_id>/` and automatically falls back to `web/public/data/mock/<site_id>/` per site.
- **Data Labelling**:
  - Datasets with `synthetic: true` display a visible `Synthetic data` badge.
  - Approximate datasets or derived custom site coordinates carry an `Approximate` badge.
  - Derived attributes (such as Earth phase, solar limb clipping, and local terrain horizon) are explicitly labelled as derived approximations.

## Environment Variables

The web application supports configuration through environment variables (e.g. in `.env` or during build):

| Variable | Default | Description |
|---|---|---|
| `VITE_BASE` | `/` | Base URL path for assets. Set to `/<repository-name>/` for GitHub Pages deployment. |
| `VITE_USE_MOCK` | `0` (unset) | Set to `1` to force the loader to use synthetic mock data even when real data is present. |
| `VITE_API_URL` | `null` (unset) | Optional URL of an external custom-site calculation backend service (`${VITE_API_URL}/api/custom-site`). Automatically injected into the CSP `connect-src` during build. |

## Deployment

### GitHub Pages (Automated Workflow)
A GitHub Actions workflow is provided at [.github/workflows/deploy-web.yml](.github/workflows/deploy-web.yml).
1. The repository owner must enable GitHub Pages: navigate to **Settings > Pages**, set **Source** to **GitHub Actions**. *(Note: GitHub Pages on private repositories requires a paid GitHub plan).*
2. On every push to `main` touching `web/**` or the workflow file, the workflow runs `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` (with `VITE_BASE: /${{ github.event.repository.name }}/`), then deploys the resulting `web/dist` directory to GitHub Pages.

### Vercel (Alternative Static Hosting)
Vercel can host the static build directly from the repository:
- **Framework Preset**: Vite
- **Root Directory**: `web`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: `VITE_BASE=/` (default)

## Project Structure

```
├── CLAUDE.md                   # Shared developer instructions and physics notes
├── CRITICAL.md                 # Cross-scope communication notices
├── README.md                   # This file
├── .github/workflows/
│   └── deploy-web.yml          # GitHub Actions deployment to GitHub Pages
├── docs/
│   ├── contract.md             # Data contract between Scope A (pipeline) and Scope B (web)
│   ├── demo-script.md          # 2-minute live demo script and 30-second video storyboard
│   ├── scope-A-data.md         # Scope A (science, elevation, Horizons pipeline) brief
│   ├── scope-B-web.md          # Scope B (web application and visualization) brief
│   └── status-B.md             # Development status and architecture notes
└── web/                        # Static Vite + React + TypeScript web application
    ├── public/
    │   ├── data/mock/          # Synthetic mock datasets (sites, horizons, ephemeris)
    │   └── textures/earth/     # NASA Blue Marble Earth texture and credits
    ├── scripts/
    │   └── gen-mocks.mjs       # Mock data generator script
    ├── src/
    │   ├── app/                # App shell, TopBar, Transport, Panels, Tools
    │   ├── components/         # Feature components (sky, scenario, finder, demo, help, sound)
    │   ├── config/             # Preset configurations and data ranges
    │   ├── lib/                # Pure computation modules (horizon, ephem, metrics, finder, loader)
    │   ├── state/              # Zustand global store, selectors, playback loop, URL sync
    │   └── viz3d/              # Three.js 3D surface view, sunlight heatmap, best spot search
    ├── package.json            # Dependencies and scripts
    ├── tsconfig.json           # TypeScript configuration
    └── vite.config.ts          # Vite build, CSP header generation, and Vitest configuration
```

## Credits and Licences

### Earth Imagery
- **NASA Blue Marble**: Earth disc textures (`land_ocean_ice_2048.jpg`, `cloud_combined_2048.jpg`) located in `web/public/textures/earth/`.
  - **Credit**: NASA Goddard Space Flight Center. Land surface, shallow water and cloud images by Reto Stockli; ocean colour, compositing and enhancements by Robert Simmon.
  - **Source**: [NASA Earth Observatory Blue Marble](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution) (Public Domain / NASA Open Data policy). Full notice in [web/public/textures/earth/CREDITS.txt](web/public/textures/earth/CREDITS.txt).

### Typography
- The application uses the system native font stack (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`). No custom font files or Inter assets are bundled or loaded.

### Open Source Libraries
This project relies on open source software (see [web/package.json](web/package.json)):
- **React 19** & **React DOM** — MIT Licence (Meta Platforms, Inc.)
- **Three.js** — MIT Licence (Ricardo Cabello / mrdoob)
- **D3** — ISC Licence (Mike Bostock)
- **Zustand** — MIT Licence (Paul Henschel / Daishi Kato)
- **Vite** — MIT Licence (Evan You / Vite Contributors)
- **Vitest** — MIT Licence (Vitest Contributors)
- **TypeScript** — Apache 2.0 Licence (Microsoft Corporation)
- **Oxlint** — MIT Licence (The JavaScript Oxidizer Project)

## Honest Limitations

- **Mock Data Pending Scope A Delivery**: The web application currently runs on synthetic mock datasets ([web/public/data/mock/sites.json](web/public/data/mock/sites.json)). True lunar terrain masks and ephemerides will be populated once Scope A delivers offline pipeline outputs.
- **Approximate Custom Sites**: When entering arbitrary custom coordinates without an active backend API, ephemeris values are derived by rotating the nearest loaded site's ephemeris in the Moon-fixed frame. Earth parallax (up to ~0.26°) is neglected, and the result is labelled `Approximate`.
- **Local Terrain Patch in 3D**: The 3D surface visualization renders a 20.48 km × 20.48 km local elevation patch around the site. It models local horizon obscuration and surface shadows within the patch, not global Moon-wide raytracing.
- **Not a Flight-Planning Tool**: This application provides geometric line-of-sight analysis only. It does not calculate orbital transfer trajectories, descent fuel burns, landing navigation hazards, surface trafficability, or spacecraft dynamics.
- **No Power or Communication Guarantees**: The application reports "Sun visible", "Sun below horizon", and "Earth in view". It makes no guarantees regarding solar array power generation, thermal survival, battery state-of-charge, or radio frequency communication link margin.

## How This Was Built

This project was built for the NASA Space Apps Challenge 2026 (Rzeszów local event) using a two-person scope split: Scope A focused on scientific data processing (LOLA digital elevation models, JPL Horizons ephemerides, and pipeline validation), while Scope B developed the interactive web application, UI/UX, and 3D visualization.

Development was AI-assisted: architecture, review, and integration were guided by the scope lead with Claude (Opus), delegating well-specified pure functions, test cases, and boilerplate to Gemini 3.8 Flash (agy) and Sonnet teammates for visual iteration. Preparation and design planning occurred locally prior to the official event start, followed by live repository implementation starting at 09:03 CET on 2026-11-14.
