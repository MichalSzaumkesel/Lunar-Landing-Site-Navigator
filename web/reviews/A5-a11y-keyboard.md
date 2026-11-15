# Review A5: Accessibility and Keyboard Audit (Static)

## Summary (Top 5 Findings)
- HIGH: `src/components/about/AboutData.tsx:56-85` lacks a focus trap and focus return on dismiss, stranding keyboard focus on `document.body`.
- HIGH: `src/components/simple/PlacePicker.tsx:89-97,186-193` dialog lacks a focus trap and drops focus on outside press dismissal.
- HIGH: `src/app/useShortcuts.ts:22-30,108-129` leaks global arrow keys into menu items, scrubbing timeline playback during popup menu navigation.
- HIGH: `src/components/map/PoleMap.tsx:314-325` provides no keyboard-operable pan interaction despite claiming drag-to-pan in its accessible label.
- HIGH: `src/components/sound/SoundToggle.tsx:108-146` `role="radiogroup"` lacks arrow key navigation and roving `tabIndex`, requiring 3 Tab stops.

---

## Findings (Ordered by Severity)

### 1. AboutData dialog lacks focus trap and return of focus to trigger
- **Severity**: HIGH
- **Location**: `src/components/about/AboutData.tsx:56-85` and `src/app/TopBar.tsx:87-106`
- **What is wrong**: `AboutData` is marked with `role="dialog"` and `aria-modal="true"`, but it does not trap keyboard focus within the dialog. Tabbing past the close button and provenance links moves focus into elements behind the backdrop. Additionally, when closed via Escape or the "Close" button, focus is not returned to the "About the data" trigger button in `TopBar.tsx`, dropping focus to `document.body`.
- **Evidence / Failing Scenario**: In Advanced or Simple mode, click or focus "About the data" in the top bar. Press `Tab` repeatedly past the last link in the dialog. Focus escapes the modal and navigates underlying topbar and background controls while the backdrop remains visible. Press `Escape`: focus is lost to `document.body` instead of returning to the "About the data" button.
- **Suggested Fix**:
  In `TopBar.tsx`, maintain a ref to the trigger button (`aboutTriggerRef`) and restore focus when `setAboutOpen(false)` is called:
  ```tsx
  <button ref={aboutTriggerRef} type="button" className="ghost" onClick={() => setAboutOpen(true)}>
    About the data
  </button>
  ```
  In `AboutData.tsx`, add a `Tab` key handler that wraps focus between the first and last focusable elements:
  ```tsx
  if (e.key === 'Tab') {
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href], details summary, [tabindex]:not([tabindex="-1"])')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }
  ```

### 2. PlacePicker modal panel lacks focus trap and drops focus on outside press dismissal
- **Severity**: HIGH
- **Location**: `src/components/simple/PlacePicker.tsx:89-97,186-193`
- **What is wrong**: The place picker panel has `role="dialog"`, but implements no focus trap across its search input and filter buttons. Furthermore, when dismissed via an outside pointer click on the backdrop (`onDown`), `setOpen(false)` is invoked directly instead of `closePanel(true)`, abandoning focus instead of returning it to the place trigger button.
- **Evidence / Failing Scenario**: Open the Place Picker in Simple mode. Tab past the search input and across the four filter tabs ("All", "Apollo", "Artemis", "Other"). Pressing Tab on the last tab moves focus out of the dialog onto the underlying page controls behind the modal backdrop. When clicking the backdrop to close the panel, focus is not restored to `triggerRef`.
- **Suggested Fix**:
  Add `aria-modal="true"` to the panel and handle `Tab` in `onKeyDown` to prevent escaping:
  ```tsx
  if (e.key === 'Tab') {
    const buttons = rootRef.current?.querySelectorAll<HTMLElement>('.place-search, .place-tab')
    if (buttons && buttons.length > 0) {
      const first = buttons[0]; const last = buttons[buttons.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
  }
  ```
  In the backdrop `onDown` handler, call `closePanel(true)` instead of `setOpen(false)`:
  ```tsx
  const onDown = (e: PointerEvent) => {
    if (!rootRef.current?.contains(e.target as Node)) closePanel(true)
  }
  ```

