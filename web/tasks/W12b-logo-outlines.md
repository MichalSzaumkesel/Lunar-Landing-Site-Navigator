# Task W12b: convert the logo wordmark text to outlines (curves)

Follow-up to `tasks/W12-logo-brand.md` (read it and the report it left: `web/public/brand/README.md` and `web/scripts/logo/`). Write the files first, then test (see `_common.md`). Do not add npm dependencies to `package.json` or the lockfile.

## Writable paths

`web/public/brand/**`, `web/scripts/logo/**`, `web/public/favicon.svg`, `web/public/safari-pinned-tab.svg`. Nothing else.

## Goal

No SVG in the brand set may contain a `<text>` element or depend on any font. Every wordmark ("Lunar Landing Site Navigator", and the two-line vertical form "Lunar Landing" / "Site Navigator", the social image tagline) must be real vector outlines (`<path>`), so the files look identical everywhere and the PNGs no longer depend on the machine's fonts.

## Method

1. Use an open-licence font so that outlines may be shipped: Inter (SIL Open Font License 1.1). Get it without touching the repo dependencies: in a throwaway directory outside the repo (scratchpad or `%TEMP%`) run `npm install @fontsource/inter opentype.js`; use the `.woff` files (opentype.js reads TTF, OTF and WOFF, not WOFF2) in weights 600 (wordmark) and 400 (tagline). Only download from the npm registry, nothing else.
2. Write `web/scripts/logo/outline-text.mjs`: loads the font through `FONT_DIR` and `OPENTYPE_DIR` environment variables, converts a given string at a given size, weight and letter-spacing to an SVG path `d` (use `font.getPath(...).toPathData(2)` or equivalent, with kerning) and measures its width so lockups can be centred or aligned. Document at the top how to run it.
3. Update the lockup masters (horizontal and vertical, all on-dark, on-light, mono black, mono white variants) and the social image so the wordmark is a `<path>` filled with the same colours as before. Keep the same layout, clear space and sizes (re-measure the text width, centre the vertical lockup lines). The generated SVGs must be produced by the script from a template so they stay reproducible; keep `build-logo.mjs` working end to end (outlines first, then the rasterisation of PNGs and the ICO) and regenerate every PNG that contains text.
4. Remove the README caveat about system fonts; add the Inter licence notice (name, "SIL Open Font License 1.1", the licence URL printed in the package's own `LICENSE` file, copy that file's text into `web/public/brand/FONT-LICENSE.txt`) and one line saying the wordmark outlines are derived from Inter.

## Checks

`grep -R "<text" web/public/brand web/public/*.svg` finds nothing (also no `font-family`). Open `logo-horizontal-on-dark-960.png`, `logo-vertical-on-light-960.png` and `social-1200x630.png` yourself and say what you see (text crisp, spacing and kerning even, nothing clipped). File sizes stay small (each SVG under 40 KB, PNG limits as before). `npm run build` and `npm run lint` exit 0.

## Report

Short: STATUS, FILES count, COMMANDS, what looks weak, OPEN.

## Note
A previous run was interrupted; inspect existing files first and continue from there. Run shell commands in small steps under 60 seconds.
