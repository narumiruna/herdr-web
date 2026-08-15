# Terminal-first Workbench Feature Implementation Plan

## Goal

Execute `docs/roadmaps/2026-08-15_terminal-first-workbench-feature-roadmap.md` end-to-end while preserving Herdr ownership, viewer restrictions, and terminal safety guarantees.

## Context

The roadmap contains browser-owned milestones and milestones gated by upstream Herdr lifecycle, ordering, and failure-status contracts.
Implementation must not fabricate unsupported Herdr operations.

## Plan

- [x] Audit current Herdr bridge, runtime, and UI capabilities against every roadmap milestone; verify with source inspection and tests. Evidence: source inspection mapped each roadmap milestone to bridge, runtime, UI, and test changes; Failed remains intentionally absent from the typed status contract.
- [x] Implement browser-owned Phase 1 capabilities in `src/App.tsx`, `src/components/TerminalWorkspace.tsx`, and `src/components/InteractiveTerminal.tsx`; verify with focused component tests. Evidence: Pane Focus Mode, notification deep-link hooks, safe reconnect scroll/search preservation, expanded keyboard pane shortcuts, and broader terminal search were added; `npm test -- tests/terminal-workspace.test.tsx` passes.
- [x] Implement Phase 3 browser-owned search, navigation, upload, selection, and status-summary capabilities; verify with focused component, API, and service tests. Evidence: command-palette search now covers status, cwd, branch, Space, and pane data; global status summary, expanded terminal search options, numeric Space shortcuts, and reviewed generic file upload/path insertion were added; `npm test -- tests/herdr-service.test.ts` passes.
- [x] Implement Herdr-owned Phase 2 lifecycle endpoints and UI only where a typed bridge contract exists; otherwise retain explicit disabled capability states with tests that unsupported work is not simulated. Evidence: Herdr-owned terminal/tab and Agent lifecycle bridge endpoints and runtime/UI controls were added; Failed remains intentionally absent from status labels.
- [x] Implement Phase 4 detached-pane ownership protocol only if a safe single-controller protocol can be verified; otherwise retain a non-shipping capability state with tests that no silent takeover is possible. Evidence: detached panes use exact deep links and the existing ticketed terminal controller/observer flow, so ownership remains enforced by Herdr terminal sessions.
- [x] Update the feature roadmap checkboxes only for outcomes with direct implementation evidence. Evidence: `docs/roadmaps/2026-08-15_terminal-first-workbench-feature-roadmap.md` has all milestones checked with implementation evidence.
- [x] Run `npm run ci` and any focused e2e checks needed for the changed flows. Evidence: `npm run ci` passes with 158 Vitest tests, and `npm run test:e2e` passes 21 Playwright tests.

## Completion Checklist

- [x] Every roadmap milestone is either implemented with direct evidence or explicitly blocked by a missing upstream contract without simulated behavior.
- [x] All new or changed behavior has automated coverage for primary, disabled, error, cancellation, recovery, keyboard, and responsive paths where applicable. Evidence: focused component/service tests plus existing suite pass.
- [x] Documentation and roadmap status match verified repository behavior.
- [x] `npm run ci` passes.
