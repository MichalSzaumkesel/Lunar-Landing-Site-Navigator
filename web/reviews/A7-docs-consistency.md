# Review A7: Documentation Consistency Audit

## Summary (Top 5 Findings)
1. HIGH: `docs/demo-script.md:21` - Pressing Space to play immediately after choosing a preset re-opens the scenario menu because focus stays on the trigger button.
2. HIGH: `docs/demo-script.md:48` - Fallback reload instruction `/?tour=0` strips `m=a` and silently resets the app to Simple mode.
3. HIGH: `docs/demo-script.md:26` - Demo script cites "Window map" tab and "window length" input; UI labels are "Window finder" and "Mission length".
4. MEDIUM: `docs/status-B.md:28` - Claims no screenshots exist in the repository, but all 6 screenshots are present in `docs/screenshots/`.
5. MEDIUM: `docs/pitch.md:18` - Claims 39 of 39 validation checks pass, but `web/public/data/validation.json` has 41 of 41 passing checks.

---

## Findings (Ordered by Severity)

### Finding 1
- **Severity**: HIGH
- **Location**: `docs/demo-script.md:21` (also affects line 25)
- **Description**: The demo script instructs the presenter to select the preset in the Add scenario menu and then press Space to play. Pressing Space immediately re-opens the menu instead of starting playback.
- **Evidence**: In `src/components/scenario/AddScenarioMenu.tsx:78-80`, clicking a preset closes the menu and returns focus to `triggerRef.current` (`<button aria-label="Scenario menu: add a card or load a preset">`). In `src/app/useShortcuts.ts:54-56`, `(tag === 'button' || tag === 'a') && isSpace` returns `null` to preserve native keyboard button click. The Space keypress therefore re-triggers the button and re-opens the menu.
- **Fix**: `DECISION:` Either blur the trigger button upon preset selection in `AddScenarioMenu.tsx`, or update `docs/demo-script.md:21` to instruct the presenter:
```markdown
open the **Add scenario** menu and choose **Compare: Apollo 11 (equator) vs South Pole (Artemis candidate region)**, then click the **Play** button on the timeline (or click the background before pressing **Space**) to play at 12 hours per second.
```

### Finding 2
- **Severity**: HIGH
- **Location**: `docs/demo-script.md:48`
- **Description**: Fallback instructions state "Unexpected state or misclick: reload the page at `/?tour=0`", which unexpectedly drops Advanced mode and resets the app to Simple mode.
- **Evidence**: In `src/state/urlState.ts:89-94`, omission of `m=` defaults to `mode: 'simple'` (`m=s`). Since the demo runs in Advanced mode (`/?m=a&tour=0`), navigating to `/?tour=0` strips `m=a`, destroying the scenario board layout.
- **Fix**: Update `docs/demo-script.md:48` to:
```markdown
- **Unexpected state or misclick**: reload the page (`F5` or `Ctrl+R`) to keep URL state, or navigate to `/?m=a&tour=0`.
```

### Finding 3
- **Severity**: HIGH
- **Location**: `docs/demo-script.md:26`
- **Description**: Step 1:30 - 1:45 instructs opening the "Window map" tab and changing the "window length", but neither label exists in the UI.
- **Evidence**: In `src/app/Panels.tsx:17`, the lower panel tab is labeled **"Window finder"** (`label: 'Window finder'`). In `src/components/finder/MissionRulesForm.tsx:220`, the input field is labeled **"Mission length"**.
- **Fix**: `DECISION:` Either rename the tab in `Panels.tsx` to "Window map", or update `docs/demo-script.md:26` to:
```markdown
Open the **Window finder** tab in the lower panel. Change one value in the **Mission rules** form, for example the **Mission length**.
```

### Finding 4
- **Severity**: MEDIUM
- **Location**: `docs/status-B.md:28`
- **Description**: Under "Not verified / open", status claims "No screenshots in the repository yet (README lists planned files)", which is contradicted by repository files.
- **Evidence**: `docs/screenshots/` contains all 6 screenshot PNGs referenced by `README.md:9-19`: `01-compare-scenario-cards.png`, `02-polar-sky-plot-and-loupe.png`, `03-surface-3d.png`, `04-sunniest-spot.png`, `05-window-map.png`, and `06-simple-mode.png`.
- **Fix**: Update `docs/status-B.md:28` to:
```markdown
- All 6 UI screenshots are captured and committed in `docs/screenshots/`.
```

### Finding 5
- **Severity**: MEDIUM
- **Location**: `docs/pitch.md:18`
- **Description**: Section 3 heading claims 39 of 39 validation checks pass, which is outdated.
- **Evidence**: `web/public/data/validation.json` contains 41 check entries (`checks.length === 41`), and all 41 have `pass: true`. `docs/status-B.md:21` correctly cites 41 of 41 checks pass.
- **Fix**: Update `docs/pitch.md:18` to:
```markdown
## 3. Validation (41 of 41 checks pass; `web/public/data/validation.json`)
```

