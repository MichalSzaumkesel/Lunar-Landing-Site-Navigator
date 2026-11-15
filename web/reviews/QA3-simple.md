# QA3: Simple mode, header/toolbar, sound, tutorial, demo, share, About (round 2)

Tester: manual QA via Playwright (Chrome, software WebGL). Dev server http://localhost:5173 on main `903ee10`. Scripts and screenshots: `C:\Dev\pw-tmp\qa3\` (a1, b1, c1, d1, e1, f1, f2, g1, h1, i1, j1, k1, k2, l1, m1, n1 .mjs, *.png). Viewports: 1366x768, 1536x730, 1920x1080, 390x844, 320x640, 844x390 (touch). Console errors/warnings, page errors and failed requests were collected in every run: 0 errors, 0 warnings; the only entry is the dev-only aborted `/data/validation.json` fetch when About opens (QA1 #18, unchanged).

Not tested: physical Escape key in native fullscreen (Playwright cannot send it), real audio output, sound toggles were only checked by tab order, not re-run in depth (QA1 verified them; nothing visible changed). Items marked "partly" below were not fully re-measured.

Counts: blocker 0, major 0, minor 3, nit 8.

## Verification of QA1 defects

| # | QA1 defect | Result | Evidence |
|---|---|---|---|
| 1 | Share menu clipped on phone | PASS | popup x=8, w=352 at 390; x=8, w=288 at 320 (opens upward, fully in view); 844x390 popup 226 px high with inner scroll, bottom 329 < transport 338 (4th item partly cut until scrolled inside menu). `c1-menu-390/320/844.png` |
| 2 | Tour Escape/arrows dead after Back to step 1 | PASS | Back to step 1, then ArrowRight/ArrowLeft/Escape all work; Escape also works after clicking the page background. `b1.mjs` |
| 3 | Simple 3D arrows do nothing on the labelled frame | PASS | Frame is the single tab stop ("3D view. WASD moves, arrow keys turn the view."); ArrowLeft/Right/Up change the canvas hash; focus moving away stops walking. `d1.mjs` |
| 4 | Landscape transport too tall | PASS | 844x390: transport 52 px, header 49 px, one row. Fullscreen 3D canvas gets the rest. |
| 5 | Long place name collapses to 128 px | PASS | 390: title block 292 px wide, date stacked below; 320: 222 px, date full width. `l1-320-full.png` |
| 6 | Tour does not open during demo | PASS | Tutorial click while demo runs stops the demo, restores Simple and opens the tour (1 card). `h1.mjs` |
| 7 | Demo loops, wrong caption on loop 2 | PASS | Ends after ~31 s on "Demo complete. Restart it, or press Esc or click Stop demo to explore freely.", holds (checked 12 s more, no restart), Restart button works and starts with the correct caption. `g1.mjs` |
| 8 | 3D fullscreen has no camera controls | PASS | Overlay with On the surface / Overview / Face the lander / Sun / Earth in fullscreen at all viewports. See N1 for the layout cost. |
| 9 | Open Advanced keeps scroll and focus | PASS | After click: scrollY 0, focus on the Advanced mode button. |
| 10 | Tour spotlight under sticky transport | PASS | 1366x768 step 3 spot y 25..687, transport top 699. |
| 11 | Unknown site shows raw id/error | PARTLY | Message now "Could not load this place. Try another place." with Try again, but the card title still shows "bogus" and the pane shows "Unknown site: bogus". `h1-bogus.png` (nit N8) |
| 12 | Share menu jargon / tooltip | PASS | "Copies a link to this place and date."; tooltip "Copy a link to this place and date". |
| 13 | Negative "above the horizon" far side | PASS | Chang'e 4 and 6: "Never above the horizon". All 21 sites scanned, no NaN/undefined/"1 hours". `i1.mjs` |
| 14 | Apollo 11 "90°" | PASS | Now 89°. |
| 15 | Readout rounding vs 0.25 h step | FAIL | Scrubber at 576.00 then ArrowRight: +576.3, +576.5, +576.8, +577.0, +577.3 h (uneven). Unchanged. |
| 16 | About the data wording | PASS | "Local horizons are computed from NASA LOLA terrain...", no "pipeline", validation labels capitalised ("Terrain data sanity checks (2/2)"). |
| 17 | 3D overlay wording | PARTLY | Now "Sun below horizon"; but `simpleSunText` returns "Sun below horizon (hills)" when el >= 0 (`viz3d/viewMath.ts` L110). Not a power claim; not one of the fixed phrases. |
| 18 | Dev console noise | UNCHANGED (dev only) | `requestfailed validation.json ERR_ABORTED` once on About open. |
| 19 | Layout details | PARTLY | Tab order fixed: (?) and Full screen now come right after the view switch, before the date. Not re-measured: panorama height, 320 Sun/Earth block heights, narration height. First-visit chip layout shift no longer exists (no chip). |

## New defects

### N1. [minor] Fullscreen 3D controls overlay covers most of the canvas in landscape and wraps its buttons
- Viewport 844x390 (also 320x640 and 390x844 to a lesser degree). Steps: Simple, 3D, Full screen.
- Expected: compact bottom strip. Actual: overlay is 108 px high (28 % of the height, ~55 % of the visible canvas, hides the lander and the horizon); "Face the lander / Face the Earth" wrap to two lines; the camera radios sit on a separate row with empty space beside them. It auto-hides after ~4 s (verified, also on touch: tap shows it, idle hides it), so this only matters for the first seconds and for keyboard users (focus keeps it visible).
- Screenshots: `f1-fs-3D-844.png`, `f1-fs-3D-320.png`. Fix: `viz3d/surface.css` fullscreen side overlay: single row, `white-space: nowrap`, smaller padding in `max-height: 500px`.