### 3. Global keyboard shortcuts intercept arrow keys during menu navigation
- **Severity**: HIGH
- **Location**: `src/app/useShortcuts.ts:22-30,108-129`
- **What is wrong**: `useShortcuts` only checks `IGNORED_ROLES` (`['tab', 'tablist', 'menu', 'grid', 'region', 'application']`) against the element's immediate `role` or specific ancestors. Buttons inside `ShareMenu` and `AddScenarioMenu` carry `role="menuitem"`, which is not in `IGNORED_ROLES`. ArrowLeft / ArrowRight presses are not suppressed and trigger global timeline scrubbing (`setCursorH`).
- **Evidence / Failing Scenario**: Open `AddScenarioMenu` or `ShareMenu` using the keyboard. Navigate onto a menu item (e.g. "Add card" or "Copy link"). Press `ArrowLeft` or `ArrowRight`. Instead of remaining in the menu or moving focus, the global timeline playback cursor shifts by ±1 h in the background.
- **Suggested Fix**:
  Add `'menuitem'`, `'menuitemcheckbox'`, and `'menuitemradio'` to `IGNORED_ROLES`, and check whether the target is contained in a `[role="menu"]`:
  ```ts
  const closestMenu = target?.closest?.('[role="menu"]')
  if (closestMenu) return null
  ```

### 4. Non-keyboard-reachable map panning on South Pole Map
- **Severity**: HIGH
- **Location**: `src/components/map/PoleMap.tsx:314-325`
- **What is wrong**: The South Pole Map SVG announces `role="region"` with `aria-label="South pole map in polar stereographic projection with landing sites. Drag to pan, scroll to zoom."`, but `<svg className="pole-map__svg">` lacks `tabIndex={0}` and has no `onKeyDown` handler. Panning is strictly pointer-bound (`onPointerDown`/`onPointerMove`), leaving keyboard-only users unable to pan across the polar stereographic projection.
- **Evidence / Failing Scenario**: Tab through the South Pole Map panel. Focus moves directly from the map header to the zoom buttons (`+`, `−`, `Site`, `All`) and site markers, completely skipping the map canvas. Keyboard users cannot inspect landing regions outside the initial view bounding box.
- **Suggested Fix**:
  Add `tabIndex={0}` to the SVG element and handle arrow keys in `onKeyDown` to adjust the projection center `setCenter()`:
  ```tsx
  const onMapKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = 20 * (view.w / MAP_SIZE)
    if (e.key === 'ArrowLeft') setCenter((c) => ({ ...c, x: c.x - step }))
    else if (e.key === 'ArrowRight') setCenter((c) => ({ ...c, x: c.x + step }))
    else if (e.key === 'ArrowUp') setCenter((c) => ({ ...c, y: c.y + step }))
    else if (e.key === 'ArrowDown') setCenter((c) => ({ ...c, y: c.y - step }))
    else return
    e.preventDefault()
  }
  ```

### 5. Radiogroup in Sound controls lacks WAI-ARIA arrow key navigation and roving tabindex
- **Severity**: HIGH
- **Location**: `src/components/sound/SoundToggle.tsx:108-146`
- **What is wrong**: `<div className="sound-control__modes" role="radiogroup" aria-labelledby="sound-mode-label">` wraps three `<button role="radio">` items ("Off", "Ambient", "Cues"), but all three have default `tabIndex={0}` and no `onKeyDown` handler. In the WAI-ARIA Radio Group pattern, the radiogroup must be a single tab stop with arrow keys moving focus and selection between options.
- **Evidence / Failing Scenario**: Navigate with `Tab` into the sound controls. Tabbing moves through all three buttons sequentially rather than treating the radiogroup as a single tab stop. Pressing `ArrowRight` or `ArrowLeft` does not change the selected sound mode.
- **Suggested Fix**:
  Apply roving tabindex (`tabIndex={mode === m ? 0 : -1}`) to each radio button, and handle ArrowLeft/ArrowUp/ArrowRight/ArrowDown to switch modes:
  ```tsx
  const onRadioKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const modes: SoundMode[] = ['off', 'ambient', 'cues']
    const idx = modes.indexOf(mode)
    let next = idx
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % modes.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + modes.length) % modes.length
    else return
    e.preventDefault()
    handleModeClick(modes[next])
    // focus the newly selected radio button
  }
  ```

