# Pull Request 19 Follow-up Feedback Plan

## Goal

Resolve every current review item on pull request 19 and verify the resulting behavior before updating its review threads.

## Context

- Target: `https://github.com/narumiruna/herdr-web/pull/19`.
- Head branch: `narumi/feat/herdr-0-8-2-alignment` at `acce65fb4da44ef2be25fc9f31e8b9a009332cad` before this pass.
- The working tree was clean before editing.
- The pull request description, six commits, 42-file diff, Linux and Windows checks, seventeen submitted reviews, fourteen inline threads, and empty issue conversation were inspected.
- Twelve earlier threads are resolved and two new threads are open.

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
  `TerminalWorkspace` now distinguishes interactive terminal, fallback composer, and snapshot-only unavailable states; its regression verifies that the unavailable state directs the user to a native Herdr client and renders no composer.
- [x] `3859661159` — Already addressed by the current code.
  `App` now derives session titles only while the runtime is ready and restores the generic product title for authentication, loading, and error screens; live tests cover initial authentication and a ready-to-authentication transition.

## Plan

- [x] Update `src/components/TerminalWorkspace.tsx` to distinguish interactive terminal, fallback composer, and browser-input-unavailable blocked states; `tests/terminal-workspace.test.tsx` verifies all three paths.
- [x] Update `src/App.tsx` to use a generic title until `runtime.status` is `ready`; `tests/live-app.test.tsx` verifies initial authentication and a ready-to-authentication transition.
- [x] Scan the full pull request diff for the same capability-state and stale-session-title patterns; the blocked banner is the only input-path instruction and `App` is the only source of dynamic document titles.
- [x] Run focused tests for the changed components and live application; 55 focused tests passed.
- [x] Run `npm run ci`, `npm run test:e2e`, and `git diff --check`; CI passed 189 tests plus package, build, and font checks, Playwright passed 31 tests, and the diff check passed.
- [x] Re-read all fourteen threads and inspect the final diff so every ledger item has a final evidence-backed outcome; the twelve resolved items remain supported and only the two now-fixed follow-up threads are open.
- [ ] Reply to and resolve the two open threads only after their fixes and checks pass.
- [ ] Stage only intended files, create a signed Conventional Commit, and push the pull request branch.
- [ ] Refresh the pull request once after pushing and confirm its checks, threads, head commit, and merge state.

## Completion Checklist

- [x] Every actionable review item has code and regression-test evidence.
- [x] Every non-actionable review item has a supported ledger outcome.
- [ ] Required local and pull request checks pass without concealed failures.
- [ ] The signed fix commit is pushed and all addressed threads are resolved.
- [ ] The completed plan is archived under `docs/plans/archived/`.
