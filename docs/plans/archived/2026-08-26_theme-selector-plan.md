# Theme Selector Plan

## Goal

Add four saved workbench themes to Menu → Settings: Editorial Light, Editorial Dark, Classic Light, and Classic Dark, with Classic reproducing the pre-editorial visual style while preserving current behavior and accessibility hardening.

## Assumptions

The selected four-theme model combines visual style and appearance in one setting.
Existing saved light/dark appearance values migrate to the matching Editorial theme.
The top-bar and mobile appearance shortcuts continue to switch only the light/dark half of the selected style.

## Plan

- [x] Add a typed theme preference model and migrate saved appearance values to Editorial Light or Editorial Dark; verified by `tests/theme-preferences.test.ts`, App tests, and first-load Playwright migration coverage.
- [x] Scope the semantic token system to Editorial themes and add accessible Classic light/dark tokens plus pre-editorial visual overrides; verified by all four theme classes, style-specific metadata, focus/control contrast, dark dialog shadows, and Classic screenshot deltas below 0.15% against the original diagnostic images.
- [x] Replace the Settings appearance choices with four named theme choices while preserving terminal-size settings and hardened dialog behavior; verified by unit and Playwright selection, persistence, short-height scrolling, focus-return, and mobile tests.
- [x] Update visual and behavioral coverage for all four themes while keeping Editorial baselines deterministic; verified with reviewed Darwin and Linux Editorial and Classic baselines, 166 Vitest tests, and 30 Playwright tests.
- [x] Update README theme documentation and PR #18; verified by final source review, `npm run ci` with 166 Vitest tests, `npm run test:e2e` with 30 Playwright tests, `git diff --check`, and successful GitHub Actions run 32875837914.

## Completion Checklist

- [x] Menu → Settings exposes exactly four discoverable theme choices.
- [x] Classic Light and Classic Dark reproduce the previous warm Radix Sand/Amber visual style while retaining current dialog, focus, responsive, and terminal hardening.
- [x] Theme selection persists, old appearance preferences migrate compatibly, and appearance shortcuts preserve the selected style.
- [x] All automated checks pass and PR #18 is updated with successful CI.
