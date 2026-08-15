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
- Users can launch approved Agent presets, split and resize panes, close panes with confirmation, search terminal output, paste image batches, and submit optional structured prompts.
- The command palette already jumps to Spaces, Agents, and Terminals, while the sidebar already offers Grouped and Priority Agent ordering.
- Reconnection preserves the visible terminal while obtaining a canonical frame, but search state, scroll position, and selection continuity are not established product guarantees.
- Standalone Terminals can be detected and controlled, but the interface does not expose a dedicated create, rename, or lifecycle workflow for them.
- Generic file transfer, system notifications, pane maximization, detached panes, tab drag ordering, terminal hyperlinks, and selection actions are not documented capabilities.
- Herdr remains the source of truth and does not yet expose every typed lifecycle, ordering, or configuration mutation needed by the proposed controls.
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

- [ ] **P0 · Rank 1:** Deliver temporary Pane Focus Mode without changing the Herdr layout.
  - Enter and exit from the active pane by pointer or keyboard.
  - Restore the prior split direction and ratio exactly.
- [ ] **P0 · Rank 2:** Deliver opt-in notifications and exact deep links for contract-supported Needs input and Completed Agents.
  - Keep an in-app fallback when permission, origin, suspension, or platform policy prevents notification delivery.
  - Do not label an Agent Failed until Herdr exposes a typed failure status or event, and never infer failure from Unknown.
- [ ] **P1 · Rank 6:** Preserve safe terminal view state across reconnects.
  - Keep valid terminal content plus supported search and scroll position state.
  - Clear selection explicitly when it cannot be restored safely, and never replay uncertain input.
- [ ] **P1 · Rank 7:** Complete keyboard pane operation as one coherent shortcut surface.
  - Cover switch, split right, split down, focus, maximize, resize, and close.
  - Keep shortcuts discoverable, conflict-free, and confirmed where an action is destructive.
- [ ] **P1 · Rank 8:** Add safe terminal hyperlinks and supported host-path actions.
  - Reject unsafe schemes and distinguish browser URLs from paths that exist only on the Herdr host.

**Outcome:** Frequent terminal work and attention handling become faster without waiting for new Herdr lifecycle APIs.

### Phase 2: Herdr-owned Terminal and Agent lifecycle

- [ ] **P0 · Rank 3:** Add true Terminal tab creation, rename, and close after Herdr exposes the required lifecycle contract.
  - Require typed create, rename, close, exit, capability, permission, and error semantics.
  - Use an approved cwd and shell policy and synchronize canonical state across attached Herdr clients.
- [ ] **P0 · Rank 4:** Add supported Agent restart, stop, archive, and clear controls after Herdr exposes the required lifecycle contract.
  - Require typed permission, idempotency, rejection, and unknown-outcome semantics.
  - Confirm destructive actions, preserve the previous valid state on rejection, and provide recovery guidance.
- [ ] **P2 · Rank 13:** Add canonical tab ordering by drag and keyboard after Herdr exposes ordering and conflict semantics.
  - Prevent a stale client from silently replacing a newer order.

**Outcome:** The browser manages shared Terminal and Agent lifecycle through Herdr rather than through local UI illusions.

### Phase 3: Find and move working context

- [ ] **P0 · Rank 5:** Add reviewed generic file upload and escaped host-path insertion.
  - Enforce explicit type, size, storage, authorization, random-name, and retry policies.
  - Never execute or submit an inserted path automatically.
- [ ] **P1 · Rank 9:** Expand terminal search within clearly stated live scrollback limits.
  - Support next, previous, case sensitivity, whole word, and regular expression modes.
- [ ] **P1 · Ranks 10–11:** Expand command-palette discovery and Space switching as one navigation milestone.
  - Find current Agents by name, cwd, branch, status, and Space and open the exact target.
  - Add recent and pinned Spaces plus numeric shortcuts for the first nine visible Spaces with reversible browser-local persistence.
- [ ] **P2 · Rank 12:** Add an accessible terminal selection toolbar.
  - Offer Copy, Search, and supported Agent actions without covering selected text or breaking native selection, touch, or screen readers.
- [ ] **P2 · Rank 14:** Add one compact, accessible global work-status summary.
  - Show Working, Needs input, Completed, and Unknown from the current typed contract.
  - Add Failed only after Herdr exposes it as a typed status or event, and never infer it from Unknown.

**Outcome:** Users can locate, transfer, and act on context without adding a file explorer, editor, or dashboard-heavy navigation layer.

### Phase 4: Safe multi-window terminal work

- [ ] **P2 · Rank 15:** Establish and verify one cross-window controller and observer protocol.
  - Define resize authority, closure, reconnect, duplicate-window, and blocked-pop-up behavior without silent takeover or input replay.
- [ ] **P2 · Rank 15:** Deliver detached-pane window lifecycle on the verified ownership protocol.
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

- **Missing Herdr lifecycle APIs:** Terminal creation, Agent lifecycle, and canonical tab ordering depend on upstream typed methods, so validate contracts before exposing controls.
- **Agent status vocabulary:** The current model has no Failed status, so failed notifications and counts require an upstream typed status or event contract and must never be inferred from Unknown.
- **Notification platform variance:** Permission denial, insecure origins, browser suspension, and mobile restrictions require an in-app fallback and no promise of guaranteed delivery.
- **Control ownership across windows:** A detached pane can create competing resize and input owners, so require one explicit controller and safe observation fallback.
- **File-transfer authority:** Generic files increase storage, malware, mount, and accidental-disclosure risk, so retain allowlists, limits, random names, viewer denial, and explicit confirmation.
- **Terminal link trust:** URLs and host paths can be deceptive or unavailable on the viewing device, so validate schemes and distinguish browser links from host paths.
- **Search scope:** xterm scrollback is bounded and is not a durable transcript, so label its limits and do not imply historical indexing.
- **UI density:** Additional actions can weaken the terminal-first design, so prefer keyboard access, command-palette entries, and contextual disclosure over permanent toolbars.

## Non-Goals

- Build a generic SSH service, unrestricted host shell, browser IDE, source editor, or full file manager.
- Persist terminal recordings, command history, selections, or searchable output on the server as part of this roadmap.
- Enable simultaneous collaborative typing or multiple competing terminal controllers.
- Edit Herdr configuration files directly or fabricate lifecycle capabilities that Herdr does not expose.
- Guarantee browser notifications when platform permission or execution conditions prevent them.

## Assumptions and Unknowns

- Priority order is approved, but delivery dates, capacity, and release assignments remain TBD.
- The existing Herdr API and terminal-emulator roadmap remains the technical-health and compatibility foundation.
- Upstream availability and exact semantics for Terminal lifecycle, Agent lifecycle, and ordering APIs remain unknown.
- Whether Herdr will expose Agent failure as a status, event, or other typed signal remains unknown.
- Supported generic file types and size limits require a security and deployment decision before implementation.
- Detached-pane demand and platform behavior require validation before committing to its final interaction model.

## Decisions and Changes

- P0 marks product importance, not permission to bypass missing Herdr contracts or safety gates.
- Browser-owned focus, notification, navigation, and preference work may proceed while upstream lifecycle contracts are unresolved.
- Failed Agent labels, notifications, and counts remain unavailable until Herdr exposes a typed failure signal; Unknown is never treated as Failed.
- True Terminal and Agent lifecycle state remains Herdr-owned and synchronized across clients.
- Multi-window control remains last because it has the highest ownership and lifecycle risk.
