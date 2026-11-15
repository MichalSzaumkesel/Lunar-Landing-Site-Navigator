# QA2: Advanced mode manual test

Tester: Claude (Sonnet 5.5), read-only on the repo. App: `http://localhost:5173/?m=a&tour=0` (Vite dev server, origin/main as of 2026-11-15, plus the changes that hot-reloaded during the run: hold-to-lock timing, fullscreen rework, canvas input fix, controls column, phone card header, WASD walking).
Tooling: Playwright (Chrome, software WebGL via SwiftShader). Scripts and screenshots: `C:\Dev\pw-tmp\qa2\` (script name in brackets, screenshots as `*.png` in the same folder).
Viewports: 1366x768, 1536x730, 1920x1080, 960x1080, 390x844 (plus 360 and 320 for overflow).

Totals: **0 blocker, 0 major, 9 minor, 14 nit.** Console errors/warnings for the whole session: none (only two benign `net::ERR_ABORTED` request aborts, see D23).

## Defects

### Minor

**D1. Clicking the canvas to dismiss the Lander popover also moves the lander.**
- Steps: 1536x730, 3D view, click **Lander** (panel opens), click on the terrain in the canvas.
- Expected: the click only closes the popover (outside click). Actual: popover closes and the lander is relocated to the clicked point (offset 0 m becomes 11 m (-7 E, +8 N)); the user loses the lander position they were just inspecting.
- Screenshot: `s16-open.png` [s16.mjs]. Fix idea: in `LanderPopover.tsx` swallow the first pointerdown on the canvas while open (or `stopPropagation` in the capture handler when it closes the panel).

**D2. Phone: the timeline mission toolbar hides its content in an invisible horizontal scroll.**
- Steps: 390x844, open **Timeline details**. `.tl__toolbar` is `overflow-x: auto`, scrollWidth 686 vs clientWidth 292, `flex-wrap: nowrap`.
- Actual: "Start: 2027-11-15 00:00 UT" is cut off, and the "Rules met" badge, **Set as landing date** and **Apply on release** are off-screen with no scroll cue. The red bar label "Fail: Min % Sun visible" is also clipped at the card edge and reads oddly.
- Screenshot: `s30-timeline.png` [s30.mjs]. Fix: `flex-wrap: wrap` on `.tl__toolbar` under ~480 px (`components/timeline/*.css`).

**D3. Phone: sticky Transport takes 153 px (18 % of 844) and the demo caption bar adds 131-181 px.**
- Steps: 390x844, any view; start **Demo**. Transport (153 px) plus caption (131-181 px) cover about 33-40 % of the viewport, leaving about 500 px for the app.
- Screenshots: `s25-390-01.png`, `s12-390-3d.png` [s25.mjs, s12.mjs]. Fix idea: single-row transport on phones (speed select inline, hide the UTC readout text) and a compact caption.

**D4. Phone: Panorama is only 89 px tall.**
- Steps: 390x844, Panorama tab. SVG 308x89; the terrain profile and the Sun and Earth paths are unreadable, the "scale 0 to 20 deg, vertical x5" caption occupies a large part of it.
- Screenshot: `s19-390-pano.png` [s19.mjs]. Fix: give the panorama a minimum height (about 160 px) or a taller aspect ratio below 480 px (`sky/Panorama.tsx`, viewBox 776x224).

**D5. Half-screen 960x1080 with two cards: several texts are truncated or wrapped badly.**
- Accordion summaries are ellipsised (`span.disc__summary`: "Longest dark 356 h, no Earth 0 h, Sun an...", "Stay 240 h, Sun >= 70 %, dark <= 48 h, Earth...").
- The site select shows "Artemis candidate region - Mons Mouto..." and the uncertainty range breaks in the middle: "(63.9-" / "67.8)" and "(100.0-" / "100.0)".
- The top bar wraps to two rows (Tutorial / About the data / Demo on row 2).
- Screenshot: `s36-960-preset-open.png` [s36.mjs]. Fix: `white-space: nowrap` on `.countdown__range`; shorter summary text at this width.

**D6. Phone: slip controls are cramped.**
- 390 px: the slip slider is about 100 px wide, "Reset slip" wraps into two lines, and the strip cells are 2.4 px wide, so a precise tap on one of the 121 cells is hard (a tap on the +40 cell worked, a tap 2.4 px away did not move to the neighbour).
- Screenshot: `s30-slip.png` [s30.mjs]. Fix: slider on its own row; keep the strip as a visual aid and rely on the slider on touch.

**D7. Demo: "Demo complete" is followed by an automatic restart, and the restart can show a wrong caption.**
- Steps: Start demo (standard variant) and wait about 33 s. Caption "Demo complete. Press Esc or click Stop demo to explore freely." is shown for 5 s, then the demo silently restarts from step 1.
- On the phone run the restart showed for about 2 s: "Comparing IM-2 Athena - Mons Mouton and IM-2 Athena - Mons Mouton under identical dates." (caption computed before the preset was applied).
- Evidence: log of `s25.mjs` (390 run, t=37 s). Fix: stop at the end card for the standard variant, or word the end caption for looping; compute the caption after the preset applies (`useDemo.ts`, `demoSteps.ts`).

**D8. 3D Overview is almost black at the default time, the lander is not visible.**
- Steps: open 3D on the default IM-2 scenario (cursor 0 h, Sun 0.3 deg below the horizon), click **Overview**. Only a tiny yellow ellipse (the lander marker) is visible; mean luminance 6.6/255.
- Screenshot: `s27-overview.png` [s27.mjs]. A jury member clicking Overview first sees a black frame. Fix idea: earthshine or ambient light in overview, a visible lander silhouette, or start Overview at a time with Sun visible.

**D9. Compare table: layout is loose and slightly cramped.**
- At 1536 px the two scenario columns are about 450 and 735 px wide with right-aligned numbers far from the criterion; "sort" touches the label ("Next sunset countdownsort") and the **DERIVED** badge sits flush against "sort"; the header of the active scenario has an extra "ACTIVE" line, so the two header texts are vertically misaligned.
- Screenshot: `s11-1536-cmp.png` [s11.mjs]. Fix: fixed equal column widths, margin before the sort label (`compare/CompareTable.tsx`, css).

### Nit

- **D10.** Slip tolerance sentence when the current slip fails: at slip +40 it says "Mission rules hold for slips from +28 to +37 days." (nearest passing run) without saying the current slip does not meet the rules; same at -60 ("-55 to -53"). `s3.mjs`. Suggest "... Current slip +40 d does not meet them."
- **D11.** The Metrics list row "Sun and Earth together" has no "derived" marker and its tooltip does not say "derived" (the separate sentence below carries the badge). In the CSV the column `pct_both` is not flagged but `longest_both_h_derived` is. Values are formatted 49.9 % in the row and "50 % of window" in the sentence. `s4.mjs`, `s20.mjs`.
- **D12.** Redundant range "(100.0-100.0)" shown for Earth in view 100.0 % (Apollo 11); consider hiding the range when both ends are equal. `s2-preset-apollo.png`.
- **D13.** Tooltips leak contract identifiers: "pct_sunlit: share of samples ...", "pct_earth: ...", "(contract section 3)". Use plain text only. `s4.mjs` (tooltip dump).
- **D14.** Elevation chart does not fill the panel: the SVG is about 650 px wide centred in a 1800 px frame at 1920 (about 1400 px at 1536 with the same ratio), the "Horizon" label is overpainted by the curves at +0 h. `s4-timeline.png`.
- **D15.** Dates and slip: the "Slip" field label sits about 4 px higher than "Start date (UTC)" and "Window length". `s3-dates-after.png`.
- **D16.** Two-card layout: accordions of card 1 and 2 are not aligned (y 1231 vs 1241) because the loupe caption has a different number of lines ("Full sky: centre = 90 deg ..." vs the "Zoom" pill). `s2-preset-apollo.png`.
- **D17.** Custom site without terrain: the 3D tab shows "No terrain for this site" plus a stray disabled "Find spot with most Sun visible" button squeezed to a 3-line narrow box. Its `aria-label="No terrain data for this site"` replaces the visible text (WCAG 2.5.3 label in name). `s28-custom-3d.png`, `s29.mjs`.
- **D18.** Moon map: the site label "IM-2 Athena - Mons Mouton" is low contrast on bright terrain at the default South pole zoom; the active-site bar repeats coordinates ("Custom site (-80.000, -59.800) (80.00 deg S, 59.80 deg W)"). `s8-1920-moon.png`, `s10-Flat.png`.
- **D19.** About the data: "Copy Horizons query" renders as plain low-contrast text, not a button; "Horizons are computed from NASA LOLA terrain" is ambiguous (JPL Horizons vs the horizon mask). `t8-1536-about.png`.
- **D20.** In the 4-card layout the "Sun and Earth size" slider track is shorter than the "Vertical exaggeration" track (the value label is wider). `s27-4cards-3d.png`.
- **D21.** Hold-to-lock: the Face button height changes by 0.64 px (31.36 to 32 px) during the press animation. Sub-pixel, `s14.mjs`.
- **D22.** The slip strip cells are mouse/touch only (non-focusable `span`s); the slider is the keyboard path. Acceptable, but the legend says "Click a cell". `SlipStrip.tsx`.
- **D23.** Two `net::ERR_ABORTED` entries in request logs: `blob:` (worker) and `/data/validation.json` when the About dialog is closed quickly. No console output, no visible effect.

### Observations (not scored)

- **O1.** Accordion open state is shared between cards (opening "Metrics and events" in card 1 opens it in card 2; clicking card 2's header closes both). Probably intended, but surprising in the two-card layout.
- **O2.** Possible intermittent result: once, a "Find spot" run at 2 km returned "Moved 1120 m to the south-west. Sun visible: 421 h here vs 421 h at the original point (+0 h)" (a move with zero gain). Five later runs with the same site gave 474 h (+53 h), also with the same interaction order (`s31.mjs`, `s32-s35`). Not reproducible; possibly a race while cursor or slider events were firing.
- **O3.** In fullscreen 3D the View toggle, Face buttons, sliders, Sunlight map and Find spot are hidden (only the Lander popover remains). This follows `.views[data-fullscreen] .surface > :not(.surface__frame)` in `scenario.css`, so it is deliberate; mentioned so the owner knows the Sunlight map cannot be started from fullscreen.
- **O4.** During one fullscreen run a reload from the dev server's hot update dropped fullscreen ("Document not active"); re-runs of the same script were clean, so it is not an app defect.

## Verified OK

Scenario board
- Add scenario split menu: Add card plus the three presets (Compare Apollo 11 vs South Pole, South pole, Same site 14 days later) all work; Escape closes and returns focus to the toggle; Add is disabled at 4 cards with title "Four scenarios is the maximum"; remove card works; "Same site, 14 days later" gives slip +14 on card 2 with a correct "What differs" sentence (87 points more Sun visible, matches the demo caption 6.8 % to 94.0 %).
- Site select has an accessible name "Site" and no visible label.
- Custom point from the Moon map: Add custom point, Pick a point on Globe and Flat views, lat 95 shows "Latitude must be between -90 and 90."; button disabled with a tooltip at 4 cards; far-side (0, 180) and pole-adjacent points (-89.9, -89.99) render, carry the **Approximate** badge and the smooth-sphere note; no terrain gives a "No terrain for this site" message.
- Countdown chips have a second line (UTC time or "Longest dark stretch ..."); uncertainty range "(51.1-52.4)" with a tooltip; observer 10 m changes the numbers and 2 m restores them.

Dates, slip, rules, finder, map
- Slip strip: 121 cells, tooltips ("slip -60 d: Sun visible 47 %, Earth in view 73 %, rules not met"), click sets slip (also on touch), sentence "Mission rules hold for slips from -1 to +7 days.", extreme slips -60 and +60 work.
- Mission rules form: "Mission length" label, number inputs share one baseline at 1366, 1920 and 960; presets present. Window finder: month labels readable, row labels do not overlap (long names wrap to two lines), grid fills the full panel width, per-site window cards render.
- Moon map fits the viewport (panel 579 px, about 560 px at 1536) at 1366x768, 1536x730 and 1920x1080; the new basemap (CGI Moon Kit) and polar South pole view render; attribution link present.
- Compare table: derived rows with DERIVED badge ("Sun and Earth together", "Longest Sun and Earth together"), "What differs" sentence above the table, neutral wording; Copy CSV works and includes `pct_both` and `longest_both_h_derived`.
- Timeline: Sun, Earth, **Both** and Mission bands render; elevation chart renders with Window/24 h/7 d/Table.

Views and 3D
- Polar: "Zoom: centre = 20 deg elevation" caption under the loupe, loupe always visible, no Loupe toggle. Panorama fonts are constant at 11-12 px effective at all widths.
- 3D: On the surface / Overview segmented toggle with sliding thumb (no height change during the animation); Face the lander/Sun/Earth hold-to-lock: visual after about 160 ms, lock after about 460 ms (as specified), padlock "Locked on the X", click unlocks; lock on lander works in the surface view and keeps facing after the lander is moved.
- Fullscreen button sits in the frame's top-right corner next to the badge; Lander popover opens over the canvas, Escape closes and returns focus to the button (also in fullscreen without leaving it), nudge via arrow keys works with a hold or a 90 ms tap, Reset position works, panel hidden with visibility when closed.
- Sunlight map: two chasing segments on the button outline, "Computing sunlight map..." chip, legend chip bottom-left, no height change; Find spot: ring, "Searching nearby spots... N %" chip with Cancel, compact result card with the ≈ pill, Reset and Compare (Compare shows Original/Chosen/Gain). 500 m, 1 km, 2 km give monotone results (+0, +49, +53 h).
- Canvas: drag, arrow-key look, click terrain to move lander all work after the popover change; WASD walking moves the lander about 2 m/s (Shift faster), does not trigger while a slider has focus, does nothing in Overview, Reset position restores 0 m.
- Vertical exaggeration (1x to 5x) and Sun and Earth size (1x to 20x, "True size" label) sliders change the canvas; right controls column equals the frame height at all tested viewports (522/560/702/704 px) with no scrollbar, also while "Find spot" runs.
- Controls fit one screen with the sticky Transport: 3D block 522-704 px tall against 661-1011 px of free viewport.
- WebGL canvas not blank (non-uniform pixel stats) in surface and overview, after resize storms (1100/800/390/1920/1366), after 15 rapid view switches and 12 rapid toggle/face clicks, and with four 3D canvases at once.

Fullscreen (hammered: 1536x730, 960x1080, 390x844; both cards; entry from Polar, Panorama and 3D)
- A single exit button at the top right, never covered; view switching inside fullscreen (9 rapid switches) keeps fullscreen and state; Transport is available inside fullscreen; programmatic exit (equivalent of Escape) and the exit button both leave `data-fullscreen` and overflow clean, page scroll restored to the exact pre-entry value, focus returns to the Full screen button; 10 rapid toggles end in a consistent state; Play, window resize and Sunlight map computing while in fullscreen are fine.
- Not testable headless: the browser's own Escape key handling of fullscreen.

Sharing, persistence, export
- Share menu: Copy link (toast "Link copied"), Export CSV (columns incl. derived), Export dossier, Copy Horizons query; no "Save card as PNG" anywhere. The copied link opened in a fresh page restores identical state (cards, dates, slip, observer height, view); reload persistence via the URL hash works.
- Dossier prints **one page** (A4 and Letter via `page.pdf()` with print media) for 1 card, 2 cards, 4 cards, 4 cards with the 3D view and a custom site; minimum font 8 px; REAL DATA badge, derived row and Horizons query present.
- "Copy Horizons query" (Share menu and About the data) copies valid JSON as stored (`CENTER`, `SITE_COORD`, `START_TIME` ...); About dialog closes with Escape and returns focus.

Time, tour, demo
- Play/Pause, six speeds (1, 6, 12, 24, 72, 168 h per second measured at the right rate), scrubber with Home/End, Space toggles, 20 rapid Play clicks end in a consistent state, loop at the window end works.
- Tutorial: all 15 Advanced steps (including Presets), every card inside the viewport at 1536x730 and 390x844, Next/Done end the tour. Demo runs end to end (6 steps, captions use the app's own percentages) at both sizes.

Layout and motion
- No horizontal page scroll at 1366, 1536, 1920, 960, 390, 360 and 320 (base, all accordions open, each view, 4 cards, custom cards, About open); no layout shifts (CLS observer) during view switches, add/remove of cards, accordions, preset load, Compare toggle, Explore tabs, observer height, Play; no stuck translucent or pointer-events-none elements after rapid add/remove and view switching; menu items clickable immediately after opening.
- `prefers-reduced-motion: reduce`: no transition or animation longer than 20 ms anywhere (base, 3D, map computing, menu open).
- Wording: no "power", "energy", "signal", "battery", "availability" or communication claims in the visible text, tooltips or aria-labels of the Advanced UI, About or Compare table (the dossier footer reads "not a power or link guarantee", a disclaimer). Custom points are badged **Approximate**; real data is badged REAL DATA in the dossier.

## Not verified

- Visual quality of the new Sun/Earth disc-to-glow crossfade and the UI-wide animation pass (checked only for layout shift, stuck states and click blocking, all clean).
- Real GPU WebGL (SwiftShader only), the demo projector, the native Escape key leaving fullscreen, mobile Safari pseudo-fullscreen.
- Synthetic-data badge (the mock fallback is not reachable without `VITE_USE_MOCK=1`).
