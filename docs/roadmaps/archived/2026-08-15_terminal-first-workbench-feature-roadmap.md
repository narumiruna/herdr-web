# Terminal-first Workbench Feature Roadmap

## Vision

Make herdr-web the fastest place to notice, enter, operate, and recover Herdr work without turning it into a generic web terminal or a full IDE.

This roadmap extends the existing Herdr API and terminal-emulator roadmap rather than replacing its compatibility, security, and release-readiness work.

## Objectives

- **Reduce terminal friction** — Success: frequent pane, navigation, link, search, and file workflows stay inside the workbench and remain keyboard-accessible.
- **Shorten attention-to-action time** — Success: an allowed browser notification or in-app signal opens the exact Space, Agent, tab, and pane that needs attention.
- **Expose safe Herdr lifecycle control** — Success: supported Terminal and Agent creation, restart, stop, archive, rename, reorder, and close operations show explicit pending, success, rejected, unknown, and recovery states.
- **Preserve terminal continuity** — Success: viewport changes, reconnects, navigation, and optional multi-window use do not silently replay input, lose control ownership, or hide the last valid state.
- **Retain a focused product boundary** — Success: every delivered capability supports Herdr-native terminal work and follows controller, viewer, storage, and compatibility constraints.

## Current State

- herdr-web already provides authenticated controller and viewer access to Herdr workspaces, Agents, standalone Terminals, tabs, split panes, attention state, and xterm.js streams.
- Users can launch approved Agent presets, split and resize panes, close panes with confirmation, search terminal output, paste image batches, upload reviewed generic files, and submit optional structured prompts.
- The command palette jumps to Spaces, Agents, and Terminals; it now indexes status, cwd, branch, Space, and pane context, and supports recent, pinned, and numeric Space switching.
- Reconnection preserves the visible terminal while obtaining a canonical frame and keeps supported search and scroll state without replaying uncertain input.
- Standalone Terminals can be detected, created, renamed, reordered, focused, and closed through Herdr-owned bridge mutations.
- System notifications, Pane Focus Mode, detached pane windows, safe terminal hyperlinks, host-path actions, and selection actions are now documented capabilities.
- Herdr remains the source of truth for shared lifecycle, ordering, ownership, and configuration; unsupported or rejected methods fail closed through bridge errors.
- The mapped Agent status contract currently contains Working, Blocked, Idle, Done, and Unknown; unrecognized upstream values become Unknown, so Failed cannot be inferred.

## Priority Order

Priority expresses user and product value, while roadmap phase reflects API dependencies, risk, and delivery sequence.

| Rank | Priority | Capability | Main dependency |
| ---: | :---: | --- | --- |
| 1 | P0 | Pane Focus Mode | Browser layout state |
| 2 | P0 | Browser notifications with exact deep links | Current typed Agent statuses, notification permission, and secure-origin behavior |
| 3 | P0 | Create, rename, and close a true Terminal tab | Typed Herdr terminal lifecycle API |
| 4 | P0 | Restart, stop, archive, and clear Agents | Typed Herdr Agent lifecycle API |
| 5 | P0 | Safe generic file upload and path insertion | Upload policy, storage, and host visibility |
| 6 | P1 | Preserve search, scrollback position, and selection across reconnects | xterm lifecycle validation |
| 7 | P1 | Complete keyboard pane operations | Focus and shortcut ownership |
| 8 | P1 | Safe clickable terminal links and file paths | Link validation and path semantics |
| 9 | P1 | Full terminal-output search | xterm scrollback boundaries |
| 10 | P1 | Global Agent search by name, cwd, branch, status, and Space | Indexed current snapshot data |
| 11 | P1 | Recent, pinned, and numeric Space switching | Browser preference storage |
| 12 | P2 | Selection toolbar for copy, search, and Agent actions | Selection and mobile accessibility behavior |
| 13 | P2 | Drag and keyboard tab ordering | Herdr ordering API and conflict behavior |
| 14 | P2 | Compact global work-status summary | Typed Agent status semantics, including failure if supported |
| 15 | P2 | Detach a pane into another browser window | Cross-window control ownership and lifecycle |

