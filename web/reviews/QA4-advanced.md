# QA4: Advanced mode manual test (round 2)

Tester: Claude (Sonnet 5.5), read-only on the repo. App: `http://localhost:5173/?m=a&tour=0`, Vite dev server on origin/main `903ee10` (PRs #82-#90).
Tooling: Playwright (Chrome, SwiftShader WebGL). Scripts and screenshots: `C:\Dev\pw-tmp\qa4\` (script in brackets, screenshots `*.png` in the same folder).
Viewports: 1366x768, 1536x730, 1920x1080, 960x1080, 390x844, 844x390 (and 360x640 for the Lander popover).

Totals: **0 blocker, 0 major, 4 minor, 10 nit** new defects. Console errors and warnings for the whole session: none. Failed requests: only `net::ERR_ABORTED` for `/data/validation.json` when the About dialog is closed fast (old D23, benign).
Wording rule: regex sweep (power, energy, signal, battery, availab*, link, communicat*, uplink, DTE, charge, generation) over visible text, titles and aria-labels in Polar, Panorama, 3D, all accordions, Sites, Moon map, Window finder, Compare table and About at 6 viewports: **0 hits**.
No horizontal page scroll at any of the 6 viewports (base state, all accordions open, compare open, About open).

## 1. Verification of QA2 items

| # | Item | Result | Evidence |
|---|------|--------|----------|
| D1 | Popover outside click moves lander | **PASS** | 1536x730 3D: offset 0 m, open Lander, click terrain: popover closes, offset still 0 m; a second plain click moves it to 10 m. [a2.mjs] |
| D2 | Phone timeline toolbar hidden scroll | **PASS** | 390x844: `.tl__toolbar` `flex-wrap: wrap`, scrollWidth 292 = clientWidth 292, all items visible. `p1-tl.png` [p1.mjs] |
| D3 | Phone transport and demo caption height | **PASS** | Transport 102 px (was 153, 12 % of 844), two rows; demo caption 113 px (120 on end card). `p1-top.png`, [g1.mjs] |
| D4 | Phone Panorama 89 px tall | **PASS** | SVG 308x200. `p1-pano.png` |
| D5 | 960x1080 two cards truncation | **PARTIAL** | Site select now shows the full name, range "(63.9-67.8)" no longer breaks mid-range. Still: accordion summaries ellipsised (`Longest dark 356 h, no Earth 0 h, Sun and Earth 50.6 %`, `Stay 240 h, ...`, timeline summary), top bar still wraps to two rows (117 px). `z1-960-top.png` [z1.mjs] |
| D6 | Phone slip controls cramped | **PASS** | Slider on its own row, 288 px; "Reset slip" 97x40 one line. Strip cells still tiny but the slider is the touch path. `p1-tl.png` |
| D7 | Demo auto-restart / wrong caption | **PASS** | End card "Demo complete. Restart it, or press Esc ..." stays (checked 6 s after, and at 1366 and 390); Restart returns to step 1. Caption text matches app numbers (6.8 % to 94.0 %). Only a generic first caption for 1.2 s (see N9). [g1.mjs] |
| D8 | Overview black at default time | **PASS** | 1536x730 Overview at cursor 0 h: terrain softly lit, yellow lander pin with ring visible. `a2-overview.png`. Faint tiling grid pattern visible on the terrain (nit, see N11). |
| D9 | Compare table loose | **PASS** | Scenario columns 572 / 572 px, criterion 260, header rows equal height (82), "sort" has a gap, DERIVED badge separate. `c1-compare.png` [c1.mjs] |
| D10 | Slip sentence for failing slip | **PASS** | +40: "Mission rules hold for slips from +28 to +37 days. Current slip +40 d does not meet them."; -60 same form; +60 and 0 (passing) have no extra sentence. [b2.mjs] |
| D11 | "Sun and Earth together" derived | **PASS** | Metrics list row shows "51.9 % DERIVED"; sentence below also badged. |
| D12 | Range "(100.0-100.0)" | **PASS** | Apollo 11: "Earth in view 100.0 %" without range. |
| D13 | Tooltips leak contract ids | **PASS** | All titles/aria-labels dumped, no `pct_`, "contract", "section 3". Compare table also clean. [b1.mjs, c1.mjs] |
| D14 | Elevation chart does not fill panel | **PASS** | 660 px SVG in 686 px panel at 1536 (96 %). `c1-two-open.png` not needed; measured in [c1.mjs] |
| D15 | "Slip" label offset | **PASS** | Start date, Window length, Slip labels all y = 442.69. [b2.mjs] |
| D16 | Accordions not aligned in two-card layout | **PASS** | Both at y = 1233 (1536x730, Apollo vs South Pole). Caveat: misaligns again when a card has extra chip lines or the custom badge (N6). |
| D17 | Custom site 3D stray button | **PASS** | Only the message "No terrain for this site. The 3D controls and Find spot need terrain data." No button, no aria-label override. `c2-custom-3d.png` [c2.mjs] |
| D18 | Moon map label contrast, repeated coordinates | **PARTIAL** | Active-site bar now reads "IM-2 Athena - Mons Mouton (84.79 S, 29.20 E)" (no repetition). Site label on bright terrain is still dark grey on grey. `z2-Moonmap.png` (map code not edited by me, reported only) |
| D19 | About: Copy Horizons button, wording | **PASS** | Button has border and tinted fill; text "Local horizons are computed from NASA LOLA terrain. Sun and Earth positions come from JPL Horizons." `h1-about.png` [h1.mjs] |
| D20 | Unequal slider tracks | **PASS** | 302 / 302 px (1 card), 454 / 454 px (4 cards). |
| D21 | Face button height 0.64 px | **PASS (closed)** | Only `transform: scale` on press (bounding box 32 to 31.36), no layout change; lock after hold works for lander, Sun and Earth, click unlocks. [l1.mjs] |
| D22 | Slip strip cells not keyboard reachable | **REMAINS (accepted)** | Slider is the keyboard path; legend now says "Click a cell, or use the slider." Tab order checked: no dead ends, every stop has a focus ring. [kb.mjs] |
| D23 | `ERR_ABORTED` on validation.json | **REMAINS (benign)** | Seen at every viewport when About is opened and closed quickly. No console output. |
| O1 | Shared accordion state across cards | **REMAINS** | Opening Dates and slip in card 1 opens it in card 2 (`aria-expanded` true / true). |
| O2 | Find spot zero-gain result | **Not reproduced** | 1 km: "Moved 1000 m to the south. Sun visible: 470 h here vs 421 h (+49 h)"; 500 m: "No better spot found nearby" with a dismiss button (new wording works). `w1-find-done.png`, [o3.mjs] |
| O3 | Sunlight map / Find spot absent in fullscreen | **FIXED** | Fullscreen 3D now has a floating controls overlay with On the surface/Overview, Face buttons, both sliders, Sunlight map, Radius and Find spot. `f1-1536-3D-in.png` |
| O4 | Fullscreen drop on HMR | n/a | Did not recur. |

### Other fixes verified (PRs #82-#90)

- Fullscreen from Polar, Panorama and 3D at 1536x730, 960x1080, 390x844 and 844x390: single exit button at top right (32 px, `reach` true via `elementFromPoint`), transport inside fullscreen, `document.exitFullscreen()` (Escape equivalent) clears `data-fullscreen`, body overflow `visible`, page scroll restored. In 3D the overlay switches `data-chrome` shown, hidden after about 3 s, shown again on pointer move; exit button stays visible while hidden. [f1.mjs] Native Escape key not testable headless.
- Hold-to-lock and lander lock in the surface view work; WASD walks about 2 m/s in the facing direction (D right, S back), arrows only look, WASD ignored when a popover button has focus (my Escape returns focus to the button).
- Lander popover: Offset, terrain height, Reset position, "Approximate" Sun visible hours with patch-only estimate and card estimate. Reset position restores 0 m and clears the result chip.
- Find spot result chip: "≈" pill, Reset, Compare (Original 421 h, Chosen 470 h, Gain +49.0 h). A WASD step after a Find spot dismisses the chip (Reset position remains in the popover).
- Right controls column equals frame height with no scrollbar at 1536x730 (522), 1920x1080 (704), 960x1080 (704), 1100x700 (492), also while Sunlight map or Find spot run and in Overview. Exception: landscape phone (N1).
- Exports: Copy link ("Link copied", hash `#m=a&h=10&c=0&v=12&s=...&r=...`), copied link restores identical card state in a fresh page (including custom point, slips +60/-60 and observer 10 m), reload keeps state. CSV (`lunar-scenarios-20261115.csv`): 25 columns incl. `pct_both` and `longest_both_h_derived`, empty earthset for Apollo 11 at 10 m, one row per card. Copy Horizons query: valid JSON with `CENTER`, `SITE_COORD` (lon, lat, alt), quantities and times (fixed 2026-12-01 to 2028-12-31 range, not the scenario window). Dossier via print emulation (A4 and Letter): **1 page** for 1 card, 2 cards (preset, 10 m), 4 cards, 4 cards with 3D, custom point. [d1.mjs, e1.mjs]
- Tutorial auto-starts on first visit (empty storage, no `tour` param), `?tour=0` suppresses it.
- Reduced motion (`prefers-reduced-motion: reduce`): no animation or transition longer than 20 ms in menu, preset, tab switches, accordion, compare, About. [r1.mjs]
- Animations: layout-shift observer reports CLS 0.000 for add card 2, 3, 4, remove middle, remove active, remove down to one card, tabs Polar/Panorama/3D and accordion; nothing left translucent or transformed after 1.2 s; card FLIP (translate/scale) settles to identity. [m1.mjs]
- Keyboard-only: Tab walks header, scenario toolbar, card (site select, view tabs, Sun/Earth, Full screen, accordions), Explore tabs, transport; every stop has a visible focus ring.
- Observer height 2/10 m, extreme slips (+60 / -60) on 4 cards incl. 3 custom points, many cards (Add disabled at 4): consistent numbers, URL round trip equal. [u1.mjs]
- Demo: all 6 steps at 1366 and 390, end card with Restart. Both viewports clean.

## 2. New defects

### Minor

**N1. Landscape phone (844x390): the 3D controls column clips the last button.**
- Steps: 844x390 (touch), Advanced, 3D tab, scroll the frame into view. `.surface__side` has `overflow-y: clip`, scrollHeight 389 vs clientHeight 380; "Find spot with most Sun visible" bottom edge is cut by 9 px (button bottom 613, column bottom 603).
- Expected: whole button visible, or the column scrolls. Actual: bottom border and a few px of the label are cut, no scroll path.
- Screenshot: `v1-844-result.png` [v1.mjs, v2.mjs]. Fix: in `scenario.css`/`surface.css` let the frame row grow to the column's content below ~900 px width or use `overflow-y: auto` instead of `clip`.

**N2. Landscape phone fullscreen: Polar loupe and speed select are cut off.**
- Steps: 844x390, Polar tab, Full screen. The loupe (Sun/Earth switch plus square) runs under the transport bar and loses its bottom edge and caption; the Playback speed select text "12 hours per second" is clipped at the select's right edge. In 3D the controls overlay covers about 65 % of the canvas until it auto-hides.
- Expected: loupe scaled to the free height, select text fits. Actual: see above.
- Screenshot: `f1-844-Polar-in.png`, `f1-844-3D-in.png` [f1.mjs]. Fix: cap the loupe size by `min(…, 100dvh - transport - header)` in the fullscreen layout; shorter speed labels ("12 h / s", as already used on 390 px) below 900 px width.

**N3. Countdown chips orphan the "%" on its own line (first screen at 1366 and 960).**
- Steps: 1366x768, load Compare preset (Apollo 11 vs South Pole). Chips read "Sun visible 50.6 / %" and "Earth in view 100.0 / %", "Sun visible 32.4 / %", "Earth in view 65.8 / %" (value and unit on separate lines). Same on the demo end card (94.0 / %) and at 960x1080.
- Expected: value and unit stay together. Actual: the most visible numbers on the first screen look broken.
- Screenshot: `j1-a.png`, `t1-3d.png`. Fix: `white-space: nowrap` on the headline value + unit span in `Countdown` css, or wrap only before the range.

**N4. Landscape phone 3D: attribution chip overlaps the "WASD to move" hint (text unreadable).**
- Steps: 844x390, 3D, any state (also after Find spot). "Terrain: LOLA LDEM_80S_20M ..." and "WASD to move, arrows or drag to look; click terrain to move lander" are drawn on top of each other on the bottom edge of the 446x380 frame.
- Screenshot: `v1-844-result.png`. Fix: hide the hint when the attribution would overlap (or stack them) below ~500 px frame width in `surface.css`.

### Nit

- **N5.** Several actions look like plain text and have no button affordance: "Set as landing date" (Timeline details), "Use Artemis candidate region - Haworth" (custom card note), "Reset slip" when disabled looks the same as a label. `c1-compare.png`, `c2-custom-3d.png`. Give them the secondary button style.
- **N6.** Two-card layout alignment breaks when cards differ: a custom card (Approximate badge pushes Remove lower, chips start 19 px lower) or a card with a slip (extra "vs slip 0: ..." chip lines) moves the view tabs and everything below out of line with the neighbour (tabs at y 382 vs 411 on the demo end card). `c2-custom-3d.png`, `g1-1366-final.png`. Reserve the chip row height with a grid `min-height` or `grid-template-rows: subgrid`.
- **N7.** Sun loupe caption changes height during Play: "Sun disc visible 100 %" (one line) becomes "Sun is outside the magnified window (elevation +26.2 deg)" (two lines) and the content below moves by 4 px, so the accordion headers jitter during Play. `j1-b.png` vs `j1-play.png`. Give the caption a fixed two-line height.
- **N8.** Phone Lander popover: the key result ("Sun visible hours ... 421.0 h", estimates) is below the fold of the 308x348 frame and reachable only by scrolling inside the panel (`overflow: auto`) without a scroll cue. `v1-390-pop.png`. Reduce padding or shorten the heading text.
- **N9.** Demo shows a generic caption for 1.2 s ("Comparing two sites under identical dates.") and then swaps to the named one. Minor flash; compute the caption after the preset applies. [g1.mjs]
- **N10.** Custom site, 3D tab: the empty "No terrain for this site" panel still shows a Full screen button that fullscreens an empty frame. `c2-custom-3d.png`. Hide the button without terrain.
- **N11.** Sunlight map in the surface view paints a nearly opaque mint layer over the whole foreground (rocks and horizon remain, relief is lost); Overview terrain shows a faint regular tile grid. `w1-map.png`, `a2-overview.png`. Lower overlay opacity at grazing angles.
- **N12.** Moon map side panel: "Lat" and "Lon" inputs have different widths and very low contrast placeholder text; site label on bright terrain is low contrast (old D18). `z2-Moonmap.png`. (Map code not touched.)
- **N13.** Phone: the header block (title, Simple/Advanced, observer, three links) takes about 205 px before the first card, and "(?) Tutorial" shows a literal question mark glyph. `p1-top.png`.
- **N14.** Phone fullscreen 3D (390x844): until the overlay auto-hides (3 s) the controls cover the lander and about 55 % of the canvas; a first tap on the canvas only wakes the controls. `f1-390-3D-in.png`. Consider starting hidden after the first view.

## 3. Jury view (60 s, 1366x768, Advanced, Compare preset)

First impression is strong: dark, consistent palette, two cards side by side, jagged polar horizon with Sun and Earth tracks, large readable result chips, the Apollo versus pole contrast is obvious in 5 s. Sticky transport with Play is always reachable and pressing it makes Sun and Earth glide immediately; the demo with end card is clean.
What looks unfinished or confusing:
1. The "%" falling onto a second line in the headline chips (N3) is the first thing the eye lands on.
2. The first screen is all 2D; the 3D lander (the best visual) is one click away and not hinted. The 3D tab opens on a black frame for about 1-2 s while loading (fade from empty), which feels slow in a 2-3 minute jury slot.
3. The loupe for Apollo 11 shows a lone dot in an empty navy square and for the pole a flat grey square (Sun disc 0 %); without the caption it reads as an empty widget.
4. Controls such as "Set as landing date" and "Apply on release" look like captions, not controls (N5).
5. Two cards with different chip heights are not aligned (N6).

## 4. Not verified

- Real GPU WebGL and the native Escape key leaving fullscreen (headless); mobile Safari.
- Visual quality of the 3D disc/glow fade beyond stuck-state and layout checks (frames looked clean in screenshots).
- Dossier PDFs were checked for page count (one page) only, not re-inspected visually this round.
