## Goal

Connect the browser workbench to a running herdr 0.8 socket so it shows live workspaces, panes, terminal output, and agent state, and so a browser prompt reaches the selected agent and its real response appears in the terminal.

## Context

The current React state is deterministic demo data.

Herdr 0.8 exposes newline-delimited JSON over a Unix socket, including `session.snapshot`, `pane.read`, `agent.prompt`, `pane.split`, `pane.close`, `tab.create`, and `agent.start`.

The browser cannot open that local socket directly, so this repository needs a narrow authenticated HTTP bridge.

## Architecture

- A Node.js bridge talks directly to the herdr Unix socket and serves authenticated `/api/herdr/*` endpoints.
- The React app polls the bridge for snapshots and pane output, maps them into the existing workbench model, and sends mutations through explicit API methods.
- Vite proxies `/api` to the loopback bridge in development.
- The production container runs the Node bridge and serves the built SPA; `just up` forwards the host Unix socket through a loopback-only TCP relay reachable from the container.
- A bearer token is required for every API request because the bridge can submit prompts and control panes.

## Non-Goals

- Reimplement the herdr terminal renderer or socket event subscription protocol in this iteration.
- Expose arbitrary shell commands through HTTP.
- Claim that placeholder session-menu actions are implemented.

## Plan

- [x] Add failing tests for NDJSON socket requests, API authentication/input validation, and live snapshot mapping; verified all three suites fail on their intentionally missing implementation modules.
- [x] Implement the typed Node herdr socket client and authenticated HTTP API for state, prompt, split, close, and approved runtime startup; verified server/auth/client/service tests pass and a live protocol-19 snapshot returned 5 workspaces and 8 pane reads.
- [x] Add the live React runtime client, loading/auth/error states, polling, and real mutations while retaining explicit demo injection for deterministic component tests; verified 23 reducer, mapper, bridge, and interaction tests pass.
- [x] Update development, Docker, Compose, and `just` workflows to run the bridge, forward the host herdr socket safely, require or generate an access token, and print usable local/LAN URLs; verified `just run`, `just up`, the image build, container health, authenticated live state, and `just down` cleanup.
- [x] Prove one real isolated agent round trip by creating a temporary herdr tab, starting an agent, submitting only `hi`, observing changed terminal output, and cleaning up the temporary tab; Pi replied `Hi! How can I help?`, reached `done`, appeared in web state, and the temporary tab was removed.
- [x] Update README architecture, security, startup, and troubleshooting documentation; documented live behavior, token handling, local/Docker workflows, socket forwarding, and known placeholders.
- [x] Run all quality gates, browser checks, API security checks, and an audit of the worktree; `npm run ci`, 3 Playwright checks, Docker image build, Compose validation, npm audit, diff checks, static-import audit, mobile live rendering, and cleanup audit all passed.

## Risks

- An unauthenticated LAN endpoint would allow remote terminal control, so API access must fail closed without a valid token.
- Polling several pane reads can create load, so reads are bounded and one state request batches socket requests.
- Agent startup varies by installed runtime, so only the four UI runtimes and their fixed argument lists are accepted.
- A test prompt can disturb an existing session, so live verification must create and remove an isolated tab and send only `hi`.

## Rollback / Recovery

The bridge does not modify herdr persistence formats.

If startup or prompt verification fails, close only the temporary test tab and leave existing workspaces and panes untouched.

## Completion Checklist

- [x] Live state is verified by a headless browser showing the real `hedr` workspace and connected state from a protocol-19 snapshot.
- [x] Real prompt delivery and response visibility are verified by an isolated Pi agent receiving only `hi`, replying `Hi! How can I help?`, and exposing that output through the web state endpoint before cleanup.
- [x] Unauthorized API requests are verified to return `401`, while valid bearer tokens returned live state both locally and from the container.
- [x] Local and container workflows are verified with `npm run ci`, 3 passing Playwright checks, `docker compose config`, `just run`, `just up/down`, and a successful final image build.
- [x] Documentation is verified to describe real behavior, token usage, loopback socket forwarding, startup, security, known placeholders, and cleanup without calling demo data live.