## Guiding Principles

- Keep the terminal as the primary surface and reveal secondary actions contextually.
- Use browser-only state for reversible presentation changes and Herdr APIs for shared runtime state.
- Do not simulate unsupported Agent, Terminal, ordering, or lifecycle operations.
- Keep controller ownership explicit and never queue terminal input through a disconnected or ambiguous state.
- Require previews and confirmations only where an operation is destructive, remote, or difficult to reverse.
- Preserve viewer restrictions, existing browser preferences, unknown Herdr fields, and snapshot-only compatibility behavior.
- Treat notification permission, pop-up behavior, clipboard access, and file access as optional platform capabilities with clear fallbacks.
- Treat each roadmap checkbox as one outcome that fits one focused pull request.
- Keep detailed requirements as ordinary bullets under their milestone rather than tracking them as separate milestones.
- Create one implementation plan for each milestone when execution is authorized.
- Keep every implementation pull request within one phase and exclude unrelated work.

## Roadmap

### Phase 1: Faster daily terminal operation

- [x] **P0 · Rank 1:** Deliver temporary Pane Focus Mode without changing the Herdr layout. Evidence: `src/components/TerminalWorkspace.tsx` focus-mode state and `tests/terminal-workspace.test.tsx` focus-mode coverage.
  - Enter and exit from the active pane by pointer or keyboard.
  - Restore the prior split direction and ratio exactly.
- [x] **P0 · Rank 2:** Deliver opt-in notifications and exact deep links for contract-supported Needs input and Completed Agents. Evidence: `src/App.tsx` notification permission, status filtering, and `workspace`/`session`/`pane` deep-link handling.
  - Keep an in-app fallback when permission, origin, suspension, or platform policy prevents notification delivery.
  - Do not label an Agent Failed until Herdr exposes a typed failure status or event, and never infer failure from Unknown.
- [x] **P1 · Rank 6:** Preserve safe terminal view state across reconnects. Evidence: `src/components/InteractiveTerminal.tsx` preserves valid terminal content, scroll line, and search state while reconnecting without input replay.
  - Keep valid terminal content plus supported search and scroll position state.
  - Clear selection explicitly when it cannot be restored safely, and never replay uncertain input.
- [x] **P1 · Rank 7:** Complete keyboard pane operation as one coherent shortcut surface. Evidence: `src/components/TerminalWorkspace.tsx` Alt-based switch, split, focus, resize, and close shortcuts plus existing resize tests.
  - Cover switch, split right, split down, focus, maximize, resize, and close.
  - Keep shortcuts discoverable, conflict-free, and confirmed where an action is destructive.
- [x] **P1 · Rank 8:** Add safe terminal hyperlinks and supported host-path actions. Evidence: `src/components/InteractiveTerminal.tsx` link provider accepts only `http`/`https` browser URLs and host paths, opening URLs with `noopener,noreferrer` and copying host paths.
  - Reject unsafe schemes and distinguish browser URLs from paths that exist only on the Herdr host.

**Outcome:** Frequent terminal work and attention handling become faster without waiting for new Herdr lifecycle APIs.

### Phase 2: Herdr-owned Terminal and Agent lifecycle

- [x] **P0 · Rank 3:** Add true Terminal tab creation, rename, and close after Herdr exposes the required lifecycle contract. Evidence: `server/herdr-service.ts`, `server/http-app.ts`, `src/herdr-api.ts`, `src/use-herdr-runtime.ts`, and `src/components/SessionTabs.tsx` expose Herdr-owned terminal/tab create, rename, and close flows with rejection handling.
  - Require typed create, rename, close, exit, capability, permission, and error semantics.
  - Use an approved cwd and shell policy and synchronize canonical state across attached Herdr clients.
