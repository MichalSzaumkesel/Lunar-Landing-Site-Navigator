# UI guidelines (scope B) for the final polish and the Simple/Advanced agent

Distilled from a colleague's checklist, adapted to a dark, data-heavy app shown on a projector. Follow them when you touch styles or add controls.

## Apply

- **One primary action per view.** Primary style (amber fill) is used for one thing only: Play (and the Apollo vs Artemis preset on first load). Everything else is secondary (outlined) or ghost (text only). Define three button variants in `app/theme.css` and use only those.
- **Spacing scale.** Tokens `--space-1..6` = 4, 8, 12, 16, 24, 32 px. All margins, paddings and gaps use them. Space inside a group is never larger than the space around the group (proximity).
- **Type scale.** Four sizes (12 captions and svg labels, 14 body and readouts, 16 control labels, 20 titles) and two weights (400, 600). The system font stack stays. Minimum 12 px everywhere, body 14 px or more for the projector.
- **Colour roles.** Neutral surfaces carry most of the screen. The amber/blue/green trio is reserved for data (Sun, Earth, both) and for the single primary action; do not use them as decoration. Warning orange is only for the synthetic badge.
- **Contrast.** Text and controls meet WCAG AA (4.5:1 text, 3:1 large text and control borders) against their surface; check `--muted` on `--panel`. Keep the near-black background (not pure `#000`) and off-white text.
- **Progressive disclosure.** This is the Simple/Advanced switch: Simple shows one scenario, three presets, Play, and plain sentences; Advanced shows everything. Inside Advanced, rarely used options (observer height, mission rules, vertical exaggeration) live in collapsible groups.
- **Feedback.** Every async action has a loading state (skeletons exist), every toggle shows its pressed state, errors are plain language ("Could not load data for this site. Try another site."), a visible focus ring everywhere.
- **Easy exits.** A "Reset view" button restores the default scenario; presets can always be re-applied; the tutorial can be skipped and reopened from a small "?" button; custom coordinates are validated before use with an inline message.
- **Consistency.** Same icons, same wording ("Sun visible", "Earth in view"), same tooltip style for definitions.

## Component checklist (every new UI piece)

- Has loading, empty or outside-range, error and normal states (see `RULES-quality.md`).
- Uses only theme tokens (colours, spacing, type scale); no hard-coded hex or pixel values in components.
- Layout: designed for a 1280 px wide projector first, still usable at 1024 px and on a tablet; the board stacks to one column below 900 px. No horizontal page scroll.
- Controls: native elements first (`button`, `select`, `input[type=range]`); a visible label or `aria-label`; the pressed or selected state is visible without colour alone; tooltips use `title` with the contract definition.
- Copy: short, factual, professional; sentence case; no emoji, no exclamation marks, no jargon in Simple mode (say "how high the Sun is", not "clearance"). Numbers keep units and UTC is stated.
- Motion: only what explains something (the cursor, the discs); durations under 200 ms for UI transitions; nothing starts by itself.
- Simple mode copy pattern: one plain sentence per fact, for example "The Sun is above the horizon. It sets in 31 hours." generated from the metrics, never typed by hand.

## Adapt, do not copy

- Generous whitespace: yes between groups, but the sky plot, timeline and readouts stay dense; this is a tool, not a landing page.
- 60-30-10: use the idea (neutral dominant, one accent), not the exact ratios, because data colours carry meaning.
