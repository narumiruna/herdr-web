# Herdr API + True Terminal Emulator Roadmap

## Vision

Make Hedr the Herdr-native browser workbench where users can operate a real terminal from any supported device while retaining structured workspace, Agent, attention, and configuration workflows.

Hedr uses the Herdr API as its control plane and a terminal emulator as its terminal data plane rather than exposing an unrelated host shell or reproducing the Herdr TUI inside another terminal.

## Objectives

- **Deliver terminal fidelity** — Success: an agreed compatibility matrix for shells, Agent TUIs, ANSI behavior, Unicode, input, resizing, and scrollback passes in supported browsers; the exact matrix is established in Phase 1.
- **Preserve Herdr-native workflows** — Success: users can move between workspaces, tabs, panes, and Agents, respond to attention, and use structured actions without leaving the terminal-first workbench.
- **Make remote control resilient and safe** — Success: deterministic fault tests prove ordered output, explicit controller ownership, safe reconnection, and no silent input replay; latency targets remain TBD until baseline measurements exist.
- **Evolve without destructive migration** — Success: capability negotiation keeps unsupported Herdr versions understandable, existing CLI, `just`, Docker, authentication, image, and pane workflows retain a documented path, and future settings updates preserve unknown fields.

## Current State

- Hedr targets Herdr 0.8.0 protocol 19 through an authenticated Node bridge.
- Herdr 0.8 provides `terminal session control` and `observe` streams with canonical full frames, ordered deltas, input, resize, scroll, release, takeover, and controller-conflict behavior.
- The browser now renders supported panes through xterm.js and bridges each visible terminal to one Herdr terminal-session process over a same-origin WebSocket.
- Unsupported or unconfigured terminal sessions retain the bounded `pane.read` DOM renderer and Agent composer as an explicit compatibility fallback.
- Structural Herdr subscriptions replace continuous full-state polling when available, with a 30-second consistency refresh and temporary polling fallback after stream failure.
- Optional viewer tokens receive snapshots, structural events, and enforced observation sessions but cannot mutate panes, Agents, uploads, settings, or control ownership.
- Local and Docker workflows support terminal sessions, with Docker using a separately authenticated host-side process proxy.
- Herdr exposes `server.reload_config` but no typed configuration read or revision-checked atomic patch API.
- Existing in-memory drafts and session-stored access tokens required no persistent-data migration.

## Guiding Principles

- Treat Herdr as the source of truth for workspaces, panes, Agents, status, permissions, and configuration.
- Treat the terminal stream as a data plane rather than deriving terminal state from repeated text snapshots.
- Do not open a generic host PTY or shell outside Herdr's pane and permission model.
- Do not label snapshot polling plus input forwarding as a true terminal.
- Prefer capability negotiation and an honest read-only fallback over version assumptions or partially working controls.
- Give terminal keystrokes to the active terminal by default and move uncommon structured actions into contextual controls or the command palette.
- Never queue terminal input across an unknown connection state.
- Preserve the last known valid state on failure and make recovery explicit.

## Target Architecture

- The browser runs xterm.js or a technically equivalent emulator for rendering, selection, input, IME, scrollback, and accessibility support.
- A same-origin browser WebSocket authenticated by a short-lived one-use ticket connects each visible terminal to the Hedr bridge.
- The Hedr bridge validates pane scope, access role, origin, frame sizes, ordering, connection ownership, and backpressure before translating the stream to Herdr's terminal-session CLI protocol.
- Herdr owns the canonical pane lifecycle, terminal state, ordered output, input delivery, dimensions, and viewer or controller policy.
- Snapshot and event APIs continue to provide the structured control plane for navigation, attention, Agent state, and recovery.
- HTTP remains suitable for bounded actions such as image upload, ticket issue, confirmations, and future configuration changes.

## Roadmap

### Phase 1: Establish the terminal contract

