# Pull Request 19 Feedback Plan

## Goal

Resolve every review item on pull request 19 and verify the resulting behavior with evidence suitable for the review threads.

## Context

- Target: `https://github.com/narumiruna/herdr-web/pull/19`.
- Head branch: `narumi/feat/herdr-0-8-2-alignment` at `199879d490dc2f6bb8d5ac7e47b21d7e7ab053d4` before this review pass.
- The working tree was clean before checkout and editing.
- The pull request description, three commits, 40-file diff, Linux and Windows checks, submitted reviews, eight inline threads, and empty issue conversation were inspected.

## Review Ledger

- [x] `3856190858` — Outdated or superseded.
  The original 15-second browser timeout was increased to 70 seconds in `696adb3`, but the later separate readiness window made that value insufficient and `3858973630` supersedes this item with the complete timing requirement.
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
- [x] `3858973630` — Already addressed by the current code.
  `src/herdr-api.ts` now gives Agent creation 140 seconds to cover tab creation, the 65-second startup request, the separate readiness window, and transport overhead, and the focused API and service tests pass.
- [x] `3858973636` — Already addressed by the current code.
  `RuntimeManagementDialog` now retains mutation state while hidden, and its regression test closes and reopens during an unresolved plugin action before verifying Run remains disabled and no duplicate invocation occurs.

## Plan

- [x] Update `src/herdr-api.ts` and `tests/herdr-api.test.ts` so the browser waits through the complete Agent startup and readiness budget; `npx vitest run tests/herdr-api.test.ts tests/herdr-service.test.ts` passed 24 tests.
- [x] Update `src/components/RuntimeManagementDialog.tsx` and `tests/runtime-management-dialog.test.tsx` so closing the dialog cannot re-enable an in-flight action; the focused component run passed 2 tests.
- [x] Scan the pull request diff for the same timeout and pending-state failure patterns; the shared pending fix covers plugin and integration mutations, and integration install/uninstall now receives the same 300-second server and 305-second browser budgets as plugin actions.
- [x] Run `npm run ci`, `npm run test:e2e`, and `git diff --check`; CI passed 185 tests plus package inspection, builds, and font checks, and Playwright passed 31 tests.
- [x] Re-read all eight review threads and classify every ledger item with final evidence; six earlier threads remain addressed or superseded, and the two latest concerns now have focused regression coverage.

## Completion Checklist

- [x] Every actionable review item has code and regression-test evidence.
- [x] Every non-actionable review item has a supported ledger outcome.
- [x] Required local checks pass without concealed failures.
