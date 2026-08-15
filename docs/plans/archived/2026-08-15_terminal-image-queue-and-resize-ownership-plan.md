# Terminal Image Queue and Resize Ownership Plan

## Goal

Make image paste reliable for repeated and multi-image workflows in the focused xterm pane, and prevent herdr-web from unexpectedly changing the native Herdr terminal geometry unless the user explicitly takes control.

## Context

- `src/components/InteractiveTerminal.tsx` previously stored one `File`, one uploaded path, and one shared upload flag, so an older asynchronous upload could interfere with a newer paste.
- The previous clipboard parser returned only the first image, and the test suite did not cover two successful paste/upload cycles, replacement during an in-flight upload, or a real multi-image clipboard event.
- Two sequential probe uploads against the running bridge both returned HTTP 200 with unique paths, so repeat upload was already supported by the backend and the probe files were removed.
- xterm previously opened a Herdr `terminal session control` connection immediately and forwarded every fitted row and column change to Herdr.
- Herdr 0.8 control sessions own the underlying PTY size through a direct-attach resize lock, while observe sessions retain client-local dimensions without resizing the PTY.
- The initial live browser session was observed controlling `w5:p1` at `202×41`, which explained why a narrower native Herdr pane could clip content laid out for the browser.

## Architecture

- Clipboard parsing and queue transitions live in `src/components/terminal-images.ts`, asynchronous queue ownership lives in `src/components/use-terminal-images.ts`, and rendering lives in `src/components/TerminalImageDialog.tsx`.
- Each image has a unique ID, original `File`, status (`staged`, `uploading`, `uploaded`, or `failed`), uploaded path, and actionable error.
- A batch accepts at most eight images, preserves clipboard order, enforces the existing 8 MiB per-image and supported-media-type limits, and treats repeated paste actions as distinct items.
- The existing single-image HTTP endpoint remains unchanged, and queue items upload sequentially.
- No path reaches the terminal until every item is uploaded, then all shell-escaped paths are sent in one `terminal.input` message with safe spacing and no Enter key.
- Successful paths survive partial failure, so retry sends only failed items.
- Supported terminals start in Herdr observe mode and expose explicit Radix **Take control** and **Release control** actions.
- Only the focused pane can take control, and losing focus reconnects that pane as an observer after `terminal.release`.
- Controlling resize messages are debounced and deduplicated, while observers never send resize messages.

## Non-Goals

- No batch upload endpoint or Herdr 0.8 protocol change was added.
- Image path insertion still does not submit Enter.
- Uploaded files are not deleted automatically because the current API has no ownership-safe delete operation.
- Simultaneous writable native and web clients still cannot use independent PTY dimensions because that requires an upstream Herdr resize-policy or canonical-dimension API.
- The snapshot-only compatibility composer retains its existing single-image behavior.

## Assumptions

- Native Herdr geometry remains authoritative until the user explicitly takes control in herdr-web.
- Eight images per batch is the bounded initial limit, while each image retains the existing 8 MiB limit.
- Cancellation before upload has no remote side effects, cancellation is disabled during active upload, and the UI discloses files left by partial uploads.
- Existing controller and viewer authorization rules remain unchanged.

## Risks

- Browser clipboard variance is mitigated by component fixtures plus a real Chromium Clipboard API and platform paste-shortcut Playwright flow.
- Batch and item IDs reject stale Clipboard API and upload results, and unmount guards prevent asynchronous state updates after teardown.
- Observe-by-default adds one explicit action before input but prevents silent native-terminal resizing.
- Live Herdr 0.8 evidence verified that observe preserved `41×160`, control changed the disposable pane to `20×70`, and release restored `41×160`.
- Sequential partial uploads can leave files on disk, which the dialog and README now state explicitly.

## Rollback / Recovery

- Image queue changes remain client-side and use the existing upload API, so rollback requires no data migration.
- Terminal control behavior can be reverted independently because no persisted Herdr state or protocol fields were added.
- Failed control-ticket requests automatically reconnect as observers and retain an actionable `Control unavailable` status.

## Plan

