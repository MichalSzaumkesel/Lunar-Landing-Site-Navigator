# Task W12: app logo, brand variants and favicon set

Write the files first, then test (see `_common.md`). Keep the work lean: hand-write the SVG masters, generate everything else with one small script. Do not add npm dependencies to `package.json` or the lockfile.

## Writable paths

`web/public/brand/**`, `web/public/favicon.*`, `web/public/apple-touch-icon.png`, `web/public/site.webmanifest`, `web/public/safari-pinned-tab.svg`, `web/scripts/logo/**`, `web/index.html` (only the `<head>` icon, manifest and theme-color tags). Nothing else.

## Design

App: "Lunar Landing Site Navigator", a tool that shows the Sun and Earth over a local lunar horizon. Concept for the mark: a dark round badge or a plain circle containing a jagged lunar horizon silhouette across the lower third, a gold Sun disc rising and partly cut by the ridge, and a small blue Earth disc higher up. Simple, geometric, flat, readable at 16 px (at tiny sizes drop the Earth and the fine ridge detail: make a separate simplified `mark-small` master for 16 and 32 px). Colours from `src/app/theme.css` (read the tokens `--sun`, `--earth`, `--bg`, `--panel`, `--text`; use their hex values). Fully original artwork: no NASA logo or insignia, no real mission patch, no lookalike of any agency or company mark.

## Deliverables (all in `web/public/brand/` unless stated)

1. SVG masters (hand-written, clean, viewBox-based, no external fonts or images): `mark.svg` (icon only, transparent background), `mark-small.svg` (simplified), `mark-badge.svg` (icon on a solid rounded-square background, for app icons), `mark-mono-black.svg`, `mark-mono-white.svg` (single colour, for print and stamps).
2. Lockups: horizontal (`logo-horizontal-*.svg`: mark left, wordmark right) and vertical (`logo-vertical-*.svg`: mark above wordmark), each in `-on-dark` (light text, colour mark), `-on-light` (dark text, colour mark), `-mono-black`, `-mono-white`. Wordmark text: "Lunar Landing Site Navigator" (vertical: two lines "Lunar Landing" / "Site Navigator"), set in `<text>` with a system sans-serif stack; state in the README that the wordmark renders in the viewer's sans font and the PNGs use the generating machine's font.
3. PNG exports with **transparent backgrounds** (except badge and social) of: mark (64, 128, 256, 512, 1024), each lockup variant on-dark and on-light at widths 480, 960, 1920, mono variants at 512 (mark only). Name pattern `mark-512.png`, `logo-horizontal-on-dark-960.png`.
4. Square app icons: `badge-512.png`, `badge-1024.png` (rounded square, solid background), `maskable-512.png` (full-bleed background, mark inside the central 80% safe zone).
5. Social image: `social-1200x630.png` (dark background, horizontal lockup, one line below "Compare lunar landing sites and dates", no claims of power or links).
6. Favicons in `web/public/`: `favicon.svg` (simplified mark; include a `prefers-color-scheme` style so it also reads on a dark browser tab), `favicon.ico` containing 16, 32 and 48 px PNG images (assemble the ICO bytes yourself in Node, PNG-in-ICO), `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`, `apple-touch-icon.png` (180x180, solid background, no transparency), `android-chrome-192x192.png`, `android-chrome-512x512.png`, `mstile-150x150.png`, `safari-pinned-tab.svg` (single colour), `site.webmanifest` (name, short_name "Lunar Navigator", icons incl. the maskable one with `purpose: "maskable"`, `theme_color` and `background_color` from the dark theme, `display: "standalone"`, `start_url: "./"`, relative icon paths so it works under a sub-path).
7. `index.html` head: link tags for all of the above and `<meta name="theme-color">`, using paths that keep working when the app is served under a sub-path (Vite rewrites absolute `/x` public URLs with the base; verify with `VITE_BASE=/Lunar-Landing-Site-Navigator/ npm run build` and inspect `dist/index.html` and that the files are in `dist/`). Check that the production CSP meta in `vite.config.ts` does not block icons or the manifest (do not edit it; if it blocks, say so in OPEN).
8. `web/scripts/logo/build-logo.mjs`: a script that regenerates every PNG and the ICO from the SVG masters, documented at the top (how to run). To rasterise without changing the repo dependencies, install a renderer in a throwaway directory outside the repo (for example `npm install @resvg/resvg-js` or `sharp` inside a temp folder under the scratchpad or `%TEMP%`) and have the script take the renderer's path via an environment variable `RENDERER_DIR`; commit only the script and the outputs. If a renderer cannot be installed, rasterise through the headless browser in the Browser pane instead and say so.
9. `web/public/brand/README.md`: a table of every file, its size, background (transparent, dark, light or solid) and the intended use (favicon, app icon, README header, slide on dark, slide on light, print), the colour hex values, clear-space and minimum-size rules (clear space = height of the Sun disc; minimum 16 px for `mark-small`, 24 px for `mark`), and "do not" rules (no stretching, no recolouring outside the variants).

## Checks

Open at least `mark-512.png`, `logo-horizontal-on-dark-960.png`, `favicon-32x32.png` and `social-1200x630.png` yourself (read the image files) and say in the report what you see and what looks weak. Every file is under 300 KB (the social image under 500 KB); total new files under 4 MB. `npm run build` and `npm run lint` exit 0.

## Report

Keep it short: STATUS, a one-line FILES count and the list of directories, COMMANDS, what looks weak, OPEN.

## Note
A previous run was interrupted: some files in web/public/brand and web/scripts/logo may already exist. Inspect what is there, keep what is good, complete the rest. Run shell commands in small steps under 60 seconds.