### 6. Small touch targets (<32 px) on Fullscreen and SkyHelp corner buttons
- **Severity**: MEDIUM
- **Location**: `src/components/common/FullscreenButton.css:2-15`
- **What is wrong**: CSS variable `--corner-btn-size: 28px;` defines the dimensions of `.fs-button` (Fullscreen button) and `.sky-help__marker` (Sky help `(?)` marker) with `width: 28px; height: 28px; min-width: 0; min-height: 0; padding: 0;`. This violates both the 32 px requirement in the audit brief and the 40 px touch target rule in `RULES-quality.md`.
- **Evidence / Failing Scenario**: Touch screen and tablet users tapping the full screen toggle in `PolarPanel`, `Panorama`, `SurfaceView`, or the `(?)` help marker in `SimpleView` encounter a 28 px × 28 px interactive bounding box.
- **Suggested Fix**:
  Increase `--corner-btn-size` to at least `32px` (or `36px`/`40px`), or add a pseudo-element hit-area expander in `FullscreenButton.css`:
  ```css
  :root {
    --corner-btn-size: 32px;
  }
  .fs-button::after,
  .sky-help__marker::after {
    content: '';
    position: absolute;
    inset: -4px;
  }
  ```

### 7. Small touch targets (<32 px) on South Pole Map navigation tools
- **Severity**: MEDIUM
- **Location**: `src/components/map/map.css:472-478` and `src/components/map/PoleMap.tsx:455-468`
- **What is wrong**: `.pole-map__tools button` specifies `min-width: 1.75rem; min-height: 1.75rem; padding: 0.1rem 0.4rem;` (28 px × 28 px), creating undersized hit targets for the Zoom in (`+`), Zoom out (`−`), `Site`, and `All` buttons.
- **Evidence / Failing Scenario**: In `map.css:473-474`, buttons override the global 40 px button dimensions down to 1.75rem (28 px), creating hard-to-tap targets on touch screens and high-DPI displays.
- **Suggested Fix**:
  Increase button size in `map.css`:
  ```css
  .pole-map__tools button {
    min-width: 2.25rem;
    min-height: 2.25rem;
    padding: 0.25rem 0.5rem;
  }
  ```

### 8. Colour-only differentiation between Sun and Earth curves in Elevation Chart
- **Severity**: MEDIUM
- **Location**: `src/components/chart/chart.css:183-199` and `src/components/chart/ElevationChart.tsx:283-298`
- **What is wrong**: The Sun and Earth elevation series curves rendered in the SVG chart are both solid lines with identical stroke-width (2.2), differentiated exclusively by colour (`#ffc233` amber vs `#4aa8ff` blue). `RULES-quality.md` specifies: *"colour is never the only carrier (add text, shape or pattern)"*.
- **Evidence / Failing Scenario**: When viewed by a user with color vision deficiency (deuteranopia/protanopia) or printed/projected in grayscale, the intersecting curves cannot be distinguished from each other without hovering to read the text readout.
- **Suggested Fix**:
  Add a distinctive dashed stroke pattern to the Earth elevation line in `chart.css`, and update `.elevation-section__swatch--earth` to reflect the dashed pattern:
  ```css
  .chart__line--earth {
    stroke: var(--earth, #4aa8ff);
    stroke-width: 2.2;
    stroke-dasharray: 4 2;
  }
  .elevation-section__swatch--earth {
    background: transparent;
    border-top: 2px dashed var(--earth, #4aa8ff);
  }
  ```

### 9. Colour-only differentiation between Sun and Earth tracks and rim markers in SkyPlot and Panorama
- **Severity**: MEDIUM
- **Location**: `src/components/sky/sky.css:47-61,120-131` and `src/components/sky/SkyPlot.tsx:85-89`
- **What is wrong**: In both `SkyPlot` and `Panorama`, `.sky__track--sun` and `.sky__track--earth` are identical continuous solid lines (stroke-width 1.5) differing only by stroke colour. Likewise, `RimMarker` on the polar plot rim renders identical circles (`<circle r={6} />`) for both Sun and Earth with only stroke colour differing.
- **Evidence / Failing Scenario**: Under monochromatic projection or for color-blind evaluators, the Sun and Earth diurnal tracks in the sky plot and panorama cannot be distinguished by shape or pattern.
- **Suggested Fix**:
  Add `stroke-dasharray: 4 2;` to `.sky__track--earth` in `sky.css`. In `SkyPlot.tsx:88`, render the Earth rim marker as a square or diamond instead of an identical circle:
  ```tsx
  function RimMarker({ body, kind }: { body: BodyReadout; kind: 'sun' | 'earth' }) {
    if (body.el >= -RIM_MARKER_BELOW_DEG) return null
    const { x, y } = polarToXY(body.az, 0, 1, RIM_R, 0, 0)
    if (kind === 'earth') {
      return <rect className="sky__marker sky__marker--earth" x={x - 5} y={y - 5} width={10} height={10} />
    }
    return <circle className="sky__marker sky__marker--sun" cx={x} cy={y} r={6} />
  }
  ```

