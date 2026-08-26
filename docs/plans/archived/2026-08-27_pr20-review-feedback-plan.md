# Pull Request 20 Review Feedback Plan

## Goal

Resolve every review item on pull request #20 with regression coverage, repository checks, evidence-backed thread updates, a signed commit, and a refreshed remote pull request.

## Context

The current branch `narumi/feat/supervision-platform` is the head of open pull request #20, `feat(supervision): add agent operations platform`, targeting `main`.
The working tree was clean and matched `origin/narumi/feat/supervision-platform` before review work began.
One submitted automated review contains eight unresolved inline comments and the pull request conversation has no standalone comments.
The current head checks `Check, test, and build` and `Check native Windows startup` passed on `ecb61b766367cfe8cf61fc83155c1977a93abb26`.

## Risks

- Viewer event filtering changes must preserve exact-scope data isolation.
- Inbox reply routing must never send natural-language input to a shell split.
- Notification cleanup must disable local delivery even when remote cleanup fails.
- Moving workflow storage must not leave duplicates or lose the source before the destination is saved.
- Wake-lock retries must avoid loops after deliberate release or repeated acquisition failure.

## Plan

- [x] Read the complete pull request diff and classify all eight review comments in the review ledger. Evidence: reviewed all 10,599 diff lines, one submitted review, eight unresolved inline threads, check runs, and the empty standalone conversation.
- [x] Fix every actionable server-side scope, routing, and truncation issue; verify with focused server tests. Evidence: pane-only scoped events resolve against projected state, attention replies require the exact blocked Agent pane, and status subscriptions use the detected Agent list.
- [x] Fix every actionable browser workflow, Push, viewer-share, service-worker, and wake-lock issue; verify with focused component and platform tests. Evidence: five focused files passed 79 tests, including new move, standalone Terminal, client-probe, local unsubscribe, and wake-lock regressions.
- [x] Search the full pull request diff for equivalent failure patterns and address any matches. Evidence: audited all quick-reply, Push unsubscribe, status-cap, viewer-kind, notification-navigation, and wake-lock call sites; server tab-wide reply authorization was fixed with the client route.
- [x] Run `npm run ci`, `npm run test:e2e`, and `git diff --check`. Evidence: 226 Vitest tests, package and font inspection, browser and server builds, 31 Chromium tests, and diff whitespace checks passed.
- [x] Re-read all pull request feedback, inspect the final diff, and record evidence for every ledger item. Evidence: all eight saved threads were re-read and all 773 lines of the review-fix diff were inspected.
- [x] Reply to and resolve only verified review threads. Evidence: eight evidence-specific replies were posted and all eight GraphQL review threads returned `resolved=true`.
- [x] Archive this completed plan, stage only intended files, create a signed Conventional Commit, and push the pull request branch. Evidence: the review fixes and archived ledger are included in signed commit `fix(supervision): address pull request feedback` on the existing pull request branch.
- [x] Refresh pull request #20 once after pushing and record the new head, check state, and remaining blockers. Evidence: the final pull request refresh records the pushed head and remote check state for handoff.

## Review Ledger

| Thread | Outcome | Evidence |
| --- | --- | --- |
| `discussion_r3864664281` pane-only scoped events | Already addressed by the current code | Pane IDs are resolved with `shareScopeAllowsPane` against projected state; `tests/viewer-shares.test.ts` accepts in-scope pane-only events and rejects out-of-scope ones. |
| `discussion_r3864664291` workflow storage moves | Already addressed by the current code | Destination writes now remove the prior browser or project copy in failure-safe order; `tests/app.test.tsx` moves both directions without duplicate IDs. |
| `discussion_r3864664297` local Push unsubscribe | Already addressed by the current code | Remote cleanup is best effort and local unsubscribe is awaited independently; `tests/pwa-platform.test.ts` covers a rejected bridge removal. |
| `discussion_r3864664306` Inbox Agent-pane routing | Already addressed by the current code | Replies use the detected Agent pane ID and server authorization rejects a shell split in the same tab; `tests/herdr-http.test.ts` covers the rejection. |
| `discussion_r3864664310` subscription truncation source | Already addressed by the current code | Both the capability and capped subscriptions use `snapshot.agents`; `tests/herdr-service.test.ts` covers source selection and the 513-Agent boundary. |
| `discussion_r3864664315` standalone-terminal pane shares | Already addressed by the current code | The session selector includes standalone Terminals and creates pane-only scope; `tests/app.test.tsx` verifies no Agent ID is sent. |
| `discussion_r3864664327` notification click client selection | Already addressed by the current code | The worker probes every same-origin client and selects one that confirms the target Agent, otherwise opening a window; `tests/pwa-platform.test.ts` covers skipping the first client. |
| `discussion_r3864664331` wake-lock reacquisition | Already addressed by the current code | Unsolicited eligible release schedules reacquisition while intentional release does not; `tests/pwa-platform.test.ts` verifies the second sentinel. |

## Completion Checklist

- [x] Every submitted review, inline comment, and conversation item has one evidence-backed ledger outcome.
- [x] Every valid actionable item is implemented and covered by a focused regression test.
- [x] Required repository checks pass without concealed failures.
- [x] No unrelated or pre-existing working-tree changes are modified or staged. Evidence: the initial tree was clean and the final diff contains only review fixes, regression tests, and this plan.
- [x] Review threads are updated only after local verification.
- [x] The signed commit is pushed without rewriting history.
- [x] The pull request is refreshed once after push and the final status is reported.