- [x] Herdr 0.8 terminal sessions and Hedr's validated message layer define attach, canonical synchronization, ordered output, input, dimensions, release, pane exit, sequence-gap detection, limits, and errors. Evidence: `server/terminal-session.ts` and `tests/terminal-session.test.ts`.
- [x] Herdr control, observe, and takeover sessions define concurrent-client ownership and explicit conflict handling without silent control theft. Evidence: `src/components/InteractiveTerminal.tsx` and `tests/terminal-websocket.test.ts`.
- [x] Herdr's first full ANSI frame restores the canonical running screen before ordered delta frames are applied. Evidence: live Herdr 0.8 observation and `terminal.frame` fixtures.
- [x] The browser uses a same-origin ticketed WebSocket, while the bridge uses bounded NDJSON over a local Herdr process or authenticated host proxy with explicit backpressure and cancellation. Evidence: `server/terminal-websocket.ts`, `server/terminal-session.ts`, and `scripts/terminal-session-proxy.mjs`.
- [ ] Contract fixtures prove byte-boundary independence, UTF-8 split handling, ANSI state, large output, sequence gaps, reconnects, process exits, and multiple viewers against a representative shell and Agent-TUI matrix.

**Outcome:** Herdr exposes a testable terminal data plane that can support a real emulator without relying on polling snapshots or a generic shell.

### Phase 2: Deliver the interactive terminal core

- [x] The focused pane renders through xterm.js with ANSI colors, cursor, alternate screen, Unicode, selection, scrollback, search, paste, and terminal-owned keyboard and IME input. Evidence: `src/components/InteractiveTerminal.tsx` and live browser smoke verification.
- [x] Browser dimensions produce debounced terminal row-and-column updates, and pane switching releases the prior session without resizing an observer. Evidence: component and terminal-session tests.
- [x] The persistent Agent composer leaves the interactive surface, while `agent.prompt` remains an optional labeled toolbar action with explicit delivery semantics.
- [ ] Text clipboard behavior distinguishes terminal interrupt from copy, and all platform shortcuts are documented and verified on macOS, Windows, and Linux input conventions.
- [x] Image paste, drop, and selection stage a preview before upload, cancel without side effects, and insert a shell-escaped host path without submitting or executing it automatically. Evidence: `tests/interactive-terminal.test.tsx`.
- [x] Loading, live, read-only, reconnecting, exited, control-conflict, and per-pane error states remain explicit without input replay or scrollback replacement.

**Outcome:** A user can operate a live Herdr pane from Hedr as a real terminal, with the terminal occupying the main work surface and structured prompting remaining optional.

### Phase 3: Make streaming reliable across devices

- [x] Sequence gaps, backpressure resynchronization, and abnormal disconnects acquire a fresh one-use ticket and canonical full frame without replaying browser input. Evidence: terminal-session and interactive-terminal fault tests.
- [x] Workspace, tab, pane, and Agent navigation preserves pane-scoped attachment and releases hidden sessions across the existing responsive workbench layouts.
- [x] Unsupported or unconfigured Herdr terminal capabilities enter explicit snapshot-only compatibility mode while supported control workflows continue to function.
- [ ] Keyboard-only users can reach terminal-adjacent controls, screen-reader users have a documented accessible terminal mode, reduced motion is respected, and terminal output is not repeatedly announced during normal streaming.
- [x] Mobile layouts keep the active terminal, connection state, navigation exit, and 44-pixel Esc, Ctrl, and Tab controls reachable without horizontal page overflow. Evidence: live 390×844 viewer verification and mobile-key component tests.
- [ ] Measured local and trusted-LAN baselines establish release thresholds for input echo, output latency, reconnect time, memory, and sustained-output throughput.

**Outcome:** The interactive terminal is dependable and understandable under real network, viewport, accessibility, and compatibility conditions.

### Phase 4: Expand the Herdr-native control plane

