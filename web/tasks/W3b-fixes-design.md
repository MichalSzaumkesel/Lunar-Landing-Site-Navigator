# Task W3b: fixes from the design and accessibility review (plus map performance)

Background (read-only): `tasks/reviews/R3-design-a11y.md` (findings from line 151; contrast tables), `tasks/reviews/R1-correctness.md` finding 5. Also read `tasks/UI-guidelines.md`. You cannot see the browser; keep changes mechanical and safe. Fix only what is listed.

## Writable paths

`src/app/theme.css`, `src/app/PresetBar.tsx`, `src/app/TopBar.tsx`, `src/app/Transport.tsx`, `src/components/map/**`, `src/components/library/library.css`, `src/components/badges/**`, `src/components/scenario/*.tsx` and `scenario.css` (but not `cardLogic.ts`), `src/components/finder/MissionRulesForm.tsx` and finder CSS (but not `WindowMap.tsx`), `src/components/sky/*.css`, `src/components/timeline/*.css`, `src/components/share/**`, `src/components/sound/SoundToggle.tsx`. Another worker edits logic files, `SiteLibrary.tsx` and `WindowMap.tsx` at the same time: do not touch them.

## Items

1. **One primary button per view.** In `theme.css` define three variants: `button.primary` (amber fill, the only one per view), `button` default (secondary, outlined), `button.ghost` (text only). Make Play the only primary button in the shell; the Apollo vs Artemis preset becomes secondary with a stronger label weight. Remove duplicate local button styles (for example `.card button.ghost` in `scenario.css`) in favour of the global ones.
2. **Tokens.** Move `--space-1..6` (4, 8, 12, 16, 24, 32 px) from `scenario.css` to `theme.css` `:root`. Add `--control-border: #566b93` and use it for the borders of buttons, inputs, selects and range tracks (3:1 against the panels); keep `--line` for subtle panel dividers. Make the timeline inactive track a solid `#2e3b56` fill with a 1 px `--control-border` outline. Replace hard-coded colours in components with tokens (the review lists them) and put the map category colours and badge colours in `theme.css`.
3. **Map markers by shape as well as colour** (`MoonMap.tsx`, in both the main map and the polar inset): apollo circle, clps square, commercial diamond, international triangle, artemis_region hexagon (or star), custom plus-in-circle; same size class (about 10 px), the active site is filled, selected sites have a ring. Add the same shapes to the legend. Keep the keyboard behaviour.
4. **Touch targets.** Interactive controls at least 40 px high and wide in the top bar, transport, tabs, card controls, chips, library buttons and map form (use padding, not bigger fonts). Do not shrink the data views.
5. **Accessible names and relations.** Give controls in the cards unique names that include the card (for example `aria-label="Slip, days, <site name>"` on the slip slider, `Remove scenario <site name>`); the mission rules form: every error message is linked with `aria-describedby` and has `role="alert"` or `aria-live="polite"`, and the input gets `aria-invalid`; the map coordinate form the same; the sound toggle shows a visible on/off state beyond colour (text is already there; add a `data-state` and an icon-free state mark such as a filled or hollow dot with `aria-hidden`).
6. **Reduced motion.** In `theme.css` add `@media (prefers-reduced-motion: reduce)` that removes transitions and smooth scrolling; nothing in the shell may autoplay. If any component animates on mount, gate it.
7. **Slider semantics.** The slip slider and the time scrubber use native `input[type=range]` with `aria-valuetext` giving a human value ("14 days later", "+36.5 h from window start").
8. **Map performance during Play** (R1 finding 5): in `MapPanel.tsx` recompute the shading grid and terminator only when the cursor time changed by at least 15 simulated minutes or at most every 250 ms of real time (whichever is later), reuse one `ImageData` and one canvas context across draws (no allocation per redraw), and keep markers memoised. Add a pure helper for the throttling decision with a test.
9. **Jargon in Simple-facing labels**: keep technical terms in Advanced, but where a label says "Clearance" add a `title` in plain words ("how far the centre of the Sun is above the terrain"). Only add titles, do not rename.

## Acceptance

`npm run typecheck`, `npm run lint` and `npm test` exit 0. Report per item: done, or why not. List any component whose markup you changed in a way that could shift the layout so the lead can look at it in the browser.
