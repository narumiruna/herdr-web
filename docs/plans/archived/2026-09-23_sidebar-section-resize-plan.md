# Sidebar Section Resize Plan

## Goal

Let users resize the divider between the SPACES and AGENTS sections while keeping both sections usable, keyboard accessible, and consistent across desktop and mobile navigation.

## Plan

- [x] Add a controlled horizontal resize handle and bounded ratio for the sidebar sections; verified by `tests/sidebar-section-resize-handle.test.tsx`.
- [x] Persist the chosen section ratio in `App` and share it between desktop and mobile sidebars; verified by `tests/app.test.tsx`.
- [x] Update sidebar layout and themes so the divider exposes clear hover, focus, and drag states without changing terminal-first navigation.
- [x] Exercise pointer resizing and persistence in the browser; verified by the focused Playwright scenario.

## Completion Checklist

- [x] `npm run check` passes.
- [x] Focused Vitest tests pass; full `npm test` also passes (382 tests).
- [x] Focused Playwright resize coverage passes.
- [x] `npm run build` passes.
