# Review R3: design, usability and accessibility (static review)

Read `tasks/_review.md` and `tasks/UI-guidelines.md` first. Report file: `tasks/reviews/R3-design-a11y.md`. You cannot see the browser, so review the markup, CSS and the pure view logic.

Scope: `src/app/**` (theme tokens, shell), `src/components/**` (CSS and TSX), `index.html`.
- Compare the CSS and markup with `UI-guidelines.md`: hard-coded colours or pixel values instead of tokens, a second primary-styled button on one view, text below 12 px (SVG) or 14 px (body), spacing outside the 4/8 scale, inconsistent button or tooltip styles, layout that breaks below 900 px or causes horizontal scroll.
- Contrast: compute WCAG contrast ratios with a short script for every text and control colour pair defined in the CSS variables (text on panel, muted on panel, accent on panel, borders against surfaces, badge colours, map category colours against the map background, timeline band colours against their track). List the failing pairs (below 4.5:1 for text, 3:1 for large text and control borders) with the exact ratios and a replacement value that passes.
- Accessibility: keyboard reachability of every control, visible focus, accessible names, roles of the custom widgets (tabs, slider timeline, map markers, window map canvas), `aria-live` use, SVG `role="img"` labels, colour used as the only carrier of meaning, `prefers-reduced-motion` handling, touch target sizes (40 px), form labels and error messages association.
- Usability: first-screen clarity for a newcomer, the number of competing controls, wording that is jargon, empty and error states, what a jury member sees in the first 5 seconds. Suggest a concrete layout for Simple mode (one scenario, three presets, Play, plain sentences) and for the Advanced mode shell (where the map, library, window map and rules form go), as short ASCII wireframes.
Rank by impact on a projector demo and on a first-time user.
