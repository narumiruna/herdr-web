## Goal

Redesign herdr-web as a Terminal-first Workbench that gives real Agents and terminal output most of the screen, surfaces work that needs attention, and removes duplicated or unsupported status.

## Approved Experience

The user approved a single persistent navigation rail, a compact workbench header, a terminal-dominant main area with a fixed composer, and on-demand runtime details.

The navigation orders blocked Agents first, then workspaces, then the selected workspace's detected Agents and standalone Terminals.

The interface distinguishes detected Agents from plain terminals, preserves drafts per Agent, confirms pane closure, and keeps the last valid snapshot visible during transient connection failures.

## Compatibility

- Preserve Herdr 0.8 protocol 19, bearer-token authentication, 1.5-second polling, CLI, `just`, and Docker workflows.
- Preserve prompt, image paste/drop/selection, split, pane close, and approved new-Agent commands.
- Keep Radix Colors, Icons, Themes, and Primitives as the UI foundation.
- Require no stored-data migration and preserve unknown runtime names as display text.

## Plan

- [x] Add failing state, mapping, component, runtime, and browser tests for detected-Agent counts, terminal grouping, attention ordering, keyboard navigation, per-Agent drafts, close confirmation, failure recovery, responsive layouts, and accessibility.
- [x] Refine the state and live mapper so detected Agents and standalone Terminals are distinct, split panes remain grouped, unsupported metadata is absent, and selection remains compatible across live refreshes.
- [x] Build the Terminal-first shell with one navigation rail, compact real-state header, terminal-dominant workspace, on-demand details drawer, explicit empty/loading/reconnecting states, and no placeholder activity or unsupported session actions.
- [x] Make composer and pane actions safe by preserving per-Agent drafts and attachments, presenting inline send feedback and retry, confirming pane closure, and explaining disabled controls.
- [x] Implement complete command-palette keyboard navigation, dialog focus behavior, non-color status cues, accessible labels and alerts, reduced motion, 44px mobile targets, and non-live terminal output semantics.
- [x] Update responsive styles and Playwright coverage at 390, 768, 1280, and 1536 pixels, including overflow, long terminal output, navigation drawers, image paste, and composer reachability.
- [x] Update user documentation, run focused tests and all repository gates, inspect final screenshots and diff, compare every acceptance criterion, then archive this completed plan.

## State Behavior

- Initial loading shows a stable workbench skeleton without fabricated data.
- Authentication remains a focused token form with retryable, actionable errors.
- An empty runtime explains how to open a Herdr workspace.
- A workspace without sessions keeps workspace navigation and New Agent available.
- A terminal without output shows a local empty message rather than fake terminal lines.
- Prompt sending keeps the draft visible until success and shows inline progress, errors, and retry.
- A transient poll failure preserves the last valid snapshot, marks it as reconnecting, and offers retry.
- Closing a pane requires explicit confirmation; cancellation has no side effects and failure keeps the pane visible.
- Unsupported operations are absent rather than disabled without explanation.

## Acceptance Criteria

### Behavior

- [x] Live detected-Agent count equals `snapshot.agents.length`, and a plain shell is labeled and grouped as a Terminal rather than an Agent.
- [x] Blocked Agents appear in a Needs attention group before workspace navigation.
- [x] New Agent uses a fixed visible command preset that cannot be edited.
- [x] Copy summary, open branch, stop session, synthetic activity, fake start time, fake file/diff counts, fake context, `NORMAL`, `UTF-8`, and fake online state are not rendered.
- [x] Prompt text and attachment drafts survive Agent navigation and failed sends, then clear atomically after success.
- [x] Transient refresh failures preserve the previous valid state and recover without replacing the workbench.
- [x] Pane closure has explicit confirm and cancel paths.
- [x] Command-palette Arrow Up, Arrow Down, Home, End, and Enter behavior matches its instructions.

### Responsiveness and Accessibility

- [x] No horizontal page overflow occurs from 320 through 2560 pixels.
- [x] At 1536 pixels the terminal occupies at least 70% of the content width after navigation.
- [x] At 390×844 the terminal and composer remain visible, terminal text is at least 11px, and primary touch targets are at least 44px.
- [x] Keyboard users can open navigation, details, command palette, dialogs, pane actions, and composer controls with visible focus.
- [x] Dialog focus is trapped and restored by Radix, statuses include text or icons beyond color, icon buttons have names, alerts are announced, and reduced motion is respected.
- [x] Terminal output is not an `aria-live` region that rereads all retained lines.

### Compatibility and Preservation

- [x] Protocol 19 live snapshots, bearer authentication, approved runtime commands, image uploads, CLI, `just`, and Docker remain compatible.
- [x] Standalone terminals and unknown runtime names remain reachable.
- [x] No persistent user data is deleted or migrated.

## Test Strategy

- Vitest state tests cover priority ordering, workspace selection, grouped terminals, refresh selection, and mutation reversibility.
- Testing Library covers all primary actions, per-Agent drafts, image paste, inline failures, pane confirmation/cancellation, dialogs, empty states, and palette keyboard behavior.
- Live-app tests cover bearer requests, uploaded host paths, stale snapshot preservation, and reconnection.
- Playwright covers 390×844, 768×1024, 1280×800, and 1536×960 layouts, navigation drawers, terminal width, overflow, long output, keyboard-only palette use, and screenshots.
- `npm run ci`, `npm run test:e2e`, and `git diff --check` are required final gates.

## Decisions and Risks

- Keep the existing Sand, Amber, and Graphite visual language, but reduce decorative microcopy and repeated identity so terminal content has priority.
- Keep plain terminals in the existing state collection with an explicit kind to avoid a risky API rewrite while making presentation truthful.
- Use an on-demand details drawer instead of a permanent activity rail because protocol 19 does not expose reliable event history.
- Preserve the last snapshot only after one successful connection; initial failures still use the existing recovery screen.
- Per-Agent drafts are in-memory only, matching current storage behavior and avoiding a new migration or sensitive local persistence.
- Mobile split panes stack vertically because the server feature remains available, but each pane keeps a bounded scroll viewport.

## Verification

- The first focused Vitest run failed 12 redesign expectations before implementation, establishing the required red phase.
- `npm run ci` passes 48 tests, Biome checks, the browser build, and the server build.
- `npm run test:e2e` passes seven Chromium flows across 320, 390, 768, 1280, 1536, and 2560-pixel widths, including soft-keyboard resizing, focus, touch targets, terminal width, image paste, and overflow.
- A production browser check against the running Herdr 0.8 protocol-19 server listed four detected Agents and one standalone Terminal exactly as the live snapshot reported.
- `just up` built and started the Compose stack on an available port, and authenticated state returned protocol 19 with four workspaces, four Agents, and five panes before `just down` cleaned up.
- `docker compose config --quiet`, a standalone Docker build, focused CLI/HTTP/service tests, and `git diff --check` all pass.
- Desktop, mobile, and live production screenshots were inspected for hierarchy, clipping, terminal priority, and unsupported metadata.
