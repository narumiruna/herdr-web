# Terminal Image Paste Plan

## Goal

Make repeated and multi-image paste reliable in the focused xterm pane without changing Herdr terminal control, observation, or resize behavior.

## Context

- `src/components/InteractiveTerminal.tsx` previously stored one `File`, one uploaded path, and one shared upload flag, so an older asynchronous upload could interfere with a newer paste.
- The previous clipboard parser returned only the first image.
- The previous test suite did not cover two completed paste cycles, a second paste during an in-flight upload, or a real multi-image clipboard event.
- The existing single-image upload endpoint already accepts repeated uploads and returns unique remote paths.

## Architecture

- Clipboard parsing and queue transitions live in `src/components/terminal-images.ts`.
- Asynchronous queue ownership lives in `src/components/use-terminal-images.ts`.
- Review and recovery UI lives in `src/components/TerminalImageDialog.tsx` using Radix components.
- Each queue item has a unique ID, original file, status, uploaded path, and actionable error.
- A batch accepts up to eight images, preserves clipboard order, retains the existing 8 MiB per-image limit, and treats repeated paste actions as distinct items.
- Uploads continue through the existing single-image endpoint and run sequentially.
- Paths reach the terminal only after every item uploads successfully, then all shell-escaped paths are sent in one input message without Enter.
- Successful paths survive partial failure, so retry uploads only unfinished items.

## Non-Goals

- Do not change when herdr-web requests terminal control or observation sessions.
- Do not change resize forwarding, resize timing, or terminal geometry ownership.
- Do not add a batch upload endpoint or change the Herdr protocol.
- Do not submit Enter after inserting image paths.
- Do not delete uploaded files automatically because the current API has no ownership-safe delete operation.
- Keep the snapshot-only compatibility composer on its existing single-image workflow.

## Risks

- Browser clipboard variance is covered by component fixtures and real Chromium Clipboard API tests.
- Batch and item IDs reject stale Clipboard API and upload results.
- Unmount guards prevent asynchronous state updates after teardown.
- Sequential partial uploads can leave files on disk, which the dialog and README disclose.
- Terminal lifecycle behavior is protected by regression coverage for the existing immediate control and resize flow.

## Plan

- [x] Add regression coverage in `tests/interactive-terminal.test.tsx` for two completed same-image paste cycles, a second paste while the first upload is pending, multi-image order, text paste, viewer access, and focused split routing.
- [x] Add queue helper coverage in `tests/terminal-images.test.ts` for supported files, validation, the eight-image limit, duplicate paste actions, stale updates, retries, escaping, and ordered input.
- [x] Extract image parsing and queue transitions into `src/components/terminal-images.ts` and asynchronous queue handling into `src/components/use-terminal-images.ts`.
- [x] Add `src/components/TerminalImageDialog.tsx` with Radix review, status, removal, retry, copy, cancellation, and partial-upload recovery controls.
- [x] Serialize uploads, retain successful paths across retries, reject stale completion, and insert all completed paths atomically without Enter.
- [x] Reset queue state and restore xterm focus after insertion or pre-upload cancellation.
- [x] Add Chromium coverage for native repeated paste, ordered multi-image paste, responsive overflow, touch targets, and focused split routing.
- [x] Preserve the existing immediate terminal control and resize behavior and cover it in `tests/interactive-terminal.test.tsx`.
- [x] Update `README.md` with image limits, ordered insertion, retry behavior, and leftover-file behavior without changing terminal ownership guidance.
- [x] Run focused tests, repository checks, browser tests, and `git diff --check`; 22 focused tests, 133 repository tests, both builds, and 17 Chromium tests pass.

## Completion Checklist

- [x] The same clipboard image can be pasted in two completed cycles without clicking outside xterm.
- [x] One clipboard event can stage up to eight supported images in order.
- [x] All completed paths are inserted once, with shell-safe separators and without Enter.
- [x] Partial failure preserves successful paths and retries only unfinished images.
- [x] Cancellation before upload causes no remote write, while partial remote writes are disclosed.
- [x] Plain text paste, focused split routing, viewer access, file selection, and snapshot compatibility remain covered.
- [x] Terminal control, observation, and resize behavior match the pre-existing implementation.
- [x] All focused, repository, browser, formatting, and build checks pass.
- [x] Archive this completed plan with final verification evidence.