### 10. Invisible focus indicator on SVG Timeline cursor and mission bar `<g>` sliders
- **Severity**: MEDIUM
- **Location**: `src/components/timeline/timeline.css:89-97,302-305` and `src/components/timeline/Timeline.tsx:413-427,455-469`
- **What is wrong**: In `Timeline.tsx`, `<g className="tl__cursor" tabIndex={0} role="slider">` and `<g className="tl__bar-group" tabIndex={0} role="slider">` receive keyboard focus. Their focus style is defined as `.tl__cursor:focus-visible { outline: 2px solid var(--focus); }`. In SVG, container `<g>` elements have no CSS box model geometry, so Chromium and WebKit do not render CSS `outline` on `<g>` elements.
- **Evidence / Failing Scenario**: Press Tab to focus the timeline time cursor or mission bar in Chrome/Blink or Safari. No visible focus indicator appears on screen, violating WCAG 2.4.7 (Focus Visible) and `RULES-quality.md` (*"visible focus ring everywhere"*).
- **Suggested Fix**:
  Style the child SVG graphic elements upon `:focus-visible`, or use `:focus-within` on the parent HTML container:
  ```css
  .tl__cursor:focus-visible line {
    stroke: var(--text);
    stroke-width: 3;
    filter: drop-shadow(0 0 3px var(--focus));
  }
  .tl__cursor:focus-visible polygon {
    stroke: var(--text);
    stroke-width: 2;
  }
  .tl__bar-group:focus-visible .tl__bar {
    stroke-width: 3px;
    filter: drop-shadow(0 0 4px var(--focus));
  }
  ```

### 11. Dynamically mounted `role="status"` live region in Compare Table ignored by screen readers
- **Severity**: MEDIUM
- **Location**: `src/components/compare/CompareTable.tsx:235-239`
- **What is wrong**: The link copy confirmation message is rendered conditionally: `{copyP.mounted && (<span role="status" className="compare-status-msg presence-fade">{copyP.value}</span>)}`. When a `role="status"` element is dynamically inserted into the DOM with text already present, assistive technologies (NVDA/JAWS) do not register a content change and fail to announce the notification.
- **Evidence / Failing Scenario**: In CompareTable, click "Copy table link" or press Enter on the button using a screen reader. The text "Table link copied" appears visually, but the screen reader remains silent because the live region was not pre-mounted in the DOM.
- **Suggested Fix**:
  Keep the status element permanently mounted in the DOM and update its text content dynamically (matching `ShareMenu.tsx:219`):
  ```tsx
  <span role="status" aria-live="polite" className="compare-status-msg">
    {copyP.mounted ? copyP.value : ''}
  </span>
  ```

### 12. Ambiguous generic button labels in Site Library without site context
- **Severity**: MEDIUM
- **Location**: `src/components/library/SiteLibrary.tsx:252-276`
- **What is wrong**: In `SiteLibrary`, each site row provides two action buttons labelled solely as "Use here" and "Compare" without an `aria-label` specifying the site name.
- **Evidence / Failing Scenario**: Screen reader users navigating by buttons or viewing a list of form controls hear repetitive "Use here, button" and "Compare, button" announcements without knowing which lunar landing site is referenced.
- **Suggested Fix**:
  Provide descriptive accessible labels including the site name:
  ```tsx
  <button
    type="button"
    onClick={() => handleUseHere(site.id)}
    disabled={isActive}
    aria-label={`Use ${site.name} in active scenario`}
  >
    Use here
  </button>
  <button
    type="button"
    onClick={() => handleCompare(site.id)}
    disabled={!canCompare}
    aria-label={`Compare ${site.name} in a new scenario`}
  >
    Compare
  </button>
  ```

