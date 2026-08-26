# Pull Request 19 Post-merge Feedback Plan

## Goal

Resolve every feedback item in review `5028261040` and preserve evidence for every review thread on pull request 19.

## Context

- Target: `https://github.com/narumiruna/herdr-web/pull/19#pullrequestreview-5028261040`.
- GitHub identifies the target as pull request 19, `feat: align workbench with Herdr 0.8.2`, with head branch `narumi/feat/herdr-0-8-2-alignment` at `004ed3837e57e2929813ba3a787a278d0a91c65d` before this pass.
- The target review was submitted by `chatgpt-codex-connector[bot]` against `004ed3837e57e2929813ba3a787a278d0a91c65d` and contains inline comments `3860934982` and `3860934986`.
- Pull request 19 merged into `main` as `d3b4e6285d1a9615c206f6ac0bbef5c2dc523ad8` at 2026-08-26 08:23:25 UTC, three minutes before the target review was submitted.
- The working tree was clean before switching from `main` to the pull request branch.
- The pull request description, eight commits, complete 3,356-line diff across 43 files, two successful checks, twenty submitted reviews, sixteen inline threads, and empty issue conversation were inspected.
- Fourteen earlier threads are resolved and two target-review threads are open.
- Because the pull request is already merged and closed, a push to its restored head branch will not trigger the `pull_request` workflow or change the merge commit.

## Review Ledger

- [x] `3856190858` — Outdated or superseded.
  Later timing feedback `3858973630` and `3859459309` superseded the original browser-timeout calculation, and the current code uses the complete 205-second budget.
- [x] `3856190862` — Already addressed by the current code.
  The Docker path propagates the host terminal CLI protocol and compares it with the server protocol, with service and status regression coverage.
- [x] `3858852234` — Already addressed by the current code.
  Agent startup and readiness use separate deadlines, and the service regression advances beyond the startup deadline before confirming readiness polling.
- [x] `3858852244` — Already addressed by the current code.
  Plugin actions use paired 300-second server and 305-second browser timeouts with service and API coverage.
- [x] `3858852249` — Already addressed by the current code.
  The runtime log viewer renders `error`, `stderr`, and `stdout` independently, and its component test verifies all streams.
- [x] `3858852257` — Already addressed by the current code.
  Protocol 20 blocks semantic prompts for blocked Agents while protocol 19 preserves the fallback composer, with mapper coverage.
- [x] `3858973630` — Outdated or superseded.
  Feedback `3859459309` identified the additional pane-busy window and superseded this incomplete timeout budget.
- [x] `3858973636` — Already addressed by the current code.
  Runtime mutations remain pending while the dialog is hidden, and the component regression prevents duplicate invocation after reopening.
- [x] `3859459309` — Already addressed by the current code.
  Agent creation uses a 205-second browser timeout covering tab creation, busy retries, final start, readiness, cleanup, and transport overhead.
- [x] `3859459312` — Already addressed by the current code.
  Blocked protocol-19 snapshot users are directed to the visible composer, with component coverage.
- [x] `3859459318` — Already addressed by the current code.
  Integration uninstall requires explicit host-file removal confirmation, with cancellation and acceptance coverage.
- [x] `3859459325` — Already addressed by the current code.
  Runtime reload request IDs prevent stale success, failure, and loading completions from overwriting newer state, with out-of-order regression coverage.
- [x] `3859661154` — Already addressed by the current code.
  `TerminalWorkspace` distinguishes interactive terminal, fallback composer, and snapshot-only unavailable states, with regression coverage for all three.
- [x] `3859661159` — Already addressed by the current code.
  `App` derives session titles only while the runtime is ready and restores the generic title for connection screens, with live regression coverage.
- [x] `3860934982` — Actionable and addressed.
  `mutate` now catches only the mutation request, preserves its confirmed result, and treats the workspace refresh as best effort.
  The live regression confirms that a successful plugin action reloads its action log and remains non-retriable as a failure when the state refresh disconnects.
- [x] `3860934986` — Actionable and addressed.
  The blocked banner now requires both streaming and terminal control before directing a user to answer in the terminal.
  Component coverage verifies terminal control, read-only streaming, fallback composer, and snapshot-only guidance.

## Plan

- [x] Update `src/use-herdr-runtime.ts` so a confirmed mutation result cannot be reclassified by a follow-up refresh failure; the live plugin-action regression in `tests/live-app.test.tsx` verifies the action log reloads after a state refresh failure without presenting an unknown mutation result or invoking twice.
- [x] Update `src/components/TerminalWorkspace.tsx` so only controllable streaming terminals receive terminal-input guidance; `tests/terminal-workspace.test.tsx` verifies controller, viewer, composer, and snapshot-only paths.
- [x] Scan the full pull request diff for the same confirmed-action/refresh coupling and streaming/control capability pattern; every runtime mutation uses the corrected shared `mutate` helper, the dialog loader already absorbs and presents its own reload errors, and the blocked banner is the only input-path instruction derived from streaming capability.
- [x] Run focused tests for the runtime and terminal workspace changes; 32 focused tests passed.
- [x] Run `npm run ci`, `npm run test:e2e`, and `git diff --check`; CI passed 190 tests plus package, build, and font checks, Playwright passed 31 tests, and the diff check passed.
- [x] Re-read all sixteen threads and inspect the final diff so every ledger item has an evidence-backed outcome; fourteen previous dispositions remain supported and both target-review issues have direct code and regression evidence.
- [x] Stage only intended files, create signed Conventional Commits, and push `narumi/feat/herdr-0-8-2-alignment` without rewriting history; GitHub verifies signed implementation commit `90955b01c8a28e5aff14f27abce467d9e99701c1` on the restored branch.
- [x] Reply to and resolve the two open threads only after the fixes and local checks pass; replies `3861288961` and `3861288966` contain commit and test evidence, and all sixteen threads are resolved.
- [x] Refresh pull request 19 once after pushing and record its head, checks, thread state, and merged-state limitation; GitHub reports the merged pull request remains immutable at head `004ed383`, all sixteen threads are resolved, and its historical Linux and Windows checks passed, while restored branch tip `90955b0` has no check runs because closed pull requests do not trigger the workflow.

## Risks

- Accepted limitation: commit `90955b0` remains only on the restored pull request head branch and is not part of `main` or merge commit `d3b4e628`; landing it requires a separate follow-up pull request or another user-approved integration path.
- Accepted validation disposition: the closed pull request did not trigger new pull-request checks, so the implementation is supported by 32 focused tests, two successful `npm run ci` runs with 190 tests each, 31 Playwright tests, and `git diff --check`.

## Completion Checklist

- [x] Every actionable review item has implementation and regression-test evidence.
- [x] Every non-actionable review item has a supported ledger outcome.
- [x] Required local checks pass without concealed failures.
- [x] The signed implementation commit is pushed and both target-review threads are resolved.
- [x] The completed plan is archived under `docs/plans/archived/`.
