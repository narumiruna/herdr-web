# Supervision Platform Implementation Plan

## Goal

Deliver notifications, an Attention Inbox, an Action Palette, Agent workflow templates, Mission Control, scoped viewer shares, terminal diagnostics, accessibility preferences, and an installable PWA as one secure, tested herdr-web supervision platform.

## Context

herdr-web already has foreground status-transition notifications, a blocked-Agent sidebar list, a navigation-only command palette, a global viewer token, and component-local terminal signals.
The implementation must preserve Herdr as the source of truth, keep viewer access read-only, avoid caching authenticated data, and avoid inventing lifecycle history or unavailable metrics.

## Architecture

- Browser-local supervision preferences own notification sound, cooldown, per-Agent mute, snooze, reviewed state, accessibility, wake lock, and local workflow templates.
- Herdr snapshots remain authoritative for Agent status, pane output previews, workspace membership, protocol metadata, and controller state.
- A server-side share store owns hashed short-lived share credentials, exact workspace/session/pane scopes, expiry, and revocation.
- Scoped principals are enforced when projecting snapshots and events and when issuing terminal observation tickets.
- An allowlisted action registry powers the Action Palette; arbitrary shell commands are never accepted.
- Workflow templates can be browser-local or server-persisted project-scoped records, but runtime commands remain fixed server presets.
- A persisted VAPID identity and authenticated Push subscriptions deliver background transitions, while the service worker handles Push display, notification deep links, and install lifecycle without caching HTML, API responses, credentials, or terminal data.
- Terminal diagnostics expose only measured transport/rendering metadata and never terminal output, bearer tokens, tickets, environment values, or host paths.

## Risks

- Scoped snapshot projection can leak unrelated IDs or paths if any nested collection is missed.
- Revoked shares can retain already-issued tickets unless ticket consumption checks the share principal again.
- Browser and service-worker notification APIs vary and can throw even after permission is granted.
- Workflow batches can partially succeed; outcomes must identify each completed or failed step and never auto-retry unknown results.
- xterm screen-reader mode can be expensive, so it must be explicit rather than always enabled.

## Rollback / Recovery

- All browser-owned schemas use versioned, defensive localStorage parsing and can be reset without changing Herdr resources.
- Share/template JSON stores use atomic replacement and tolerate a missing initial file.
- Workflow execution reports partial completion and leaves already-started persistent Agents visible; it never pretends to roll them back.
- PWA updates do not cache authenticated resources, so unregistering the service worker restores the normal online-only web app.

## Plan

- [x] Add authoritative preview/protocol metadata to the state projection and verify live and demo mapping tests. Evidence: `tests/live-state.test.ts` and `tests/herdr-service.test.ts`.
- [x] Add a versioned attention preference model and notification coordinator with permission, sound, deep links, per-Agent mute, cooldown, and durable deduplication; verify transition and failure-path tests. Evidence: `tests/attention-center.test.tsx`.
- [x] Add the keyboard-operable Attention Inbox with real output previews, acknowledged quick replies, snooze, mute, review, Needs input/Failed/Recently done groups, and next-item flow. Evidence: `tests/attention-center.test.tsx`, `tests/herdr-http.test.ts`, and `tests/interactive-terminal.test.tsx`.
- [x] Replace the navigation-only palette with a role/capability-filtered Action Palette covering Agent creation, pane split/close, prompt/search/conflict-gated takeover, themes, terminal sizes, reload, and confirmed plugin actions. Evidence: `tests/app.test.tsx`, `tests/live-app.test.tsx`, and keyboard-only Playwright.
- [x] Add versioned browser-local and project-scoped workflow templates with runtime, prompt, order, cwd, and wait metadata plus bounded batch execution and partial outcomes. Evidence: `tests/workflow-templates.test.ts`, `tests/herdr-service.test.ts`, and `tests/app.test.tsx`.
- [x] Add Mission Control as an optional supervision view with real workspace/Agent status, previews, browser-observed attention age, connection/control state, and direct navigation. Evidence: `tests/app.test.tsx` and responsive Playwright.
- [x] Add persistent hashed share credentials with exact workspace/session/pane scope, short expiry, listing, durable revocation, projected state/events, observe-only tickets, ticket revocation checks, and a management dialog. Evidence: `tests/viewer-shares.test.ts` and `tests/terminal-websocket.test.ts`.
- [x] Add measured terminal transport/rendering diagnostics for WebSocket bridge RTT, clock-adjusted output delivery, reconnects, renderer, dimensions, protocol, and actual control/observe mode. Evidence: `tests/interactive-terminal.test.tsx`.
- [x] Add explicit screen-reader and saved-or-OS reduced-motion preferences, improve keyboard/clipboard behavior, and verify accessibility-focused component and browser tests. Evidence: `tests/interactive-terminal.test.tsx`, `tests/pwa-platform.test.ts`, and terminal Playwright suites.
- [x] Add manifest, icons, authenticated closed-app Web Push, service-worker notification clicks, install controls, secure no-cache behavior, reconnect visibility, and race-safe foreground wake-lock lifecycle without claiming offline support. Evidence: `tests/push-notifications.test.ts`, `tests/pwa-platform.test.ts`, and built assets.
- [x] Add security headers, bounded resource limits, defensive parsing, and documentation for all features; run targeted review and hardening tests. Evidence: two adversarial review passes, `npm audit`, `git diff --check`, and security-focused tests.
- [x] Run `npm run ci`, Chromium E2E, package inspection, diff/security audit, and live smoke checks. Evidence: 222 Vitest tests, 31 Playwright tests, package/font gates, zero high audit findings, and live Herdr state/share/revocation/push-config smoke verification.
- [ ] Create signed Conventional Commits, push `narumi/feat/supervision-platform`, open a correctly titled pull request, and verify the PR checks and final diff.

## Completion Checklist

- [x] Every explicit feature and subfeature in the goal is represented by shipped UI/API behavior and direct acceptance evidence.
- [x] Viewer shares cannot observe or mutate resources outside their scope before or after revocation or expiry.
- [x] Notifications, Push payloads, and service-worker code disclose no bearer token and never cache authenticated content.
- [x] Workflow templates cannot bypass the approved runtime command allowlist.
- [x] Diagnostics contain no terminal content, credentials, environment values, or host paths.
- [x] Existing controller, viewer, terminal, image, pane, workspace, plugin, Docker, CLI, and responsive tests remain green.
- [ ] The pull request exists remotely with all intended signed commits and no unrelated changes.
