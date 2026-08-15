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

## Priority Order

Priority expresses user and product value, while roadmap phase reflects API dependencies, risk, and delivery sequence.

| Rank | Priority | Capability | Main dependency |
| ---: | :---: | --- | --- |
| 1 | P0 | Pane Focus Mode | Browser layout state |
| 2 | P0 | Browser notifications with exact deep links | Notification permission and secure-origin behavior |
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
| 14 | P2 | Compact global work-status summary | Stable Agent status semantics |
| 15 | P2 | Detach a pane into another browser window | Cross-window control ownership and lifecycle |

## Guiding Principles

- Keep the terminal as the primary surface and reveal secondary actions contextually.
- Use browser-only state for reversible presentation changes and Herdr APIs for shared runtime state.
- Do not simulate unsupported Agent, Terminal, ordering, or lifecycle operations.
- Keep controller ownership explicit and never queue terminal input through a disconnected or ambiguous state.
- Require previews and confirmations only where an operation is destructive, remote, or difficult to reverse.
- Preserve viewer restrictions, existing browser preferences, unknown Herdr fields, and snapshot-only compatibility behavior.
- Treat notification permission, pop-up behavior, clipboard access, and file access as optional platform capabilities with clear fallbacks.

## Roadmap

### Phase 1: Faster daily terminal operation

- [ ] **P0 · Rank 1:** A focused pane can enter and exit a temporary full-workbench view without changing Herdr layout or losing the previous split ratio.
- [ ] **P0 · Rank 2:** Opt-in browser notifications distinguish Needs input, completed, and failed Agents and open the exact current target, with a visible in-app fallback when notifications are unavailable.
- [ ] **P1 · Rank 6:** A reconnect preserves valid terminal content plus supported search and scroll position state, clears unsafe selection state explicitly when necessary, and never replays input.
- [ ] **P1 · Rank 7:** Keyboard users can switch, split right, split down, focus, maximize, resize, and close panes with discoverable conflict-free shortcuts and confirmation where required.
- [ ] **P1 · Rank 8:** Valid web links and supported host file paths are recognizable and actionable without allowing unsafe schemes or misleading navigation.

**Outcome:** Frequent terminal work and attention handling become faster without waiting for new Herdr lifecycle APIs.

### Phase 2: Herdr-owned Terminal and Agent lifecycle

- [ ] **P0 · Rank 3:** Herdr and herdr-web agree on a typed Terminal create, rename, close, exit, capability, permission, and error contract before the tab `+` menu offers New Terminal.
- [ ] **P0 · Rank 3:** Users can create a named Terminal with an approved cwd and shell policy, then rename or close it while every attached Herdr client receives the same canonical state.
- [ ] **P0 · Rank 4:** Herdr and herdr-web agree on restart, stop, archive, clear, permission, idempotency, and unknown-outcome semantics for Agents.
- [ ] **P0 · Rank 4:** Supported Agent lifecycle controls preserve the prior valid state on rejection, confirm destructive actions, and provide recovery guidance after unknown outcomes.
- [ ] **P2 · Rank 13:** Tabs can be reordered by drag or keyboard only after Herdr exposes canonical ordering and concurrent updates cannot silently overwrite a newer order.

**Outcome:** The browser manages shared Terminal and Agent lifecycle through Herdr rather than through local UI illusions.

### Phase 3: Find and move working context

- [ ] **P0 · Rank 5:** Users can review and upload allowed non-image files under explicit size, type, storage, and authorization limits, then insert escaped host-readable paths without executing them.
- [ ] **P1 · Rank 9:** Terminal search supports next, previous, case sensitivity, whole word, and regular expression modes within clearly stated live scrollback limits.
- [ ] **P1 · Rank 10:** Global search finds current Agents by name, cwd, branch, status, and Space and opens the exact target without replacing the existing command-palette workflow.
- [ ] **P1 · Rank 11:** Users can reach recent and pinned Spaces plus the first nine visible Spaces by keyboard, with reversible browser-local persistence.
- [ ] **P2 · Rank 12:** A selection toolbar offers Copy, Search, and supported Agent actions without covering selected terminal text or breaking native selection, touch, and screen-reader behavior.
- [ ] **P2 · Rank 14:** One compact status summary communicates Working, Needs input, Completed, and Failed counts with text and accessible names rather than color alone.

**Outcome:** Users can locate, transfer, and act on context without adding a file explorer, editor, or dashboard-heavy navigation layer.

### Phase 4: Safe multi-window terminal work

- [ ] **P2 · Rank 15:** A pane can open in a dedicated browser window only after control, observation, resize authority, closure, reconnect, duplicate-window, and blocked-pop-up behavior are proven.
- [ ] **P2 · Rank 15:** Closing, refreshing, or losing either window leaves one understandable controller or observer state and never steals control or replays uncertain input.

**Outcome:** Experts can dedicate screen space to a terminal while preserving Herdr's single-controller safety model.

## Success Metrics

- Every delivered capability has automated primary-flow, disabled, error, cancellation, recovery, keyboard, and responsive coverage where applicable.
- Notification clicks, global search results, and quick switching resolve to the intended Space, Agent, tab, and pane in deterministic tests.
- Terminal creation, Agent lifecycle, and tab ordering are not shipped until their Herdr-owned contracts pass rejection, concurrency, and unknown-outcome tests.
- Reconnect and multi-window tests detect no duplicated input, silent control transfer, hidden controller conflict, or destructive browser-only state divergence.
- File transfer tests prove authorization, signature or type policy, size limits, random storage names, escaped insertion, retry boundaries, and viewer denial.
- Primary controls remain reachable at the repository's supported desktop, tablet, and 320-pixel mobile widths without page overflow or hidden critical state.

## Risks and Dependencies

- **Missing Herdr lifecycle APIs:** Terminal creation, Agent lifecycle, and canonical tab ordering depend on upstream typed methods, so validate contracts before exposing controls.
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
- Supported generic file types and size limits require a security and deployment decision before implementation.
- Detached-pane demand and platform behavior require validation before committing to its final interaction model.

## Decisions and Changes

- P0 marks product importance, not permission to bypass missing Herdr contracts or safety gates.
- Browser-owned focus, notification, navigation, and preference work may proceed while upstream lifecycle contracts are unresolved.
- True Terminal and Agent lifecycle state remains Herdr-owned and synchronized across clients.
- Multi-window control remains last because it has the highest ownership and lifecycle risk.