- [x] Add characterization coverage in `tests/interactive-terminal.test.tsx` for two successful same-image paste/upload cycles, a second paste while the first upload promise is pending, and current text-paste, viewer, and focused-split behavior; the first focused run produced three expected failures before implementation, and the completed focused suite passes 25 tests.
- [x] Add multi-image clipboard fixtures covering ordered files, unsupported files, the eight-image limit, duplicate paste actions, and empty Clipboard API fallback data; `tests/terminal-images.test.ts` and `tests/interactive-terminal.test.tsx` cover these cases.
- [x] Extract image transfer parsing and queue transitions into focused modules under `src/components/`, including unique batch/item IDs and stale-result rejection; five helper tests pass and `InteractiveTerminal.tsx` remains below 1,000 lines.
- [x] Replace the single-image state with a Radix review dialog that lists each image, status, removal action, batch limit error, retry action, and partial-upload warning; component tests cover accessible labels, disabled close/cancel controls, focus restoration, and cancellation.
- [x] Serialize image uploads through the existing callback, retain successful paths across retries, and prevent stale completion from clearing a newer batch; deferred and partial-failure tests verify successful files upload once and busy state clears.
- [x] Format successful paths with shell escaping and separators, then send them in one terminal input frame without carriage return or newline; helper, component, and Playwright assertions verify exact ordered bytes.
- [x] Reset queue state, errors, previews, and file inputs after insertion or pre-upload cancellation, then restore xterm focus; component and native Clipboard API browser tests complete two cycles without outside clicks.
- [x] Add Chromium clipboard coverage with an xterm-focused platform paste shortcut and a synthetic multi-image fallback; `e2e/terminal-clipboard.e2e.ts` verifies repeat paste, focus restoration, responsive overflow, touch targets, and focused split routing.
- [x] Add terminal lifecycle tests for initial observe mode, explicit control, control-ticket failure recovery, controller conflict, release, focus loss, viewer restrictions, and cleanup; focused tests verify observers send neither input nor resize.
- [x] Expose Radix **Take control** and **Release control** actions with visible `Watching`, `Interactive`, connecting, conflict, and failure states; tests verify only a focused pane can request control.
- [x] Debounce and deduplicate controlling xterm resize messages, cancel pending work on release or unmount, and omit observer resize messages; fake-timer tests verify final dimensions and cleanup.
- [x] Run an isolated Herdr 0.8 live geometry check; disposable pane evidence was `baseline=41 160`, `observe=41 160`, `control=20 70`, and `released=41 160`, followed by workspace and process cleanup.
- [x] Update `README.md` with batch limits, ordered insertion, retry and leftover-file behavior, observe-by-default ownership, explicit control, release, and the canonical PTY-size limitation.
- [x] Run repository gates and focused lifecycle review; `npm run ci` passes 136 tests and both builds, `npm run test:e2e` passes 17 Chromium tests, and `git diff --check` passes.

## Completion Checklist

- [x] Pasting the same clipboard image in two separate completed cycles works without clicking outside xterm, and each cycle uploads and inserts exactly once.
- [x] One clipboard event can stage up to eight supported images in order, and all paths are inserted atomically into terminal input with separators and without Enter.
- [x] A partial upload failure identifies the failed item, preserves successful paths, and retries only unfinished items.
- [x] Cancellation before upload causes no remote write, while partial remote writes are disclosed and never hidden as atomic cancellation.
- [x] Plain text paste, focused split-pane routing, read-only viewers, file selection, and snapshot compatibility behavior remain covered and passing.
- [x] Herdr observe mode does not resize the PTY, terminal control is explicit, resize traffic is bounded, and release restores native resize authority in live verification.
- [x] Responsive layout, keyboard focus, accessible labels, non-color status, and Radix dialog behavior pass component and Playwright coverage.
- [x] `npm run ci`, `npm run test:e2e`, and `git diff --check` pass with only the pre-existing jsdom canvas/localStorage notices and Vite chunk-size warning.
- [x] The completed plan is archived with its implementation evidence and all material risks have a documented disposition.
