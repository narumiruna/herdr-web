# Terminal Resize Ownership Fix Plan

## Goal

Keep Herdr PTY resize ownership with the focused browser pane, reliably deliver the latest controlled size, maintain observer viewport dimensions, and preserve terminal cell pixel metrics through the bridge.

## Context

The current terminal client can acquire control while hidden, discard resize events before the first frame or during flow control, leave observer dimensions stale, and emit resize storms. The bridge also drops Herdr's cell pixel dimensions.

## Architecture

- `InteractiveTerminal` owns browser focus, control/observe mode, local xterm fitting, resize buffering, and observer reconnects.
- `TerminalSession` validates browser resize commands and forwards terminal dimensions to the Herdr CLI.
- A focused pane may request control. An unfocused pane observes and cannot hold resize ownership.

## Plan

- [x] Update `src/components/InteractiveTerminal.tsx` with focus-aware control transitions; component tests verify nonfocused panes observe and focus changes release/reacquire control.
- [x] Add debounced latest-size delivery and observer reconnects in `src/components/InteractiveTerminal.tsx`; component tests verify pre-frame, backpressure, and read-only resize regressions.
- [x] Preserve measured cell pixel dimensions through `server/terminal-session.ts` and `scripts/terminal-session-proxy.mjs`; session tests verify validation, compatibility defaults, and forwarding.
- [x] Run focused terminal tests, the full test suite, static checks, terminal E2E tests, and the production build (`npm run ci`; `npx playwright test e2e/terminal-rendering.e2e.ts`).
- [x] Commit the verified changes, push `narumi/fix/terminal-resize-ownership`, and open pull request #22.

## Risks

- Reconnecting observers can briefly interrupt output; debounce viewport changes and reconnect only after dimensions differ.
- Focus transitions can race ticket creation; validate requested mode again after asynchronous ticket creation.
- Resize deduplication can suppress the initial pixel-aware command; force one post-open controlled resize per connection.

## Completion Checklist

- [x] Only the focused browser pane requests Herdr control.
- [x] The latest controlled dimensions are eventually sent after connection and flow-control transitions.
- [x] Read-only viewport changes create an updated observer session without sending control commands.
- [x] Resize updates are debounced and include validated cell pixel dimensions.
- [x] All required validation commands pass.
- [x] Pull request #22 is open with the implementation and test evidence summarized.
