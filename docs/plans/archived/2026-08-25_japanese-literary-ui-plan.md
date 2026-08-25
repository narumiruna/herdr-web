# Japanese Literary UI Plan

## Goal

Restyle herdr-web as a calm, contemporary Japanese independent-bookstore workbench while preserving its terminal-first hierarchy, existing behavior, accessibility, light and dark appearances, and responsive layouts.

## Context

The current interface already uses warm Radix Sand colors, Amber accents, Bricolage Grotesque, IBM Plex Mono, and JetBrains Mono, but its dense pills, rounded SaaS controls, and technical typography make it feel more utilitarian than editorial.
The UI is organized across `src/styles.css`, `src/styles-tabs.css`, `src/styles-workbench.css`, and `src/styles-overlays.css`, with `src/styles.css` and `src/styles-overlays.css` exceeding 1,000 lines.
Appearance state and behavior are covered by Vitest and Playwright, while the existing Playwright screenshots are diagnostic artifacts rather than committed visual-regression baselines.
On 2026-08-25, `npm run check` and the focused Playwright test `desktop workbench gives the terminal priority` passed against the current UI.

## Visual Brief

The reviewed baseline screenshots are the deterministic 1536×960 light and dark workbench and 390×844 mobile workbench produced by the focused Playwright tests before the stylesheet split.
The baseline has the correct terminal-first density, but broad near-white or near-black planes, pill-shaped status treatments, rounded utility controls, and sans-heavy headings make the hierarchy feel technical rather than editorial.
The approved light palette uses paper `#f6f3ed`, raised paper `#fffdfa`, sumi `#26231f`, secondary ink `#625b52`, decorative rules `#d3ccc1`, and 3:1 control borders `#948b7e`.
The approved dark palette uses paper `#11110f`, raised paper `#1c1b18`, sumi `#eeeae1`, secondary ink `#bbb4a8`, decorative rules `#34322d`, and 3:1 control borders `#706b61`.
Muted indigo communicates working and information, vermilion communicates needs input and limited emphasis, moss communicates success, and a distinct muted red communicates errors.
Zen Old Mincho at 500 and 600 is limited to the brand and display headings, while Bricolage Grotesque remains the control and body face and IBM Plex Mono remains the metadata face.
Corner radii use a restrained 1–6 px scale, most controls and status blocks use 2 px corners, dialogs and terminal shells use 3 px corners, and circles remain reserved for state dots.
Spacing follows a 4 px base rhythm with 8–16 px working gaps, fine one-pixel dividers, flat paper layers, and shadows reserved for dialogs and the primary terminal shell.
The sidebar keeps Needs input, Spaces, and Agents in the current order; the active item receives a vermilion rule rather than a rounded card; tabs use a fine baseline and active vermilion underline; dialogs use raised paper and serif headings; terminal chrome uses fine rules while xterm.js keeps its independent high-contrast dark palette.

## Tech Stack

The work will keep React 19, Radix Themes and primitives, Radix Colors, xterm.js, CSS custom properties, Vitest, and Playwright.
`@fontsource/zen-old-mincho` will provide only its required Latin 500 and 600 weight files for editorial display roles, while JetBrains Mono and the terminal renderer remain unchanged.

## Non-Goals

- Changing Herdr APIs, application state, navigation behavior, terminal ownership, prompt delivery, or persistence.
- Adding Japanese localization, decorative Japanese text, anime motifs, ornamental illustrations, or skeuomorphic paper textures.
- Replacing the xterm.js color model, JetBrains Mono terminal typography, ANSI behavior, or the dark-default appearance preference.
- Adding a third appearance mode or migrating existing browser preferences.

## Assumptions

The approved visual direction is restrained and editorial: warm washi-like neutrals, sumi ink, muted indigo, a small vermilion accent, fine rules, generous rhythm, serif display type, and minimal decoration.
The light appearance should carry the strongest bookshop and magazine character, while the dark appearance should translate the same hierarchy into subdued sumi tones rather than becoming a separate neon terminal theme.
English product copy and the existing information architecture remain intact.
The redesign is expected to remain CSS-led without changing `src/App.tsx`; if visual acceptance requires structural JSX changes, the plan must be revised and approved before implementation continues.

## Risks

The subjective style goal could be met inconsistently across surfaces unless tokens and reference screenshots are approved before detailed component work.
A Japanese-capable font package can be large, so only required subsets may enter the browser bundle and the production asset delta must be measured.
Low-contrast warm palettes, thin rules, and muted status colors can reduce accessibility unless contrast and focus states are measured in both appearances.
Pixel snapshots can become flaky when fonts or animation are not deterministic, so visual tests must wait for `document.fonts.ready` and disable motion.
Large stylesheet edits can introduce cascade regressions, so files must be split without changing import order before visual rules are revised.

