# herdr web

A responsive browser workbench for [herdr](https://github.com/herdrdev/herdr), the persistent runtime for coding-agent terminals.

The Terminal-first Workbench keeps herdr's core job visible: find the Agent that needs input, inspect its live terminal, and send a real prompt without hunting through sessions.

## Features

- Terminal-dominant desktop, tablet, and mobile layouts with one persistent navigation rail on wide screens.
- A workspace tab bar that preserves Herdr tab order across detected Agents and standalone Terminals.
- A global Needs input queue before workspace navigation, with per-workspace counts.
- Live workspace, tab, pane, terminal-output, and Agent-state snapshots from herdr 0.8.
- Real prompts submitted through herdr's `agent.prompt` API, with responses shown in the terminal.
- Per-Agent in-memory text and image drafts that survive empty workspaces, navigation, and failed sends.
- Remote image paste, drag/drop, and file selection with host-readable Agent attachment paths.
- Real pane splitting and confirmed pane closing.
- New Claude Code, Codex, Pi, and OpenCode Agents with visible, fixed approved commands.
- A keyboard-navigable `⌘K` or `Ctrl+K` palette for jumping between workspaces, Agents, and Terminals.
- On-demand session details without synthetic activity or unsupported runtime metadata.
- Last-valid-snapshot recovery with snapshot age, safe disabled actions, and per-pane read recovery.
- Unified light and dark appearances that follow the initial system preference and persist the user's choice.
- JetBrains Mono terminal text with bundled Nerd Font symbols and no client-side font install.
- Bearer-token protection for every terminal-control API request.

## Radix UI

The front end intentionally uses every requested Radix family.

- **Colors:** semantic Sand, Amber, Blue, Grass, and Red scales from `@radix-ui/colors`.
- **Icons:** interface symbols from `@radix-ui/react-icons`.
- **Themes:** buttons, badges, fields, icon buttons, and the appearance provider from `@radix-ui/themes`.
- **Primitives:** Dialog, Scroll Area, Tabs, and Tooltip primitives.

## Requirements

- Node.js 22 or newer.
- herdr 0.8 or newer installed and running.
- `just` for the recommended startup commands.
- Docker when using the container workflow.

Check the local herdr server before starting the web app:

```sh
herdr status server
```

## Project-directory CLI

Install the command from this checkout:

```sh
just install-cli
```

Open the current directory or an explicit project directory:

```sh
herdr-web .
herdr-web /path/to/project
```

The command resolves the directory, focuses an existing Herdr workspace that already contains it or creates a new workspace, and then starts the same authenticated web workflow as `just run`.

Run `herdr-web --help` for usage and press `Ctrl+C` to stop the development web processes.

The linked command depends on this checkout, its installed npm dependencies, `herdr`, and `just` remaining available.

## Run locally

Install dependencies once:

```sh
just install
```

Start Vite and the authenticated herdr bridge:

```sh
just run
```

`just run` chooses available web and bridge ports, creates an access token, and prints local and LAN URLs containing that token.

Open the printed `network` URL from another device on the same trusted network.

For a stable token or a named-session socket:

```sh
HERDR_WEB_TOKEN=my-long-random-token \
HERDR_SOCKET_PATH="$HOME/.config/herdr/sessions/work/herdr.sock" \
just run
```

Without `just`, set a token explicitly before running the development processes:

```sh
HERDR_WEB_TOKEN=my-long-random-token npm run dev
```

Vite prints the network URL, and the page asks for the token when it is not included in the URL.

## Workbench workflow

Needs input lists blocked Agents across every workspace and identifies each Agent's workspace.

The sidebar switches workspaces, while the tab bar shows each Agent or standalone Terminal in Herdr tab order.

Returning to a workspace restores its last selected tab, while choosing a Needs input item opens that exact Agent.

Split panes stay inside their parent tab, appear side by side on wide screens, and use a readable pane selector on narrow screens.

Each Agent tab keeps its status visible, while a compact context row preserves the current working directory and branch.

The focused terminal owns the remaining screen, with keyboard-selectable pane headers, pane actions, and the Agent composer fixed below the output.

Standalone Terminals use a compact read-only bar instead of disabled prompt controls.

The Agent composer grows with multi-line prompts, protects IME input, shows the 20,000-character limit, and distinguishes rejected requests from unknown delivery.

Use **New agent** to review and launch one of the four approved runtime presets.

Agent launch continues as a visible background action so closing its setup dialog never pretends to cancel server work.

Use the details button for real workspace, runtime, connection, and focused-pane information.

Closing a split pane requires confirmation, while cancelling leaves the pane unchanged.

Text and image drafts are kept separately per Agent during in-app navigation and clear only after Herdr accepts the prompt.

If delivery cannot be confirmed, inspect the terminal before choosing **Send again** because the original prompt may already have arrived.

Drafts remain intentionally in memory and do not survive a page reload.

If polling temporarily fails after a successful connection, the workbench keeps the last valid terminal snapshot visible, shows its age, disables mutations, and offers **Retry now**.

If an individual pane read fails, other panes remain usable and the failed pane offers **Retry output**.

On mobile, workspace creation, session details, and appearance live in **More actions** so navigation, search, and terminal work remain reachable at 320px.

## Send remote images

Press `Ctrl+V` on Windows or Linux, or `Cmd+V` on macOS, anywhere in the workbench to attach a clipboard image.

You can also drop an image onto the composer or use the image button.

The composer accepts one PNG, JPEG, GIF, or WebP file up to 8 MiB and can send it without additional text.

A staged attachment shows its destination under the active pane's `.herdr-web/uploads/` directory and must be removed before selecting a replacement.

The bridge verifies the declared type against the file signature, writes a random file under the active pane's `.herdr-web/uploads/` directory, and sends its absolute path to the Agent.

Remove old attachments manually when they are no longer needed:

```sh
find /path/to/project/.herdr-web/uploads -type f -delete
```

Add `.herdr-web/` to each target repository's ignore rules if untracked local files should stay hidden from `git status`.

## Run with Docker

Build and start the production container:

```sh
just up
```

`just up` performs these steps:

1. Creates an access token unless `HERDR_WEB_TOKEN` is already set.
2. Starts a loopback-only TCP forwarder for the host herdr Unix socket.
3. Builds and starts the Node.js production container.
4. Selects an available host port and prints local and LAN URLs.

Set a fixed web port, custom herdr socket, or narrower project mount when needed:

```sh
HERDR_WEB_PORT=4173 \
HERDR_SOCKET_PATH="$HOME/.config/herdr/sessions/work/herdr.sock" \
HERDR_PROJECTS_ROOT="$HOME/workspace" \
just up
```

`just up` mounts `HERDR_PROJECTS_ROOT` at the same absolute container path and runs the container with the host UID and GID so uploaded files remain accessible to both the container and host Agent.

The default project root is `$HOME`; choose the narrowest common parent containing all Herdr project directories.

Image uploads fail without prompting the Agent when its active directory is outside this mounted root.

Stop both the container and host socket forwarder:

```sh
just down
```

The container serves the SPA and authenticated API from one Node.js process.

Its `/healthz` endpoint checks the web process, while authenticated `/api/herdr/state` proves access to the live herdr server.

## Security

The bridge can submit prompts and control terminal panes, so it fails closed when `HERDR_WEB_TOKEN` is empty.

The token in a printed URL is moved into `sessionStorage` and removed from the address bar after the page loads.

The Docker socket forwarder listens only on host loopback.

Docker image paste requires write access to the configured `HERDR_PROJECTS_ROOT`, so mount only trusted project directories.

Treat the printed URL like a password, use this directly only on a trusted LAN, and place the app behind HTTPS and stronger access controls before exposing it to an untrusted network.

## Verification

```sh
npm run check      # Biome formatting and lint rules
npm test           # Vitest client, bridge, reducer, and interaction tests
npm run test:e2e   # Playwright desktop and mobile browser checks
npm run build      # Browser and Node production bundles
npm run ci         # check, unit tests, and build
```

Install Playwright's Chromium once when it is not already available:

```sh
npx playwright install chromium
```

## Architecture

`server/herdr-client.ts` implements herdr's newline-delimited JSON socket transport.

`server/herdr-service.ts` reads `session.snapshot` and bounded `pane.read` output, and exposes prompt, split, close, and approved agent-start operations.

`server/http-app.ts` validates bearer authentication, request sizes, resource IDs, and action payloads before invoking herdr.

`src/live-state.ts` maps protocol-19 snapshots into the workbench model in `src/state.ts`, grouping split panes under their detected Agent while retaining shell-only tabs as standalone Terminals.

`src/use-herdr-runtime.ts` polls every 1.5 seconds, separates rejected mutations from unknown outcomes, refreshes after accepted actions, and preserves the last valid snapshot during transient failures.

The deterministic demo state remains available only through explicit test injection and `VITE_DEMO_MODE=true` for browser tests.

Lifecycle event history is not exposed by protocol 19, so the interface does not fabricate an activity feed.