- [x] Structural Herdr events and pane-scoped Agent-status subscriptions update the control plane without remounting terminals or depending on continuous 1.5-second polling. Evidence: `LiveHerdrService.subscribeEvents` and live `tab_created` verification.
- [x] Structured prompt, image, split, close, Agent launch, and control-handoff actions expose pending, rejected, unknown, cancellation, and recovery states appropriate to each mutation.
- [ ] Herdr exposes typed configuration reads, validation, preview, revision-checked atomic patches, and actionable errors while preserving unknown fields and the previous valid configuration on failure.
- [ ] Hedr presents only web-relevant Herdr settings first, with meaningful defaults and concrete change previews rather than directly reading or rewriting `config.toml`.
- [x] Independent viewer and controller tokens constrain terminal input, image upload, destructive pane actions, Agent launch, and future settings mutations. Evidence: `tests/herdr-http.test.ts` and read-only terminal-session tests.

**Outcome:** Hedr adds value beyond a web terminal by making Herdr's structured runtime and safe configuration workflows directly usable in the browser.

### Phase 5: Establish release readiness

- [ ] The full terminal and control-plane compatibility matrix passes in supported desktop and mobile browsers against the minimum interactive-capable Herdr release.
- [ ] Security verification covers authentication expiry, origin policy, transport encryption guidance, pane authorization, input and upload limits, control takeover, denial-of-service boundaries, and audit-relevant actions.
- [x] Existing `hedr [directory]`, `just run`, `just up`, `just down`, Docker, remote image, split, close, and Agent-launch workflows have an interactive-terminal implementation and documented compatibility disposition.
- [x] Fallback, reconnect, controller conflict, terminal shortcut, image insertion, viewer access, and recovery guidance is documented in `README.md`.
- [ ] The old DOM terminal renderer and persistent composer are removed only after interactive mode and snapshot-only fallback meet their acceptance evidence.

**Outcome:** The terminal architecture is supportable, secure by default for its documented deployment model, and ready to replace the current snapshot renderer.

## State and Recovery Model

- **Loading:** Show a stable terminal-sized placeholder and connection label without accepting input or fabricating terminal content.
- **Empty:** Keep workspace and tab navigation available and explain how to create or open a Herdr pane.
- **Partial:** Keep healthy pane streams and the last valid control state usable while isolating a failed pane with a retry path.
- **Live:** Give the active controller's input directly to the terminal and keep connection and control ownership visible but quiet.
- **Read-only:** Allow selection, copy, search, and navigation while explaining whether the cause is permissions, another controller, or an unsupported Herdr capability.
- **Reconnecting:** Preserve terminal content, disable input, queue nothing, and resynchronize from the last confirmed revision or a canonical snapshot.
- **Exited:** Preserve scrollback and exit status, detach cleanly, and show only lifecycle actions supported by Herdr.
- **Error:** Name the failed pane or action, distinguish rejected from unknown outcomes, and offer retry, reconnect, request control, or upgrade as appropriate.
- **Cancellation:** Detach, image staging, dialogs, and settings previews leave no unintended remote mutation when cancelled.
- **Recovery:** Revision gaps trigger bounded resynchronization, failed configuration writes preserve the previous revision, and unknown input outcomes never invite automatic replay.

## Success Metrics

- Every required scenario in the Phase 1 terminal compatibility matrix passes before the snapshot renderer is retired.
- Deterministic transport tests detect no missing or duplicated output after normal delivery, fragmentation, reconnect, and revision-gap recovery.
- Each accepted browser input sequence maps to one ordered Herdr input sequence, and disconnected input is rejected locally rather than queued.
- All primary terminal and workbench flows remain usable at the repository's existing 320, 390, 768, 1280, 1536, and 2560-pixel verification widths.
- Keyboard, focus, accessible names, non-color status, screen-reader mode, reduced-motion behavior, and 44-pixel mobile targets pass automated and manual checks where applicable.
- Input latency, output latency, reconnect time, throughput, and memory targets are set only after Phase 3 baseline measurements identify realistic local and trusted-LAN thresholds.

## Test Strategy

