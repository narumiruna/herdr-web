# herdr-web

herdr-web is a responsive browser workbench for [Herdr](https://github.com/herdrdev/herdr), the persistent runtime for coding-agent terminals.

It keeps the terminal at the center of the workflow: find the Agent that needs attention, open its live terminal, and respond from desktop or mobile without hunting through sessions.

## Highlights

- **Terminal-first workbench:** interactive xterm.js terminals with exact input, ANSI output, resize, mouse, IME, Unicode 11 widths, alternate-screen support, search, and optional WebGL rendering.
- **Herdr-native organization:** Spaces, tabs, split panes, detected Agents, and standalone Terminals retain Herdr's structure and tab order.
- **Attention management:** global Needs input, Failed, and Recently done groups with previews, quick replies, snooze, mute, review state, keyboard triage, and optional notifications.
- **Safe remote control:** explicit control, read-only observation, or takeover; short-lived one-use terminal tickets; and scoped, revocable viewer links.
- **Agent workflows:** launch approved Agent runtimes, submit semantic prompts, preserve per-Agent drafts during navigation, and run ordered workflow templates.
- **Cross-Space supervision:** Mission Control summarizes local Spaces and, with a compatible Herdr installation, saved SSH machines.
- **Responsive and accessible:** desktop, tablet, and mobile layouts; keyboard navigation; reduced motion; screen-reader terminal mode; and browser-saved themes and text sizes.
- **Resilient state:** structural event subscriptions, bounded consistency refreshes, last-valid-snapshot recovery, and isolated pane-read failures.

Supported Agent presets are Claude Code, Codex, Muse, OpenCode, Pi, and Qwen Code.

## Requirements

- Node.js 22 or newer.
- Herdr 0.8 or newer, installed and running with `herdr terminal session control` and `observe` support.
- Herdr 0.9 or newer for saved SSH machine profiles.
- [`just`](https://github.com/casey/just) for convenience commands and the Docker workflow.
- Docker only when using the container workflow.

Confirm that the local Herdr server is available:

```sh
herdr status server
```

## Quick start

Install the published CLI:

```sh
npm install --global herdr-web
```

Start the workbench:

```sh
herdr-web
```

To focus an existing Herdr workspace or create one for a project directory, pass that directory explicitly:

```sh
herdr-web .
herdr-web /path/to/project
```

The command starts an authenticated local web workflow and prints its URL. Without a directory, it does not focus or create a workspace. Press `Ctrl+C` to stop it.

Useful CLI commands:

```sh
herdr-web --help
herdr-web update
```

`herdr-web update` installs the latest published herdr-web package; it does not update Herdr. If the command was linked from a development checkout, updating replaces that link with the published package.

On Windows, herdr-web discovers Herdr's named pipe through `herdr status --json` unless `HERDR_SOCKET_PATH` is set.

## Run from source

Install dependencies and start Vite with the authenticated bridge:

```sh
just install
just run
```

To link the `herdr-web` CLI from this checkout, run `just install-cli`.

`just run` selects available ports, creates an access token, and prints local and LAN URLs. Open the `network` URL from another device only on a trusted network.

To use stable credentials or a named Herdr socket:

```sh
HERDR_WEB_TOKEN=my-long-random-controller-token \
HERDR_WEB_VIEW_TOKEN=my-different-read-only-token \
HERDR_SOCKET_PATH="$HOME/.config/herdr/sessions/work/herdr.sock" \
just run
```

The CLI does not require `just`. To run the development processes manually, set a token explicitly:

```sh
npm install
HERDR_WEB_TOKEN=my-long-random-token npm run dev
```

Vite prints the network URL. If the URL does not contain the token, the page asks for it.

## Workbench guide

### Navigate and supervise

The navigation rail lists **Spaces** and a global **Agents** panel. The tab bar shows each detected Agent and each tab without an Agent as a standalone Terminal.

- Use **Grouped** to retain Space and tab order, or **Priority** to surface blocked and newly completed Agents.
- Use **Attention Inbox** to triage Needs input, Failed, and Recently done states without leaving the selected terminal.
- Use **Mission Control** for a cross-Space overview and controller-only summaries from saved SSH machines.
- Use **Workflow templates** for browser-local or project-scoped batches of approved Agent launches.
- Use **Viewer shares** to issue and revoke expiring read-only links to one Space, Agent, or pane.
- Use `Cmd+K` or `Ctrl+K` to open the Action Palette.
- Use **Menu** for Settings, keybindings, Herdr reload, and the controller-only plugin and integration runtime center.

Remote machine summaries keep machine IDs isolated, omit SSH targets, and fail independently. They require local bridge mode and a Herdr build that supports `herdr --machine <id> api snapshot`; the Docker/TCP bridge cannot read the host machine catalog. Herdr does not forward interactive terminal sessions through `--machine`, so use the native Herdr client to control remote terminals.

### Work with terminals and Agents

Typing, paste, mouse input, terminal applications, and resize are forwarded through a dedicated WebSocket to one Herdr terminal session. A controller conflict offers explicit read-only observation or takeover instead of silently stealing control.

The terminal toolbar provides output search, redacted transport diagnostics, image-path staging, and an optional **Prompt Agent** dialog. Use that dialog only when you want Herdr's semantic `agent.prompt` action instead of terminal input.

Use the tab-strip **+** button to launch an approved Agent in the current Space. Launch continues as a visible background action if its setup dialog closes.

Use **Split right** or **Split down** to create panes. Dividers support mouse and keyboard resizing, and closing a pane requires confirmation. herdr-web sends Herdr's native split directions and persists ratios through `layout.set_split_ratio`.

Per-Agent text and image drafts survive in-app navigation and clear only after Herdr accepts the prompt. Drafts remain in memory and do not survive a page reload. If delivery cannot be confirmed, inspect the terminal before choosing **Send again** because the original prompt may already have arrived.

If terminal streaming is unavailable, herdr-web exposes a bounded snapshot and Agent composer as an explicit compatibility fallback.

### Keyboard controls

| Action | Shortcut |
| --- | --- |
| Open Action Palette | `Cmd+K` or `Ctrl+K` |
| Search terminal output | `Cmd+Shift+F` or `Ctrl+Shift+F` |
| Copy terminal selection | `Cmd+C` on macOS; `Ctrl+Shift+C` elsewhere |
| Paste text or stage a clipboard image | `Cmd+V` on macOS; `Ctrl+V` on Windows and Linux |
| Increase or decrease focused terminal text | `Cmd/Ctrl` + `+` or `Cmd/Ctrl` + `-` |
| Restore terminal text to 13 px | `Cmd/Ctrl` + `0` |
| Move in Attention Inbox | `J`/`N` for next; `K`/`P` for previous |
| Reply in Attention Inbox | `R`; Enter sends and advances |

Mobile layouts include an **Esc**, **Ctrl**, and **Tab** row for soft keyboards that do not expose terminal modifiers.

## Image uploads

Paste, drag, or select PNG, JPEG, GIF, or WebP images. Interactive-terminal batches accept up to eight images at 8 MiB each.

The bridge verifies each signature and writes a random file under `$HOME/.herdr-web/uploads/` by default. herdr-web uploads up to three images concurrently, then inserts shell-escaped absolute paths in the original order without pressing Enter.

Transient failures retry up to twice with the same upload ID. If only part of a batch fails, successful paths remain available and retry uploads only unfinished images. Cancelling does not delete files that already reached the Herdr host.

Remove attachments manually when no Agent needs them:

```sh
find "$HOME/.herdr-web/uploads" -type f -delete
```

Uploads from earlier versions stay in their original project directories and are never moved or deleted automatically.

## Data and configuration

herdr-web stores product-owned files under:

```text
$HOME/.herdr-web/
├── uploads/
└── runtime/
    ├── push-notifications.json
    ├── viewer-shares.json
    └── workflow-templates.json
```

Set an absolute `HERDR_WEB_HOME` to move this directory.

Common environment variables:

| Variable | Purpose |
| --- | --- |
| `HERDR_WEB_TOKEN` | Required controller credential. |
| `HERDR_WEB_VIEW_TOKEN` | Optional independent, global read-only credential. |
| `HERDR_WEB_HOME` | Product data directory; defaults to `$HOME/.herdr-web`. |
| `HERDR_SOCKET_PATH` | Herdr-owned Unix socket or Windows named-pipe override. |
| `HERDR_WEB_VAPID_CONTACT` | Optional `mailto:` or HTTPS contact for generated Web Push identity. |
| `HERDR_WEB_PORT` | Fixed host port for `just up`. |
| `HERDR_PROJECTS_ROOT` | Narrowest common host directory containing Docker-accessible projects. |

Herdr continues to own `$HOME/.config/herdr/`, its socket, API, and `HERDR_*` settings. herdr-web does not edit Herdr configuration, plugin registries, or Agent integration files directly.

Browser preferences and session values use `herdr-web-*` keys. Compatible values from earlier releases migrate on first use.

## Docker

Build and start the production container:

```sh
just up
```

The command:

1. Creates a controller token unless `HERDR_WEB_TOKEN` is set.
2. Starts loopback-only proxies for the host Herdr socket and terminal sessions.
3. Builds and starts the Node.js container.
4. Selects an available host port and prints local and LAN URLs.

Example configuration:

```sh
HERDR_WEB_PORT=4173 \
HERDR_WEB_HOME="$HOME/.herdr-web" \
HERDR_SOCKET_PATH="$HOME/.config/herdr/sessions/work/herdr.sock" \
HERDR_PROJECTS_ROOT="$HOME/workspace" \
just up
```

`just up` bind-mounts `HERDR_PROJECTS_ROOT` and `HERDR_WEB_HOME` at the same absolute paths and runs the container with the host UID and GID. This keeps uploads readable by host-side Agents. The default project root is `$HOME`; use the narrowest common parent of all required projects. Uploads fail safely when an Agent's active directory is outside the mounted root.

Stop the container and proxies:

```sh
just down
```

The production process serves the SPA and authenticated API. `/healthz` checks the web process; authenticated `/api/herdr/state` also proves access to the live Herdr server.

## Security model

The bridge can submit prompts, control panes, manage plugins, run declared plugin actions, and update official integrations. It therefore fails closed when `HERDR_WEB_TOKEN` is empty.

- `HERDR_WEB_VIEW_TOKEN` grants global snapshots, event streams, and read-only terminal observation. It cannot prompt, upload, mutate panes, take control, manage shares or workflows, or change plugins and integrations.
- Controller-created viewer shares use hashed random credentials, expire after 5 minutes to 7 days, expose one exact scope, and can be revoked.
- Terminal tickets expire after 30 seconds, are single-use, and require the page's same origin.
- Credentials are removed from the address bar and kept in `sessionStorage`; terminal WebSocket URLs never contain bearer tokens.
- The service worker does not cache HTML, API responses, event streams, credentials, terminal tickets, or terminal data.
- Push subscriptions, generated VAPID keys, notification state, and mute preferences are stored in a mode-0600 runtime file without bearer tokens.
- herdr-web is online-only and does not claim offline terminal execution.

Treat every printed or shared URL like a password. Use direct LAN access only on a trusted network, and put herdr-web behind HTTPS and stronger access controls before exposing it to an untrusted network. PWA installation, Web Push, and wake lock require browser support and a secure context outside localhost.

## Development

This repository is a monorepo. `apps/web/` contains the browser workbench, Node bridge, published `herdr-web` CLI, and their tests. The root package is private and uses npm workspaces with a single root lockfile; run the commands below and the `just` recipes from the repository root. npm publishes only the `apps/web` workspace. Native apps can live under `apps/` with their own platform toolchains; they are not npm workspaces.

Run the repository checks:

```sh
npm run check          # Biome formatting and lint rules
npm run check:package  # npm package metadata and runtime contents
npm test               # Vitest unit and integration tests
npm run test:e2e       # Playwright desktop and mobile checks
npm run build          # Browser and Node production bundles
npm run ci             # checks, package inspection, tests, and build
```

Install Playwright's Chromium once if needed:

```sh
npx playwright install chromium
```

Visual baselines under `apps/web/e2e/` are platform-specific. After an intentional UI change, update and inspect all baseline images on Linux and macOS, then rerun the browser suite without snapshot updates:

```sh
npm run test:e2e -- --grep 'visual baseline' --update-snapshots=all
```

CI runs on Linux, macOS, and Windows. Browser failure evidence is retained as a GitHub Actions artifact for seven days.

## Architecture

| Area | Main implementation |
| --- | --- |
| Herdr socket transport | `apps/web/server/herdr-client.ts` |
| Snapshot, events, and mutations | `apps/web/server/herdr-service.ts` |
| Approved Agent launch presets | `apps/web/server/agent-runtimes.ts` |
| HTTP authentication and API validation | `apps/web/server/http-app.ts` |
| Terminal process and WebSocket bridge | `apps/web/server/terminal-session.ts`, `apps/web/server/terminal-websocket.ts` |
| Snapshot-to-workbench mapping | `apps/web/src/live-state.ts` |
| Client synchronization and recovery | `apps/web/src/use-herdr-runtime.ts` |
| Interactive terminal | `apps/web/src/components/InteractiveTerminal.tsx` |
| Remote machine summaries | `apps/web/server/machine-service.ts` |
| Viewer shares | `apps/web/server/share-store.ts`, `apps/web/server/share-projection.ts` |
| Workflow templates | `apps/web/server/workflow-template-store.ts`, `apps/web/src/workflow-templates.ts` |
| Push notifications and PWA | `apps/web/server/push-notifications.ts`, `apps/web/public/sw.js` |

Browser/server-shared runtime presets and notification presentation live in dependency-free modules under `apps/web/server/`. Notification delivery remains separate in `apps/web/src/attention-center.ts` and `apps/web/server/push-notifications.ts`. Store-specific queues call `apps/web/server/private-json-file.ts` for atomic private writes; file and image policies share only directory checks in `apps/web/server/upload-directory.ts`. Startup scripts share token and network helpers in `apps/web/scripts/startup-environment.mjs`.

The front end uses React, Vite, xterm.js, and Radix Colors, Icons, Themes, and Primitives. Interactive terminals use the bundled JetBrainsMono Nerd Font Mono; see [`apps/web/public/fonts/README.md`](apps/web/public/fonts/README.md) for its source and licenses.

The deterministic demo state is available only through explicit test injection and `VITE_DEMO_MODE=true` for browser tests. The production interface does not fabricate lifecycle history, runtime metadata, or settings that Herdr does not expose.

## Releases

Release automation requires a repository secret named `PAT_TOKEN` with permission to update repository contents. npm publishing uses Trusted Publishing for package `herdr-web`, workflow `publish.yml`, and environment `release`; no npm token is stored in GitHub.

Run **Bump version** from `main` and choose `patch`, `minor`, or `major`. The workflow updates `apps/web/package.json` and the root `package-lock.json`, then creates a GitHub-signed version commit and matching `vX.Y.Z` tag. The tag independently starts release and publish workflows, which verify the version and commit before creating the GitHub Release or publishing to npm.

If the version commit succeeds but tag creation fails, create the reported tag at that commit instead of running another version bump.

## License

[MIT](LICENSE)