### N2. [minor] Focus lost after "Stop demo"
- Steps: Demo, wait for the end card, click "Stop demo". Expected: focus back on the Demo button (like the Tutorial button after the tour). Actual: `document.activeElement` is `<body>`, keyboard users restart from the top. Same path via Esc not checked separately. File: `components/demo/DemoCaption.tsx` / `useDemo.ts`.

### N3. [minor] Tour card hides the element it highlights on phones and landscape
- 390x844 and 320x640 steps 3 and 4, 844x390 steps 2 to 4: card overlaps the spotlight (e.g. right half of the polar diagram at 844x390). Screenshot `m1-844-step3.png`. Expected: card above/below the target or the target scrolled so both fit; on a 390 px phone this may be unavoidable, at 844x390 place the card beside the target. File: `components/help/Tour.tsx` placement.

### N4. [nit] 3D wording variant
- "Sun below horizon (hills)" in the 3D overlay (`viewMath.ts` L110). Use "Sun below horizon".

### N5. [nit] Time readout still uneven (QA1 #15), see table.

### N6. [nit] View switch touch targets are 26 px high
- Polar / Panorama / 3D buttons: 56x26, 83x26, 42x26 on phones (also (?) and Full screen are 32 px). Below the 44 px touch guideline. `simple.css`.

### N7. [nit] Place change shifts the layout by 5 to 9 px
- Select a place whose title wraps in the right card (e.g. IM-2 Athena to Artemis candidate region): right card height 654 to 663 and left stage y 262 to 267 during the fade (`k1.mjs`). Content-driven, not an animation bug (no flicker, text is never blank; swap-text fade bottoms at about 0.2 opacity for ~100 ms).

### N8. [nit] Unknown-site screen still shows the raw id (QA1 #11) in title and pane.

### N9. [nit] 320x640 summary rows
- "Sun visible over the window" wraps to 4 narrow lines beside the "23% of 30 days" value; header block is 200 px (31 % of the screen) before the sound row and card. `l1-320-full.png`. Not sticky, so only a first-screen cost.

### N10. [nit] Demo still starts by silently switching to Advanced
- Stop restores Simple and the previous view/time (verified), but nothing announces the mode change when the demo starts.

### N11. [nit] Hold-to-lock micro shifts
- While pressed the button is 4 px narrower and 1 px lower (scale), locked state 1 px lower and 1 px shorter than idle (`e1.mjs`). No page-level shift (frame, side box, transport, scrollHeight unchanged), invisible in practice.

## Verified OK (new in this round)

- First-visit tutorial: fresh profile opens the tour after ~1.0 s; 6 steps, each spotlight on the right element (mode switch, Places, Sky view, Summary, Playback, Tutorial); Next/Back/ArrowKeys/Escape/Skip work; Done leaves in 114 ms, focus goes to the Tutorial button, clicks work immediately; the tour is marked done on open, so reload does not re-open it; `?tour=0` suppresses it. Reduced motion: same, appears instantly.
- WASD walking in Simple 3D moves the view and shows "Back to start"; time cursor unchanged; Back to start resets and the chip disappears; W with focus on body does nothing; no stuck walking after blur.
- Hold-to-lock: unlock with Escape or click, lander lock works in surface view, no vertical layout jump.
- Fullscreen: overlay visible at entry, hides after ~4.5 s (opacity 0, pointer-events none), reappears within 150 ms on mouse move, tap or keyboard focus; exit button (top right, 32 px) always visible and never covered; exit restores scroll to 0 and focus. Reduced motion: same behaviour.
- Share menu, place picker, About dialog, demo captions: no console output; animations (view switch, place change, date change, mode switch, menus) never block clicks, no stuck opacity, scrollHeight stable apart from N7.
- Keyboard pass at 1366x768: 21 sensible tab stops (mode, tutorial, about, demo, share, sound, place, Polar/Panorama/3D, ?, full screen, date segments + picker, Open Advanced, Play, speed, scrubber), all with a visible 2 px focus ring (the native date picker icon shows none, Chrome default), no focus on covered elements, Escape closes menus/picker/About/tour.
- Wording scan (all 21 places, Simple text, tour, demo, About): only "Sun visible / Sun below horizon / Earth in view / Earth below horizon"; no power, signal or link claims.
- No horizontal scroll at 1366, 1536, 1920, 390, 320, 844.

## Jury view at 1366x768 (60 seconds)

Strong first impression: opens straight into the south pole with the polar plot and a plain-language Sun/Earth summary; the tutorial appears by itself and does not feel intrusive; 3D with the lander and Sun glow is the wow moment; demo is smooth and ends cleanly. What looks unfinished: the place name is repeated twice (picker bar and card title), the 3D camera buttons and the Face the Sun row are below the fold so the first 3D view looks control-less, the polar plot is cut off by the sticky Play bar (page scrolls 190 px), the empty strip below the Sound/Share row on the left, and the time readout ("+576.3 h") uneven.
