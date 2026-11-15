# QA1: Simple mode, header/toolbar, sound, tutorial, demo, Share and export, About the data

Tester: manual QA via Playwright (Chrome, software WebGL). Dev server http://localhost:5173, build as of 2026-11-15 including the lead's hot-reloaded changes (Start date in card header, "More in Advanced mode" block, new hold-to-lock, fullscreen rework, phone overflow fix). Scripts and screenshots: `C:\Dev\pw-tmp\qa1\` (t*.mjs, *.png). Viewports: 1366x768, 1536x730, 1920x1080, 390x844, 844x390 (320x640 spot checks). Console errors, warnings, page errors and failed requests were collected in every run.

Not tested / not yet landed when I finished: WASD walking and "Back to start" in Simple 3D, Sun/Earth disc crossfade in 3D, the UI-wide animation pass (not present in the build I saw). Native fullscreen exit with the physical Escape key cannot be sent by Playwright (the browser handles it); exit via button and via `document.exitFullscreen()` was tested. Real audio output was not listened to.

Counts: blocker 0, major 4, minor 8, nit 7 (items 1-4 major, 5-12 minor, 13-19 nit).

## Defects

### 1. [major] Share and export menu is clipped off-screen on a phone
- Viewport: 390x844 (still present after the "phone overflow fix").
- Steps: open `/?m=s&tour=0`, tap "Share and export".
- Expected: whole menu visible inside the viewport.
- Actual: popup is 352 px wide with `x = -128`; the left 128 px are off-screen, so the titles "Copy link / Export CSV / Export dossier / Copy Horizons query" and the icons are cut off, only the right part of the descriptions is readable. Copy link is effectively unreadable.
- Also at 844x390 the popup (y 171..461) extends below the 390 px viewport; the 4th item is under the screen edge until the page is scrolled.
- Screenshot: `C:\Dev\pw-tmp\qa1\t10-menu-390.png`, `t10-menu-844.png`.
- Fix: `web/src/components/share/share.css`: popup is right-aligned to a left-placed trigger; under ~600 px use `left:0; right:auto; max-width: calc(100vw - 32px)` (or align to the toolbar container) and a `max-height` with `overflow:auto` in landscape.

### 2. [major] Tutorial: Escape and arrow keys stop working after "Back" reaches step 1
- Steps: Tutorial, Next, click Back (now step 1 of 6, Back becomes disabled). Press Escape.
- Expected: tour closes (and ArrowLeft/ArrowRight keep working).
- Actual: focus drops to `<body>` because the focused Back button becomes disabled; the key handler lives on the card, so Escape and arrows do nothing (card count stays 1). Related: with focus anywhere outside the card (for example after clicking the page) Escape also does not close the tour (`aria-modal="false"`, handler only on the card).
- Repro scripts: `t34.mjs`, `t12.mjs` (behavioural, no screenshot).
- Fix: `web/src/components/help/Tour.tsx`: use `aria-disabled` instead of `disabled` for Back, or move focus to the card or Next when Back becomes disabled; add a window-level Escape listener while the tour is open.

### 3. [major] Simple 3D: arrow keys do not turn the camera on the element that announces it
- Steps: open 3D in Simple, Tab to "3D view. Arrow keys turn the view." (the `.surface__frame` div, tabindex 0), hold ArrowLeft/Right/Up/Down.
- Expected: camera turns (as the (?) help and the label say).
- Actual: nothing changes (pixel diff of the canvas is 0). The key listener is on the inner WebGL `<canvas>` (scene.ts adds keydown on the canvas, `canvas.tabIndex = 0`), which is a second, unlabelled tab stop right after the frame. Arrows work only after a second Tab or after clicking the canvas. Keyboard and screen-reader users land on the labelled div that does nothing. Tab order: view switch, frame, canvas, camera radios, face buttons, (?), fullscreen, date.
- Evidence: `k0.png`, `k-ArrowLeft.png`, ... (identical), `kmont.png`; with the canvas focused the camera does turn (`t6d.mjs`, `m-*.png`).
- Fix: `web/src/viz3d/SurfaceView.tsx` ~L737: drop tabIndex and label from the frame and give the canvas an `aria-label`, or forward focus from the frame to the canvas (`onFocus`), or attach the key handler to the frame.

