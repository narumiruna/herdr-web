# Match the original Herdr sidebar

## Goal

Match the original Herdr sidebar shown in the user-provided screenshot. Use the original hierarchy, labels, and compact presentation instead of designing a new navigation model.

## Context

- The screenshot places Spaces above a New / Menu action row and an independent Agents panel below it. The Agents heading has a compact ordering control at the right.
- `0ee1321` replaced the independent Agents panel with nested Agent lists under Spaces. Its parent revision contains the previous herdr-web panel, sorting, and divider code, but is not the visual reference.
- Implementation is authorized on `narumi/fix/restore-herdr-sidebar` from `origin/main`.
- Verified upstream reference: [`herdrdev/herdr@5bd900d`](https://github.com/herdrdev/herdr/tree/5bd900d88c80d95f5b145397e45bbeea398b8165).
  - `src/config/model.rs` defaults to Spaces ordering; the header displays `grouped`. Clicking the header toggles `grouped` / `priority`.
  - `src/client/shell/agent_sidebar.rs` orders priority by Needs input, Done, Working, Idle, Unknown, then descending `state_change_seq`. Grouped ordering follows snapshot workspace/tab order. herdr-web also supports Failed; keep failures first rather than treating them as Unknown.
  - `src/config/sidebar.rs` uses two-line Agent rows: status icon and Space name with an optional tab label, then Agent runtime name. Tab labels appear for multiple tabs or a custom tab name. Space rows use status and name, then branch details. `src/client/shell/sidebar.rs` also shows hidden worktree attention on a collapsed repository row; Spaces without a detected Agent retain an Unknown status icon.
  - `src/client/shell/sidebar.rs` places New and Menu at the bottom of the Spaces section; attention is indicated on Menu rather than a separate top-level button.
  - `src/client/shell/state.rs` and `src/ui/sidebar.rs` use a saved draggable split, default 50%, clamped to 10–90%. Keep web panel minimum heights and disable resizing in very short viewports so both panels remain usable.
  - Browser adaptation: keep the existing compact product mark, themes, semantic status labels, and accessible controls. Do not add configurable sidebar token templates or upstream remote-machine sections.
  - API compatibility: `src/api/schema/tabs.rs` omits the shell-only `custom_label` flag. Infer custom labels from `workspace.tab_display_name` in `src/workspace.rs`: automatic labels are the one-based tab position. Preserve explicit flags when present. Use snapshot tab position for sidebar ordering because `tab.number` is a stable identifier, not the current position.
  - The snapshot API cannot distinguish an explicit custom label equal to the automatic position label. In that case a single-tab row omits the redundant tab suffix; tab access remains unchanged.

- Final verification:
  - `npm run ci`: 41 test files and 543 tests passed; package, production build, and font checks passed. Biome reports 40 warnings; the production build reports a large-chunk warning.
  - `npm run test:e2e`: final batches passed 67 sidebar/workbench cases, 25 theme cases, and 5 terminal clipboard/rendering cases, using one or two workers.
  - Reviewed desktop, mobile, and 390×320 screenshots against the supplied hierarchy. Screenshots remain outside version control.
  - Focused source review corrected API tab-label inference, moved-tab ordering, semantic icon colors, and accessible tab/runtime identity. Pointer cancellation and lost capture, invalid saved preferences, viewer restrictions, and Agent draft/image continuity are tested.
  - Reviewed the complete diff for correctness, security, lifecycle safety, compatibility, regressions, and scope. No authorization, network mutation, or terminal lifecycle path changed.
  - During concurrent runs, browser checks timed out. One full CI run also timed out in the unchanged Herdr subscription test. The focused client recheck and final full CI passed; final browser batches passed without concurrent checks.

## Architecture

- Keep Spaces and Agents as separate, independently scrollable lists.
  - Show Space names, branch details, worktree indentation, and the current selection as in the reference.
  - Keep New and Menu between the two lists.
  - Show detected Agents across all Spaces in the lower panel without requiring Space expansion.
  - Match the reference Agent identity, secondary text, status indicators, and selection treatment.
  - Use one small ordering control beside the Agents heading; do not add a segmented control or a filter toolbar.
- Use the original Herdr behavior to determine ordering modes, default ordering, and Agent labels. Confirm these details before implementation rather than inferring them from the screenshot.
- Retain keyboard access, visible focus, and accessible names for browser controls.
- Keep the existing workbench outside the sidebar unchanged.

## Non-Goals

- Redesign the terminal, tab bar, composer, dialogs, or runtime integration.
- Add dashboards, cards, new navigation sections, or an additional top-level Attention Inbox button.
- Copy the entire pre-simplification herdr-web interface.
- Add panel resizing merely because the previous web implementation supported it. Confirm the original behavior first.

## Plan

- [x] Compare the screenshot with the original Herdr sidebar implementation; record its ordering modes, default ordering, Agent labels, action placement, and panel sizing behavior in this plan before changing application code. Evidence: pinned upstream files recorded in Context.
- [x] Replace nested Agent navigation in `apps/web/src/components/Sidebar.tsx` with the original two-panel hierarchy and middle New / Menu row; verify all detected Agents remain directly selectable and standalone Terminals do not appear as Agents.
- [x] Match the original Agent row content and compact ordering control; verify ordering and selected states with `apps/web/tests/sidebar.test.tsx`.
- [x] Update `apps/web/src/App.tsx` only for the required sidebar state and callbacks; retain supported saved preferences and verify selection, drafts, and desktop/mobile continuity with app tests.
- [x] Update sidebar CSS to match the reference hierarchy, spacing, and density within the existing appearance system; verify independent scrolling, visible action controls, long names, and short viewports in browser tests.
- [x] Update affected Playwright assertions to check the restored hierarchy and compare the desktop sidebar against the supplied reference; verify mobile navigation remains usable without changing the terminal layout.

## Completion Checklist

- [x] Original Herdr behavior is verified and the first task records the implementation reference.
- [x] Spaces, New / Menu, and Agents appear in the reference order; Agent navigation does not require Space expansion.
- [x] Agent rows and ordering match the verified original behavior; no duplicate nested Agent list or additional navigation section remains.
- [x] Desktop, mobile, and short-viewport browser checks pass with both lists and action controls usable.
- [x] `npm run ci` passes.
- [x] Affected Playwright tests pass through `npm run test:e2e -- <affected test files>`.
- [x] Diff review confirms that changes are limited to the sidebar, required wiring, related tests, and navigation documentation.