## Plan

- [x] Capture the current desktop light, desktop dark, and 390 px mobile demo screens from the deterministic Playwright state, then append the target token palette, typography roles, corner-radius scale, spacing rhythm, and representative sidebar/tab/dialog/terminal treatments to this plan as its visual brief; verified by reviewing the three diagnostic baseline images and recording the approved brief above before visual CSS changes.
- [x] Split `src/styles.css`, `src/styles-overlays.css`, and the near-limit `src/styles-workbench.css` into foundation, navigation, chrome, dialog, terminal, and responsive files through the ordered `src/styles-entry.ts`; verified at the safe checkpoint by source-preserving extraction, `npm run check`, passing focused desktop/mobile Playwright tests, a pixel-identical mobile image, and desktop deltas limited to 156 and 231 transient animation pixels.
- [x] Add `@fontsource/zen-old-mincho` to `package.json` and `package-lock.json`, import only its Latin 500 and 600 weight files from `src/main.tsx`, and assign it only to the brand and display headings while retaining sans and mono roles elsewhere; verified by loaded-face Playwright assertions and `npm run check:font-assets`, which found four emitted `.woff`/`.woff2` assets totaling 71,560 bytes.
- [x] Replace the surface variables with semantic light and dark paper, sumi, rule, indigo, vermilion, moss, danger, focus, and shadow tokens while preserving the browser theme colors and visible status text/icons; verified against rendered Radix mappings, WCAG AA text/status pairs, 3:1 control/focus thresholds, terminal-scoped focus, and unchanged theme metadata in Playwright.
- [x] Restyle the brand, navigation, workbench chrome, statuses, tabs, states, controls, and scrollbars with flat paper layers, fine dividers, restrained radii, and limited vermilion; verified at 1536×960 with terminal area above 70% of the work surface, a top bar below 60 px, and unchanged behavioral/accessibility-name assertions.
- [x] Restyle dialogs, forms, palette, settings, details, banners, tooltips, menus, and mobile sheets from the shared hierarchy; verified with focus-return and keyboard tests, visible status distinctions, a scrollable 320×500 Settings dialog, complete 390 px mobile workflows, and overflow assertions.
- [x] Harmonize terminal shells, toolbars, pane controls, split handles, composer, fallback output, and detached chrome without changing xterm.js behavior or colors; verified by terminal focus contrast, split/resizing tests, composer geometry, two-dimensional 44 px mobile target assertions, and unchanged rendering, zoom, search, paste, and streaming suites.
- [x] Update `e2e/herdr-web.e2e.ts` to assert redesigned area, semantic rendered colors, contrast, loaded font faces, focus, touch targets, dialog reachability, and responsive bounds instead of brightness; verified with reviewed desktop light, desktop dark, and mobile light baselines for Darwin and Linux after fonts are ready and reduced motion is active.
- [x] Update the README appearance description to state the restrained Japanese editorial direction and independent high-contrast terminal behavior; verified against the implemented modes with no customization claim.
- [x] Run focused and final verification and inspect 1536×960, 840×900, 390×844, and 320×700 artifacts; on 2026-08-26, `npm run ci` passed with 163 Vitest tests, `npm run test:e2e` passed with 25 Playwright tests, the three Linux visual baselines passed in the Playwright container, and `git diff --check` passed.

## Completion Checklist

- [x] The reviewed desktop light, desktop dark, and mobile baselines visibly share warm paper, sumi, indigo, vermilion, moss, fine rules, and Zen Old Mincho display type.
- [x] Existing terminal-first layout, behavior, accessible names, saved appearance values, and switching remain compatible; verified by all behavioral tests and focused Playwright keyboard checks for palette, dialogs, Escape, and focus return.
- [x] Text, status, focus, and control contrast pass the documented thresholds in both appearances, including rendered Radix status mappings and terminal-scoped focus, with no exceptions.
- [x] The interface has no page overflow or clipped primary workbench controls at 1536×960, 840×900, 390×844, and 320×700; verified from Playwright bounds and reviewed screenshots.
- [x] Every `src/styles*.css` file remains below 1,000 lines; `wc -l` reports a maximum of 924 lines, and source review confirms foundation, navigation, chrome, tab, fallback terminal, live terminal, overlay, and responsive boundaries.
- [x] Added font assets stay within the 300 KiB browser-build budget; the enforced build check reports four Latin 500/600 `.woff` and `.woff2` files totaling 71,560 bytes.
- [x] `npm run ci`, `npm run test:e2e`, and `git diff --check` pass on the final tree; results are recorded above.
- [x] Final source and documentation review confirms the diff is limited to planned UI styles, shared style loading, visual tests/baselines, font dependency/budget checks, README, and this plan, with no API, state, persistence, or terminal-protocol changes.