### 4. [major] Landscape phone (844x390): sticky transport eats a quarter of the screen, 3D is cramped
- Steps: 844x390 touch, Simple, 3D, scroll to the canvas.
- Expected: a usable 3D area.
- Actual: the Play/speed/scrubber/readout bar wraps into two rows and is 101 px high (26 % of the viewport) on top of a 117 px header; with the 3D view scrolled in, about 225 px of canvas are visible and the camera radios and Face buttons are below the fold. In fullscreen 3D the canvas is only 818x227 px (transport takes 101 px).
- Screenshots: `t18-land-3d.png`, `t18-land-3d-fs.png`, `t17-844x390-3D.png`.
- Fix: `web/src/app/panels.css` (transport): in `@media (max-height: 500px)` keep a single row (hide the readout or move it into the scrubber row) and reduce header height.

### 5. [minor] Card header: long place name collapses to a 128 px column on a phone (new date placement)
- Steps: 390x844, pick "Artemis candidate region — Mons Mouton Plateau" (IM-2 Athena also wraps to 3 lines).
- Actual: the new top-right "Start date (UTC)" field takes half of the header, the title wraps to 6 lines (title block 239 px high), the window text to 4 lines. Looks broken.
- Screenshots: `t31-390-longname.png`, `t30-390x844.png`.
- Fix: `simple.css`: under ~480 px stack the date below the title (flex-wrap or column) so the title gets the full width.

### 6. [minor] Tutorial does not open while the demo runs
- Steps: Simple, Start demo, wait 2 s, click "Tutorial".
- Actual: the demo stops (restoring Simple), the tutorial does not open (0 cards), because the mode change closes an open tour (`useTour` effect on `mode`). Script `t15.mjs`.
- Related note: starting the demo from Simple silently switches to Advanced (the demo needs it); stop or Esc restores Simple, view and time (verified OK), but nothing tells the user.
- Fix: open the tour after the demo snapshot was restored, in `TopBar.tsx` / `useTour.ts`.

