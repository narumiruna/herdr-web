# Pull Request 19 Feedback Plan

## Goal

Resolve every review item on pull request 19 and verify the resulting behavior with evidence suitable for the review threads.

## Context

- Target: `https://github.com/narumiruna/herdr-web/pull/19`.
- Head branch: `narumi/feat/herdr-0-8-2-alignment` at `770f8b3cf8bcc119e1ad8594569386ac55235553` before this review pass.
- The working tree was clean before editing.
- The pull request description, four commits, 41-file diff, Linux and Windows checks, submitted reviews, twelve inline threads, and empty issue conversation were inspected.

## Review Ledger

- [x] `3856190858` — Outdated or superseded.
  The original 15-second browser timeout was increased in `696adb3`, and later timing feedback `3858973630` and `3859459309` supersedes its incomplete timeout calculation.
- [x] `3856190862` — Already addressed by the current code.
  `justfile`, `compose.yaml`, `server/index.ts`, and `scripts/terminal-session-proxy.mjs` propagate and compare the host terminal CLI protocol for socket-proxy deployments, with coverage in `tests/herdr-status.test.ts` and `tests/herdr-service.test.ts`.
- [x] `3858852234` — Already addressed by the current code.
  `server/herdr-service.ts` starts a fresh 60-second readiness deadline after `agent.start` returns, and `tests/herdr-service.test.ts` advances the clock past the startup deadline before verifying `agent.get` runs.
- [x] `3858852244` — Already addressed by the current code.
  Plugin action invocation uses a 300-second Herdr socket timeout and a 305-second browser timeout, covered by `tests/herdr-service.test.ts` and `tests/herdr-api.test.ts`.
- [x] `3858852249` — Already addressed by the current code.
  `RuntimeManagementDialog` renders `error`, `stderr`, and `stdout` independently, and its component test verifies all three values.
- [x] `3858852257` — Already addressed by the current code.
  Protocol 20 blocks semantic prompts for blocked Agents while protocol 19 preserves the fallback composer, covered by `tests/live-state.test.ts`.
- [x] `3858973630` — Outdated or superseded.
  The 140-second browser timeout addressed startup plus readiness but omitted the preceding 60-second busy-retry window, so `3859459309` supersedes it with the complete timing requirement.
- [x] `3858973636` — Already addressed by the current code.
  `RuntimeManagementDialog` retains mutation state while hidden, and its regression test closes and reopens during an unresolved plugin action before verifying Run remains disabled and no duplicate invocation occurs.
- [x] `3859459309` — Already addressed by the current code.
  `src/herdr-api.ts` gives Agent creation 205 seconds for tab creation, the 60-second busy-retry admission window, a final 65-second `agent.start`, readiness polling, cleanup, and transport overhead, with the exact browser signal covered in `tests/herdr-api.test.ts`.
- [x] `3859459312` — Already addressed by the current code.
  `TerminalWorkspace` uses the actual fallback-composer capability to choose between “Answer with the composer” and “Answer in the terminal,” and `tests/terminal-workspace.test.tsx` verifies both paths.
- [x] `3859459318` — Already addressed by the current code.
  Integration uninstall now requires a host-file removal confirmation, and `tests/runtime-management-dialog.test.tsx` verifies cancellation prevents the API mutation before also covering confirmation acceptance.
- [x] `3859459325` — Already addressed by the current code.
  Runtime reloads use monotonically increasing request IDs, invalidate loads on close, and ignore stale success, error, and loading completions; the dialog regression test resolves an older pre-action load after the post-action load and verifies the newer state remains visible.

## Plan

- [x] Update `src/herdr-api.ts` and `tests/herdr-api.test.ts` so Agent creation covers the complete server-side worst-case timing budget; the focused API, service, workspace, and dialog run passed 42 tests.
- [x] Update `src/components/TerminalWorkspace.tsx` and its component tests so blocked fallback users receive composer-specific guidance; the focused workspace regression passed.
- [x] Update `src/components/RuntimeManagementDialog.tsx` and its tests so uninstall requires confirmation and only the newest reload may update state; both focused dialog regressions passed.
- [x] Scan the full pull request diff for the same timeout, destructive-action, capability-guidance, and stale-request patterns; long runtime mutations already have paired server and browser budgets, other destructive workbench operations already confirm, and no second unordered runtime loader or blocked banner exists.
- [x] Run `npm run ci`, `npm run test:e2e`, and `git diff --check`; CI passed 188 tests plus package, build, and font checks, Playwright passed 31 tests, and the diff check passed.
- [x] Re-read all twelve review threads, inspect the final diff, and give every ledger item a final evidence-backed outcome.
- [x] Reply to and resolve the four open threads only after their focused and repository checks pass; replies `3859622024`, `3859622161`, `3859622286`, and `3859622429` contain commit and test evidence, and all twelve threads are resolved.
- [x] Stage only intended implementation files, create a signed Conventional Commit, and push the branch; signed commit `8cc061cd708a52f762d42ac5c051371796c604f7` is on the pull request branch.

## Completion Checklist

- [x] Every actionable review item has code and regression-test evidence.
- [x] Every non-actionable review item has a supported ledger outcome.
- [x] Required local checks pass without concealed failures.
- [x] Required pull request checks pass for the fix commit in Actions run `32929907520` on Linux and Windows.
- [x] The signed fix commit is pushed and all addressed threads are resolved.
- [x] The completed plan is archived under `docs/plans/archived/`.