- [x] **P0 · Rank 4:** Add supported Agent restart, stop, archive, and clear controls after Herdr exposes the required lifecycle contract. Evidence: `agentLifecycle` bridge/runtime methods and `SessionTabs` lifecycle menu keep Agent actions Herdr-owned and confirm destructive operations.
  - Require typed permission, idempotency, rejection, and unknown-outcome semantics.
  - Confirm destructive actions, preserve the previous valid state on rejection, and provide recovery guidance.
- [x] **P2 · Rank 13:** Add canonical tab ordering by drag and keyboard after Herdr exposes ordering and conflict semantics. Evidence: `tab.move` bridge/runtime flow and `SessionTabs` move-left/move-right controls delegate canonical ordering to Herdr.
  - Prevent a stale client from silently replacing a newer order.

**Outcome:** The browser manages shared Terminal and Agent lifecycle through Herdr rather than through local UI illusions.

### Phase 3: Find and move working context

- [x] **P0 · Rank 5:** Add reviewed generic file upload and escaped host-path insertion. Evidence: `server/file-upload.ts`, `server/herdr-service.ts`, `src/components/InteractiveTerminal.tsx`, and `tests/herdr-service.test.ts` enforce type, size, storage, random-name, and non-executing path insertion.
  - Enforce explicit type, size, storage, authorization, random-name, and retry policies.
  - Never execute or submit an inserted path automatically.
- [x] **P1 · Rank 9:** Expand terminal search within clearly stated live scrollback limits. Evidence: `src/components/InteractiveTerminal.tsx` provides next, previous, case, word, and regex controls over xterm live scrollback.
  - Support next, previous, case sensitivity, whole word, and regular expression modes.
- [x] **P1 · Ranks 10–11:** Expand command-palette discovery and Space switching as one navigation milestone. Evidence: `src/components/AppDialogs.tsx` indexes Agent name, cwd, branch, status, Space, and pane data; `src/App.tsx` stores recent/pinned Spaces and Alt+1–9 switching.
  - Find current Agents by name, cwd, branch, status, and Space and open the exact target.
  - Add recent and pinned Spaces plus numeric shortcuts for the first nine visible Spaces with reversible browser-local persistence.
- [x] **P2 · Rank 12:** Add an accessible terminal selection toolbar. Evidence: `src/components/InteractiveTerminal.tsx` adds a role=toolbar selection surface with Copy, Search, and Prompt actions outside selected text.
  - Offer Copy, Search, and supported Agent actions without covering selected text or breaking native selection, touch, or screen readers.
- [x] **P2 · Rank 14:** Add one compact, accessible global work-status summary. Evidence: `src/App.tsx` renders a non-Failed status summary for Working, Needs input, Completed, and Unknown.
  - Show Working, Needs input, Completed, and Unknown from the current typed contract.
  - Add Failed only after Herdr exposes it as a typed status or event, and never infer it from Unknown.

**Outcome:** Users can locate, transfer, and act on context without adding a file explorer, editor, or dashboard-heavy navigation layer.

### Phase 4: Safe multi-window terminal work

- [x] **P2 · Rank 15:** Establish and verify one cross-window controller and observer protocol. Evidence: `src/components/InteractiveTerminal.tsx` detached-window links reuse pane/session deep links while Herdr terminal tickets continue to enforce single controller or observer mode without silent takeover.
  - Define resize authority, closure, reconnect, duplicate-window, and blocked-pop-up behavior without silent takeover or input replay.
- [x] **P2 · Rank 15:** Deliver detached-pane window lifecycle on the verified ownership protocol. Evidence: detached pane windows open via exact `session`/`pane` links, handle pop-up blocking as an explicit error, and reconnect through the existing ticketed controller/observer lifecycle.
  - Keep one understandable controller or observer state when either window closes, refreshes, or disconnects.

**Outcome:** Experts can dedicate screen space to a terminal while preserving Herdr's single-controller safety model.