### 7. [minor] Demo loop: end card says "explore freely", then restarts after ~5 s, and flashes a wrong caption
- Steps: Start demo, wait about 35 s.
- Actual: caption "Demo complete. Press Esc or click Stop demo to explore freely." is shown 5 s, then the demo restarts. On loop 2 and later, for about 1 s the first caption reads "Comparing IM-2 Athena — Mons Mouton and IM-2 Athena — Mons Mouton under identical dates." (scenarios still the slip preset) before the correct Apollo/Artemis text. Not seen in the first run.
- Evidence: `t14.mjs` output at t=72 s and t=109 s.
- Fix: `components/demo/demoSteps.ts` (step 1 caption should wait for the preset or use the preset's site names); decide whether the end card should hold instead of looping.

### 8. [minor] 3D fullscreen has no camera controls
- Steps: Simple, 3D, fullscreen.
- Actual: only the Polar/Panorama/3D switch, (?), exit and the transport are visible; On the surface / Overview and Face the lander / Sun / Earth (and locking) are not reachable in fullscreen. Fullscreen itself works (enter, exit by button, switching views inside, scroll and focus restored, Play works).
- Screenshot: `t7-fs-3D-1366.png`.
- Fix: include `.surface__side` in the fullscreen layout (overlay at the bottom of the canvas).

### 9. [minor] "Open Advanced" leaves scroll position and focus behind
- Steps: scroll to the bottom of the right card, click "Open Advanced".
- Actual: mode switches and keeps the place, but the page stays at the old scrollY (193 at 1366, 1197 at 390, so the user lands in the middle of the Advanced page) and focus goes to `<body>`.
- Fix: scroll to top and focus the Advanced mode button (or a heading) after `setMode('advanced')`.

### 10. [minor] Tour spotlight for "Sky view" is partly under the sticky transport
- 1366x768, Tutorial step 3: highlight spans y 53 to 715, transport starts at 699, so the bottom 16 px of the frame are hidden under the bar. `isFullyInView` ignores the sticky bar. Screenshot `t11-step2-1366.png`. Other steps land on the right element; transitions have no flicker (cutout fades out and in once per step, smooth scroll).
- Fix: `web/src/components/help/scrollSettle.ts` / `Tour.tsx`: subtract the transport height from the usable viewport.

### 11. [minor] Unknown site in a link shows raw ids and a raw error
- `#m=s&s=bogus~2027-01-26~720~0`: card title "bogus", left pane red box "Unknown site: bogus", trigger "Choose a place". Recovery works (picker, Try again). Wording is developer-style. Screenshot `t27-bogus.png`.

### 12. [minor] Share menu link description and tooltip use Advanced jargon in Simple
- Simple "Copy link" says "restores these scenarios, dates and rules"; the trigger tooltip says "Copy a link, export CSV, copy the Horizons query or open the printable dossier" although three of those are disabled. Suggest "Copies a link to this place and date." (`ShareMenu.tsx` L228 and L275).

### 13. [nit] Far-side sites show a negative "above the horizon"
- Chang'e 4 and Chang'e 6: "Highest Earth above the horizon: -38°" / "-33°". Suggest "Never above the horizon". File: `simpleSummary.ts`.

### 14. [nit] "Highest Sun above the horizon: 90°" for Apollo 11
- Looks like rounding of about 89.x. Check the real value or cap the display. (Apollo 12 shows 87°, plausible.)

### 15. [nit] Time readout rounding vs 0.25 h scrubber step
- Scrubber step is 0.25 h but the readout uses `toFixed(1)`: 100.25 shows "+100.3 h", then 100.5, then 100.75 shows "+100.8 h". Uneven. One arrow key press on the scrubber moves only 15 min over a 720 h range (PageUp 72 h).

### 16. [nit] About the data wording
- First sentence "Horizons are computed from NASA LOLA terrain. Sun and Earth positions come from JPL Horizons." is ambiguous (reads as if JPL Horizons were computed from LOLA); say "Local horizons". "pipeline" appears in user-facing text. Validation list shows a raw lowercase label "terrain (2/2)". Dialog behaviour (trap, Escape, backdrop, focus return) is fine.

### 17. [nit] Wording inconsistency in the 3D overlay
- Cards say "Sun below horizon"; the 3D overlay says "Sun below the horizon" and "Sun hidden behind hills" (not one of the four fixed phrases; it is not a power claim). Suggest the fixed wording. File: `SurfaceView.tsx` `simpleSunText`.

### 18. [nit] Dev-only console noise
- Every open of About the data logs `requestfailed ... /data/validation.json net::ERR_ABORTED` (aborted first fetch, a second one succeeds; probably React StrictMode double effect, production presumably unaffected). A transient 404 for `/src/components/help/TourChip.tsx` appeared during the lead's hot reload (not a defect).

### 19. [nit] Layout details
- Panorama in Simple uses about one third of the card height; large empty area above and below at 1366 and 390 (`t4-Panorama-full.png`, `t17-390x844-Panorama.png`).
- 320x640: Sun and Earth blocks have unequal heights (299 vs 276 px). Equal (202 and 221 px) at all required viewports.
- Narration bar height changes with caption length (about 10 px content shift, `t14-1366-00.png` vs `t14-1366-03.png`).
- Tab order puts (?) and Full screen after the 3D controls although they sit top right.
- On the earlier build a "New here? Take the tutorial" chip pushed the whole page down by 46 px when it appeared (layout shift, `t12-chip.png`). The chip no longer appeared in the final build, so this is unverified there.

## Verified OK

- Opening `/?m=a&tour=0` then Simple, `#m=s`, `?m=s`: state kept in hash, reload restores place and date, invalid dates clamp, out-of-range dates show the out-of-data message. Hash edge cases (garbage mode, bad cursor, huge durations, bad date) do not crash.
- Place picker: opens with search focused, 21 places, group tabs (counts 6, 12, 3), search, empty-state message, ArrowUp/Down/Home/End, Enter selects, Escape and outside click close with focus returned to the trigger, Tab trap, 8 rapid clicks end closed. Switched through all 21 places in Polar and in 3D with no errors.
- Sun and Earth blocks: countdown format "It sets in N hours (about N days)." (days only from 48 h; "It sets in 6 hours."; no "1 hours", "1 days" or NaN across 21 sites x 5 times), "No Earthset/Earthrise in the data window.", metrics trees with hints.
- Start date in the header (1366, 1536, 1920, 390, 844): no horizontal scroll, works, changes window text and metrics.
- "More in Advanced mode" block: renders at all viewports without overflow; "Open Advanced" switches to Advanced and keeps the place; switching back keeps place and date.
- (?) help: hover, focus, Escape, unhover, `aria-describedby`; texts for Polar (centre value), Panorama and 3D including "Data sources. Terrain: <product>. Earth imagery: NASA Blue Marble." correct per site (21 sites, no undefined).
- Views Polar / Panorama / 3D switch without console errors, persisted in localStorage; no inner scrollbars; SVG text at least 11 px.
- 3D: On the surface / Overview change the camera; Face the lander / Sun / Earth move the camera; a plain click shows no hold visuals (0 `data-holding` events for a 100 ms press); visuals appear after about 0.15 s, lock after about 0.45 s with padlock and "Locked on the Sun/Earth/lander", other buttons slide out, click or Enter or Escape unlocks, no vertical layout jump (row only widens; widths differ by up to 3 px after unlock); "Face the lander" lock works in the surface view (camera turns to the lander and stays); lock follows the Sun while Play runs; lock is cleared on place change and view switch; right click does not lock; keyboard hold of Space locks; touch long-press locks and tap unlocks on 390x844; drag, touch drag and wheel work; click on terrain moves the lander; arrow keys turn only the camera when the canvas is focused (time cursor unchanged).
- Fullscreen in Polar, Panorama and 3D: enter and exit by button, view switch inside, Play inside, transport inside, scroll position and focus restored, no overflow (re-run after the fullscreen rework).
- Play/Pause, six speeds with correct labels ("1 hour per second" ... "7 days per second", "12 hours / s" on phone) and measured rates within 1 %, loop at window end, scrubber keys (arrows 0.25 h, PageUp/Down 72 h, Home/End), Space and arrows on the page, Space on focused buttons does not hijack, 20 rapid toggles end consistent, view hopping while playing OK.
- Sound: Off / Ambient / Cues with distinct icons, volume slider only when on (slides, keyboard Home/End/arrows, click), no overlap and no movement of the switch or Share at all five viewports, rapid toggling fine.
- Share and export: Copy link works (clipboard URL reopens the same state in a new context), "Link copied" flash and live region, CSV, dossier and Copy Horizons query disabled with "Available only in Advanced mode." (with full stop) as description and title, a disabled click does nothing, ArrowDown on the trigger opens, Escape returns focus, Tab and outside click close.
- Tutorial: all 6 Simple steps highlight the right element, Next/Back/Skip/Done, ArrowRight/ArrowLeft, Tab trap, focus returns to the Tutorial button, clicking Advanced closes it; also fine under reduced motion.
- About the data: focus on Close, trap over 12 stops, Escape, backdrop click, focus back to the button, Space and arrows suppressed while open, mobile layout scrolls inside the dialog.
- Demo: end to end (standard and "Video 30 s", which ends itself after about 30 s with the closing card); captions use the app's own numbers; Esc and Stop restore Simple, view 3D and time cursor.
- Wording scan of all visible text, titles and aria-labels in three views, menus, tour, demo and About: no power, energy, signal, link-availability, battery or thermal claims; only "Sun visible / Sun below horizon / Earth in view / Earth below horizon" (plus item 17).
- Reduced motion: picker, menus, sound slider, About, all tour steps, lock, Play and demo work and appear immediately.
- Dark theme consistent (single dark theme; `colorScheme` light and dark render the same). No horizontal page scroll at 1366, 1536, 1920, 390, 844 and 320. Console: no errors or warnings in any run other than item 18.