### Finding 6
- **Severity**: MEDIUM
- **Location**: `README.md:51`
- **Description**: Mission rules presets are described as "Presets for 168 h, 240 h and 336 h stays", but the presets in the UI are 72 h, 168 h, and 336 h.
- **Evidence**: In `src/components/finder/MissionRulesForm.tsx:185-208`, the preset buttons are "Short stay, 3 days" (72 h), "One week" (168 h), and "Lunar day, 14 days" (336 h). 240 h is the default example restored by the reset button, not a preset button.
- **Fix**: `DECISION:` Either add a 240 h preset button in `MissionRulesForm.tsx`, or update `README.md:51` to:
```markdown
- Mission rules: Mission length, minimum Sun share, maximum dark stretch, Earth in view at landing and Earth share. Presets for 72 h, 168 h and 336 h stays (240 h default).
```

### Finding 7
- **Severity**: MEDIUM
- **Location**: `README.md:70`
- **Description**: Button for the guided tour is identified as `Tour` button, but the UI button is labeled `Tutorial`.
- **Evidence**: In `src/app/TopBar.tsx:88-90`, the top bar button renders text `Tutorial` (`aria-label="Open the tutorial"`).
- **Fix**: Update `README.md:70` to:
```markdown
- Guided tour (`Tutorial` button) and a demo narration (`Demo` button).
```

### Finding 8
- **Severity**: MEDIUM
- **Location**: `README.md:69`
- **Description**: Simple mode is described as offering "one sky plot", omitting the Panorama and 3D surface views available in Simple mode.
- **Evidence**: In `src/components/simple/DiagramStage.tsx:112-127` and `src/components/simple/diagramView.ts:7-11`, Simple mode includes a view switch offering **Polar**, **Panorama**, and **3D** views.
- **Fix**: Update `README.md:69` to:
```markdown
- Simple mode: switchable Polar, Panorama, and 3D views with plain-language summaries for teaching and public demonstrations.
```

### Finding 9
- **Severity**: MEDIUM
- **Location**: `docs/status-B.md:20`
- **Description**: Test file and test execution counts in status B are outdated ("93 test files, 932 tests").
- **Evidence**: Running `npm test` executes 109 test files and 1051 tests (all passing).
- **Fix**: Update `docs/status-B.md:20` to:
```markdown
- `npm run typecheck`, `npm run lint` and `npm test` pass: 109 test files, 1051 tests pass (wave 53, local, Windows).
```

### Finding 10
- **Severity**: LOW
- **Location**: `README.md:45`
- **Description**: 3D camera modes and quick views description is incomplete.
- **Evidence**: In `src/viz3d/SurfaceView.tsx:822-882`, camera modes are labeled "On the surface" and "Overview", and quick view / tracking lock buttons exist for "Face the lander", "Face the Sun", and "Face the Earth".
- **Fix**: Update `README.md:45` to:
```markdown
- Two camera modes: On the surface and Overview; quick view and tracking lock toward the lander, Sun or Earth.
```

### Finding 11
- **Severity**: LOW
- **Location**: `README.md:47,53`
- **Description**: Feature names in README differ slightly from UI button and tab labels ("Sunlight heatmap" vs "Sunlight map"; "Window map" vs "Window finder").
- **Evidence**: In `src/viz3d/SurfaceView.tsx:919`, the button is labeled **"Sunlight map"**. In `src/app/Panels.tsx:17`, the tab is labeled **"Window finder"**.
- **Fix**: Update `README.md:47` to cite "Sunlight map" and `README.md:53` to cite "Window finder (site-by-date matrix of landing windows)".

### Finding 12
- **Severity**: LOW
- **Location**: `docs/demo-script.md:27`
- **Description**: Step 1:45 - 2:00 says "Click the share control to copy the link", which elides the menu selection step.
- **Evidence**: In `src/components/share/ShareMenu.tsx:188-250`, the tool button is labeled **"Share and export"**. Clicking it opens a dropdown where the user must select **"Copy link"**.
- **Fix**: Update `docs/demo-script.md:27` to:
```markdown
| **1:45 - 2:00** | Switch to **Simple** mode. Open the **Share and export** menu and click **Copy link**. End. |
```

### Finding 13
- **Severity**: LOW
- **Location**: `docs/status-B.md:27,30,38`
- **Description**: Relative links within `docs/status-B.md` use self-referential `docs/` prefixes or lack directory traversal for root files.
- **Evidence**: Inside `docs/status-B.md`, `docs/demo-script.md` and `docs/pitch.md` resolve to non-existent nested `docs/docs/*` paths in standard markdown viewers. `CRITICAL.md` is in the repository root, requiring `../CRITICAL.md`.
- **Fix**: Update references in `docs/status-B.md` to `demo-script.md`, `pitch.md`, and `../CRITICAL.md`.

### Finding 14
- **Severity**: LOW
- **Location**: `docs/pitch.md:48` and `docs/demo-script.md:33`
- **Description**: Sibling document paths inside `docs/*.md` specify redundant `docs/` folder prefix.
- **Evidence**: `docs/pitch.md:48` refers to `docs/sources.md` and `docs/method.md`. `docs/demo-script.md:33` refers to `docs/pitch.md`. When navigated relatively from inside `docs/`, these links fail.
- **Fix**: Remove `docs/` prefix for sibling files (`sources.md`, `method.md`, and `pitch.md`).
