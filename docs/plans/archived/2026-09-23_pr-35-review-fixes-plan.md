# PR 35 Review Fixes Plan

## Goal

Resolve PR #35's merge conflicts and verified review findings while preserving its resizable sidebar behavior.

## Review Ledger

| Item | Evidence and PR relationship | Severity | Outcome |
| --- | --- | --- | --- |
| Short viewports can shrink either panel below fixed controls | At the saved 20%/80% bounds, a 320px-high mobile drawer leaves roughly 44px for one track while `.spaces-actions` and `.agent-panel-heading` each require 52px. This is introduced by the PR's ratio-only split and directly conflicts with its goal to keep both panels usable. | P2 | Actionable and addressed in `1857ba9`; [evidence was published](https://github.com/narumiruna/herdr-web/pull/35#discussion_r4078248448) and the thread was resolved. |
| Branch tooltip uses an actionless button | `TerminalWorkspace` renders the branch tooltip trigger as a `<button>` with no event handler. This code is introduced by a commit included in the PR, and keyboard users can invoke a control that has no action. | P2 | Actionable and addressed in `1857ba9`; [evidence was published](https://github.com/narumiruna/herdr-web/pull/35#discussion_r4078248454) and the thread was resolved. |
| Codex summary and submitted review bodies | The target issue comment only reports review completion, and both submitted review bodies only introduce their inline comments; they contain no independent request or unresolved question. | Informational | Already addressed by evaluating the two linked inline findings. |

## Plan

- [x] Fetch every PR #35 review surface and verify the two inline findings against the current head.
- [x] Merge `origin/main` into the PR branch and resolve the macOS visual baseline conflicts with the newer hierarchy baselines.
- [x] Disable section resizing in short viewports so fixed panel controls and scrollable content remain usable; verified at 390×320 by `short mobile navigation keeps both panels usable`.
- [x] Replace the actionless branch button with static branch text and a native tooltip; verified by `tests/terminal-workspace.test.tsx`.
- [x] Run focused tests, `npm run ci`, and relevant Playwright coverage; 398 Vitest tests and all 109 Playwright tests passed (the browser suite used one worker and a repository-local temporary directory because shared `/tmp` was full).
- [x] Commit and push `1857ba9`, reply to both review threads with evidence, and resolve them.

## Completion Checklist

- [x] PR #35 reports `mergeable: true` against `main` after merge commit `68a3ac6`.
- [x] Every review item has a published, evidence-backed disposition.
- [x] The PR branch, checks, comments, and thread states were refreshed after publication; Windows passed while Linux and macOS were in progress on the first refresh.