### 13. Missing `prefers-reduced-motion` handling for entrance animations in Timeline and Map
- **Severity**: LOW
- **Location**: `src/components/timeline/timeline.css:348-376` and `src/components/map/map.css:68-70`
- **What is wrong**: In `timeline.css`, `@keyframes mission-info-in` and `@keyframes chip-in` run keyframe transitions without reduced-motion suppression (only `.tl__skeleton` is disabled at line 138). Likewise, `.moon-map-viewport` in `map.css:69` executes `animation: map-reveal` unconditionally.
- **Evidence / Failing Scenario**: Users with vestibular disorders or OS-level `prefers-reduced-motion: reduce` enabled experience sliding and shifting animations when event chips or mission info update in the timeline.
- **Suggested Fix**:
  Add animation overrides inside `@media (prefers-reduced-motion: reduce)`:
  ```css
  /* timeline.css */
  @media (prefers-reduced-motion: reduce) {
    .tl__skeleton,
    .tl__mission-info,
    .chip {
      animation: none !important;
    }
  }

  /* map.css */
  @media (prefers-reduced-motion: reduce) {
    .moon-map-viewport {
      animation: none !important;
    }
  }
  ```

### 14. Empty landmark region exposed by collapsed Disclosure component
- **Severity**: LOW
- **Location**: `src/components/ui/Disclosure.tsx:42-50`
- **What is wrong**: `<div id={panelId} role="region" aria-label={title}>` is rendered in the DOM permanently, even when collapsed (`presence.mounted` is false).
- **Evidence / Failing Scenario**: When disclosure sections (e.g. "Dates and slip", "Elevation chart") are collapsed, screen reader landmark lists still expose empty landmark regions with no content inside, causing rotor clutter.
- **Suggested Fix**:
  Only attach `role="region"` when the section is expanded:
  ```tsx
  <div id={panelId} role={open ? 'region' : undefined} aria-label={open ? title : undefined}>
  ```

### 15. SiteSelect combobox lacks scenario context across multiple scenario cards
- **Severity**: LOW
- **Location**: `src/components/scenario/SiteSelect.tsx:32-46`
- **What is wrong**: Each scenario card renders a `<select id={id}>` with generic label `<label htmlFor={id}>Site</label>`. When multiple scenarios are compared on the board, screen reader forms lists display multiple duplicate "Site" comboboxes.
- **Evidence / Failing Scenario**: A screen reader user navigating form controls encounters four identical "Site" comboboxes with no indication of which card or comparison slot each belongs to.
- **Suggested Fix**:
  Pass the scenario title or index and set `aria-label`:
  ```tsx
  <select
    id={id}
    value={siteId}
    onChange={onChange}
    aria-label={`Site for scenario ${scenarioId}`}
    onClick={(e) => e.stopPropagation()}
  >
  ```

### 16. WindowMap canvas cell navigation relies solely on live region without table/grid semantics
- **Severity**: LOW
- **Location**: `src/components/finder/WindowMap.tsx:600-605`
- **What is wrong**: The Window Map canvas container is given `role="region"` with `tabIndex={0}`, managing arrow key navigation via state and an `aria-live` region, rather than exposing an accessible HTML `<table>` or ARIA `grid` with row and column headers.
- **Evidence / Failing Scenario**: Screen reader users cannot use standard table navigation keys (e.g. Ctrl+Alt+Arrows in NVDA/JAWS) to read column dates and row site names in a structured matrix.
- **Suggested Fix**: Provide a toggleable accessible table view (analogous to `ElevationTable` in `ElevationChart`), or expose virtual `role="grid"`, `role="row"`, and `role="gridcell"` elements.
- **DECISION**: Lead must decide whether to build a full tabular alternative for WindowMap or retain the canvas + aria-live implementation.

### 17. Missing `type="button"` on Mode and Observer Height toggle buttons in TopBar
- **Severity**: LOW
- **Location**: `src/app/TopBar.tsx:48,62-68`
- **What is wrong**: `<button key={m.id} aria-pressed={mode === m.id}>` and `<button key={h} aria-pressed={observerHeightM === h}>` omit explicit `type="button"`.
- **Evidence / Failing Scenario**: HTML `<button>` elements without explicit `type` default to `type="submit"`. While harmless in a header outside forms, explicit `type="button"` is standard accessibility practice to avoid accidental form submissions if nested.
- **Suggested Fix**:
  Add `type="button"` to each toggle button:
  ```tsx
  <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
    {m.label}
  </button>
  ```
