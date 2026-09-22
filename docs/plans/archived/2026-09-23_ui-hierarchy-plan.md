# UI Hierarchy Plan

## Goal

Make the terminal-first workbench faster to scan by consolidating header chrome, strengthening navigation hierarchy, simplifying sidebar metadata, and making status summaries actionable without reducing terminal or mobile functionality.

## Plan

- [x] Consolidate the desktop global header and Herdr tab bar into one workbench header; covered by `tests/app.test.tsx` and desktop/tablet/mobile Playwright checks.
- [x] Replace passive status counts with high-contrast filter buttons that open a filtered Mission Control view; covered by `tests/app.test.tsx`.
- [x] Add collapsible worktree groups, full-name hover disclosure, and stronger selected states while reducing repeated sidebar metadata; covered by `tests/app.test.tsx` and sidebar Playwright checks.
- [x] Simplify and regroup terminal toolbar controls while preserving accessible names, focus states, and mobile targets; covered by interactive terminal and viewport Playwright checks.
- [x] Run formatting, type/build, and focused UI tests; `npm run ci` and all 102 Playwright tests pass.

## Completion Checklist

- [x] The normal desktop workbench has two header layers before terminal content: a combined global/tab header and a compact terminal toolbar.
- [x] Status chips are keyboard-accessible and open the corresponding filtered Agent overview.
- [x] Worktree groups can be collapsed and truncated navigation labels expose their full value.
- [x] Active workspace, Agent, and tab states are visually distinct in light and dark themes.
- [x] Relevant tests and repository checks pass.
