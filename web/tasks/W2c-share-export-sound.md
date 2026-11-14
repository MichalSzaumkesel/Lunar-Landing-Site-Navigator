# Task W2c: share link button, CSV export, optional sound cues (TypeScript + React)

## Goal

Three small features: a "Copy link" button, a CSV export of the scenario metrics, and optional synthesized sound cues for sunset, sunrise, Earth set and Earth rise during Play. Sound is off by default. Also read `tasks/UI-guidelines.md`.

## Writable paths

`src/components/share/**`, `src/components/sound/**`, `src/lib/exportCsv.ts`, `src/lib/exportCsv.test.ts`, `src/lib/sound.ts`, `src/lib/sound.test.ts`.

## Read-only references

`src/state/urlState.ts` and `src/state/useUrlSync.ts` (`shareUrl`), `src/state/store.ts`, `src/state/selectors.ts`, `src/lib/metrics.ts` (`computeMetrics`, `ScenarioMetrics` in `types.ts`), `src/lib/events.ts` (`listSkyEvents`), `src/lib/useSiteBundle.ts`, `src/app/theme.css`.

## Spec

### Share link: `components/share/ShareButton.tsx`

A button "Copy link" that copies `shareUrl()` to the clipboard (`navigator.clipboard.writeText`, with a fallback that selects a read-only text input when the Clipboard API is unavailable), shows "Link copied" for 2 seconds in an `aria-live="polite"` region, and an inline plain error ("Could not copy. Copy the address from the box.") with the fallback input. The button is a secondary style.

### CSV export: `lib/exportCsv.ts` and `components/share/ExportButton.tsx`

- `scenariosToCsv(rows: Array<{ siteName: string; siteId: string; lat: number; lon: number; startUtc: string; endUtc: string; slipDays: number; observerHeightM: number; synthetic: boolean; approximate: boolean; metrics: ScenarioMetrics | null }>): string`: RFC 4180 CSV, header row, one row per scenario, UTF-8, `\r\n` line ends, quotes around fields containing comma, quote or newline (quotes doubled), numbers rounded to 3 decimals, empty cell for null, columns named after the contract metric names (`pct_sunlit`, `mean_sun_frac`, `longest_dark_h`, `pct_earth`, `longest_no_earth_h`, `pct_both`, `next_sunset_utc`, `next_sunrise_utc`, `next_earthset_utc`, `next_earthrise_utc`, `time_to_sunset_h`, `time_to_earthset_h`, `sun_el_deg`, `sun_clearance_deg`). A first comment-free header only; add `synthetic` and `approximate` columns so exported fake data is never mistaken for real.
- `downloadText(filename: string, text: string, mime?: string): void` creating a Blob and a temporary anchor (revoke the object URL afterwards).
- `ExportButton`: "Export CSV" button; for every scenario in the store loads the bundle with `dataSource.loadSite` (from `lib/loader`), computes `computeMetrics` for the scenario window with the store's observer height and the cursor as `refMs`, builds the CSV and downloads `lunar-scenarios-<YYYYMMDD>.csv`. Disabled with a tooltip while loading; error text on failure.

### Sound: `lib/sound.ts`, `components/sound/SoundToggle.tsx`, `components/sound/useEventSounds.ts`

- `lib/sound.ts`: `createSoundEngine(): SoundEngine` with `enable(): void` (creates the `AudioContext` lazily, only called from a user gesture), `disable(): void`, `isEnabled(): boolean`, `cue(kind: 'sunset' | 'sunrise' | 'earthset' | 'earthrise'): void`. Cues are synthesized with the Web Audio API (no audio files): sunset two sine notes falling (440 Hz then 330 Hz, 0.18 s each), sunrise two rising (330 then 440), Earth set one low soft tone (261 Hz, 0.3 s), Earth rise one higher (392 Hz, 0.3 s); each with a 20 ms attack and an exponential decay, master gain 0.08. Rate limit: ignore a cue that arrives less than 350 ms after the previous one. Must not throw when `AudioContext` is unavailable (return silently). Keep a pure helper `cuePlan(kind)` returning the notes (frequency, start offset, duration) so it is testable without audio.
- Persistence: the on/off preference in `localStorage` key `lunar.sound` with try/catch around every access (storage can be blocked); default off.
- `SoundToggle`: a button with `aria-pressed`, label "Sound on" / "Sound off" (text, not only an icon), default off, a tooltip "Short tones when the Sun or Earth rises or sets during Play".
- `useEventSounds()`: a hook mounted once. While `playing` is true and sound is enabled, it watches the shared cursor of the active scenario and plays the cue of every event of that scenario (from `listSkyEvents` computed once per bundle, observer height and window; get the bundle with `useSiteBundle`) whose time lies between the previous cursor time and the current one (use a store subscription, `useAppStore.subscribe`, not a render-per-frame effect; keep the previous cursor in a ref). Skip all cues while the speed is above 72 hours per second (they would be noise) and when the cursor jumped backwards or by more than 12 hours in one step (a manual seek).

## Tests

`scenariosToCsv` (quoting, null cells, rounding, header names, line endings, a row with commas and quotes in the site name), `cuePlan` per kind, the rate limiting helper if you make it a pure function (pass timestamps in), the event-window selection helper (events between two cursor times, ignoring seeks) as a pure function in `lib/sound.ts` or a sibling file.

## Acceptance

`npm run typecheck` and `npm run lint` exit 0; `npx vitest run src/lib/exportCsv src/lib/sound` exits 0. Report test counts and list every exported component and hook with its props for the lead's wiring.
