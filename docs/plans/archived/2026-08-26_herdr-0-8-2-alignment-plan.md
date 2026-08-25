# Herdr 0.8.2 Alignment Plan

## Goal

Make herdr-web fully aware of Herdr 0.8.2 protocol 20, close the identified compatibility gaps, expose the highest-value new runtime controls in the browser, and provide a native cross-platform CLI path without weakening authentication or viewer permissions.

## Context

- The current bridge successfully reads Herdr 0.8.2 snapshots and terminal streams, but all socket requests share a five-second timeout while `agent.start` may wait sixty seconds.
- Herdr 0.8.2 rejects semantic prompts to blocked Agents with `agent_blocked`.
- Terminal streaming capability currently checks only `snapshot.protocol >= 19` and does not compare the local terminal-session CLI protocol with the running server.
- The Agent launcher supports four hard-coded runtimes and omits Qwen Code.
- Herdr exposes plugin management APIs and integration install/uninstall APIs that herdr-web does not surface.
- The published CLI delegates to `just run`, which prevents a native Windows startup path even though Herdr 0.8.2 supports Windows named pipes.

## Architecture

- Keep Herdr as the source of truth and route every new mutation through the authenticated Node bridge.
- Extend `HerdrClient.request` with an optional per-request timeout while retaining the existing default.
- Discover the local Herdr CLI/server status through `herdr status --json`; use its protocol and socket metadata for terminal compatibility and Windows named-pipe discovery.
- Keep plugin and integration data out of the main workspace snapshot; load it on demand in a dedicated runtime-management dialog.
- Keep viewer access read-only: plugin lists/actions and integration mutations require the controller token, while state snapshots remain available to viewers.
- Replace `just` delegation in the published CLI with a cross-platform Node launcher that still starts the existing Vite and bridge processes.

## Assumptions

- Herdr 0.8.0 protocol 19 remains the minimum supported version.
- Herdr's JSON status output is the supported cross-platform source for client/server protocol and socket metadata.
- Integration status is not available through the socket API, so the browser will expose explicit Install/repair and Uninstall actions without fabricating installed state.
- Windows behavior can be covered by platform-independent unit tests and Windows CI, but a live Windows Herdr named-pipe session is outside this machine's verification capability.

## Risks

- Plugin actions can execute arbitrary plugin-defined commands; retain controller-only authorization, confirmation, and explicit action labels.
- A local Herdr binary may be missing or its status unavailable; preserve snapshot compatibility mode and report the exact terminal limitation.
- Cross-platform process shutdown differs on Windows; use Node child-process lifecycle handling and verify clean propagation in tests.

## Plan

- [x] Extend `server/herdr-client.ts` with per-request timeout support and use a bounded long timeout for `agent.start`; verified by `tests/herdr-client.test.ts` and `tests/herdr-service.test.ts`.
- [x] Add Herdr status discovery and protocol compatibility checks to the bridge, including Windows named-pipe endpoint resolution; verified by `tests/herdr-status.test.ts` and protocol 19/20 service tests.
- [x] Handle blocked semantic prompts before upload and after `agent_blocked` responses while preserving drafts and uploaded paths; verified by mapper, live-app, and terminal-workspace tests.
- [x] Add Qwen Code to the approved runtime catalog and Agent launcher; verified by service and Agent-dialog tests.
- [x] Add browser document titles that reflect Needs input count, current Space, and current Agent; verified by `tests/app.test.tsx`.
- [x] Add authenticated plugin list, enable/disable, action list/invoke, and log list bridge/client operations plus a controller-only management dialog; verified by service, HTTP authorization, API client, and component tests.
- [x] Add integration install/repair and uninstall bridge/client operations plus the same management dialog without synthetic status; verified by allowlist, viewer rejection, and component tests.
- [x] Replace the CLI's `just run` dependency with a cross-platform Node startup path, preserve directory focus/create behavior, and add Windows-aware executable/path handling; verified by CLI/startup tests, package inspection, build, and Windows CI configuration.
- [x] Update protocol 20 fixtures, README requirements/features/security/Windows guidance, and roadmap current-state wording; verified against the implemented bridge, UI, CLI, and CI behavior.
- [x] Run `npm run check`, `npm run check:package`, `npm test`, `npm run build`, and `npm run test:e2e`; `npm run ci` passed with 181 tests, Playwright passed 31 tests, and `git diff --check` passed.

## Completion Checklist

- [x] All plan tasks have passing evidence.
- [x] Herdr 0.8.0 protocol 19 compatibility remains covered by service fixtures.
- [x] Herdr 0.8.2 protocol 20 live snapshot, plugin list, and terminal observation are smoke-tested.
- [x] No new mutation is available to viewer tokens; HTTP authorization tests cover runtime-management routes.
- [x] No undocumented direct `config.toml`, plugin registry, or integration file edits are introduced.
- [x] The completed plan is archived under `docs/plans/archived/`.