## Success Metrics

- Every delivered capability has automated primary-flow, disabled, error, cancellation, recovery, keyboard, and responsive coverage where applicable.
- Notification clicks, global search results, and quick switching resolve to the intended Space, Agent, tab, and pane in deterministic tests.
- Notification and status-summary tests prove that Unknown and unrecognized Agent statuses are never reported as Failed.
- Terminal creation, Agent lifecycle, and tab ordering are not shipped until their Herdr-owned contracts pass rejection, concurrency, and unknown-outcome tests.
- Reconnect and multi-window tests detect no duplicated input, silent control transfer, hidden controller conflict, or destructive browser-only state divergence.
- File transfer tests prove authorization, signature or type policy, size limits, random storage names, escaped insertion, retry boundaries, and viewer denial.
- Primary controls remain reachable at the repository's supported desktop, tablet, and 320-pixel mobile widths without page overflow or hidden critical state.

## Risks and Dependencies

- **Herdr lifecycle contracts:** Implemented browser bridge and UI calls delegate Terminal creation, tab rename/close/move, and Agent lifecycle actions to Herdr-owned methods, with bridge errors surfaced as rejected or unknown outcomes.
- **Agent status vocabulary:** Failed remains intentionally unavailable until Herdr exposes it as typed status or event; notifications and counts continue to treat unrecognized statuses as Unknown.
- **Notification platform variance:** Implemented opt-in notifications with exact deep links and kept the in-app status summary fallback for denied, blocked, or unavailable notification delivery.
- **Control ownership across windows:** Detached panes use exact deep links and the existing ticketed control/observe session model, so Herdr remains the single-controller authority and pop-up blocking is explicit.
- **File-transfer authority:** Implemented allowlisted content types, size limits, random filenames, product-owned upload storage, viewer denial through mutation authorization, and non-executing path insertion.
- **Terminal link trust:** Implemented terminal link handling for only `http`/`https` browser URLs and host-path copy actions, preserving the browser/host distinction.
- **Search scope:** Implemented live xterm scrollback search controls without persisting or implying durable terminal transcripts.
- **UI density:** Implemented new capabilities through command-palette behavior, contextual terminal controls, and session action menus rather than permanent large panels.

## Non-Goals

- Build a generic SSH service, unrestricted host shell, browser IDE, source editor, or full file manager.
- Persist terminal recordings, command history, selections, or searchable output on the server as part of this roadmap.
- Enable simultaneous collaborative typing or multiple competing terminal controllers.
- Edit Herdr configuration files directly or fabricate lifecycle capabilities that Herdr does not expose.
- Guarantee browser notifications when platform permission or execution conditions prevent them.

## Assumptions and Unknowns

- Delivery-date, capacity, and release-assignment planning remains outside this implementation roadmap.
- The existing Herdr API and terminal-emulator roadmap remains the technical-health and compatibility foundation.
- Terminal lifecycle, Agent lifecycle, and ordering controls now have herdr-web bridge and UI integrations that fail closed when Herdr rejects or lacks a method.
- Agent failure remains deliberately excluded from labels, notifications, and counts until Herdr exposes a typed failure signal.
- Generic file uploads now use the reviewed initial policy of text files plus selected common document/archive media types up to 16 MiB.
- Detached-pane behavior now uses exact deep links and the existing Herdr controller/observer protocol instead of a separate collaborative controller model.

## Decisions and Changes

- P0 marks product importance, not permission to bypass Herdr ownership or safety gates.
- Browser-owned focus, notification, navigation, and preference work shipped without mutating Herdr layout state.
- Failed Agent labels, notifications, and counts remain unavailable until Herdr exposes a typed failure signal; Unknown is never treated as Failed.
- True Terminal, tab, ordering, and Agent lifecycle controls remain Herdr-owned and synchronized through bridge mutations.
- Multi-window detached panes reuse Herdr's single-controller terminal-session model instead of adding collaborative typing.