- Herdr protocol contract tests cover framing, terminal synchronization, revisions, backpressure, resize ownership, controller leases, cancellation, exit, and reconnect behavior.
- Hedr bridge tests use a deterministic fake Herdr stream to verify authentication, authorization, limits, lifecycle cleanup, error mapping, and browser-stream framing.
- Emulator component tests cover attach and detach, input routing, resize, clipboard text, staged images, optional structured prompts, disabled states, and unknown outcomes.
- Playwright covers real keyboard input, IME composition, copy and paste shortcuts, mouse selection, scrollback, alternate-screen programs, reconnect, control conflict, responsive layouts, and accessibility behavior.
- Live verification uses isolated Herdr workspaces and representative shells and Agent TUIs, sends only disposable commands, records protocol and browser versions, and removes temporary panes afterward.
- Existing `npm run ci`, `npm run test:e2e`, Docker checks, and diff inspection remain release gates, with upstream Herdr protocol tests added before interactive mode can become the default.

## Risks and Dependencies

- **Upstream terminal evolution:** Hedr currently adapts Herdr 0.8's terminal-session CLI stream rather than a socket API method; monitor protocol changes and keep capability fallback explicit.
- **Mid-session reconstruction:** Recent ANSI text may not restore alternate-screen or cursor state; require a canonical synchronization format or replay contract rather than treating `pane.read` as sufficient.
- **Multi-client dimensions:** A browser and native Herdr client can disagree about terminal size; resolve this through explicit controller and resize authority instead of last-writer-wins behavior.
- **Streaming pressure:** Agent output can exceed browser or bridge capacity; define bounded buffers, backpressure, resynchronization, and observable truncation before launch.
- **Remote command authority:** Interactive input can execute arbitrary commands inside a selected pane; keep pane-scoped authorization, fail-closed authentication, size and rate limits, and stronger deployment guidance for untrusted networks.
- **Accessibility limits:** Canvas-based terminal rendering can be difficult for screen readers; validate the emulator's accessible mode with users and retain structured status outside the terminal.
- **Mobile input variance:** Soft keyboards do not expose all terminal keys consistently; verify target platforms and add a compact modifier or key affordance only where evidence shows it is required.
- **Configuration preservation:** Direct file editing could discard comments or unknown fields; require a Herdr-owned typed and revisioned settings API before exposing browser configuration.

## Non-Goals

- Expose a generic browser shell, SSH server, or host-level `node-pty` endpoint outside Herdr.
- Run the Herdr TUI inside the web terminal as Hedr's primary interface.
- Claim full terminal support from ANSI snapshot polling plus `pane.send_input`.
- Persist terminal recordings, command history, or Agent prompt drafts on the Hedr server in the initial terminal release.
- Support simultaneous collaborative typing in the first controller model.
- Expose every Herdr configuration field before the typed settings contract and preservation rules exist.

## Assumptions and Unknowns

- Herdr 0.8 protocol 19 is the minimum verified interactive-capable release.
- The full terminal and Agent-TUI compatibility matrix still needs agreement and cross-platform execution.
- Performance targets require measurements on representative local and trusted-LAN deployments.
- Herdr owns controller lifetime and takeover policy through its terminal-session implementation.
- Typed configuration reads, previews, and atomic patches remain an upstream dependency with no committed release.

## Decisions and Changes

- Hedr remains a Herdr-native workbench rather than becoming a branded generic web terminal.
- Herdr 0.8's terminal-session stream satisfies the initial synchronization and control contract, so xterm.js is now the default for configured protocol-19 panes.
- The Herdr API is the control plane, while the terminal attachment stream is the data plane.
- The fixed Agent composer is not part of the long-term primary terminal surface.
- `agent.prompt` remains an optional structured action rather than being removed from the product.
- Older or unconfigured Herdr installations receive an honest snapshot-only compatibility experience instead of a misleading partial terminal.
- Herdr owns configuration persistence, validation, revisions, and unknown-field preservation; Hedr never edits `config.toml` directly.
