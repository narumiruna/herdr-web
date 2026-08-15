# Hedr

Hedr is a responsive browser workbench for [herdr](https://github.com/herdrdev/herdr), the persistent runtime for coding-agent terminals.

It keeps herdr's core job visible: find the Agent that needs input, control its live terminal, and send a real prompt without hunting through sessions.

## Features

- Terminal-dominant desktop, tablet, and mobile layouts with one persistent navigation rail on wide screens.
- A workspace tab bar that preserves Herdr tab order across detected Agents and standalone Terminals.
- A global Needs input queue before workspace navigation, with per-workspace counts.
- Interactive xterm.js terminals backed by Herdr 0.8 terminal control and observation sessions.
- Exact terminal input, ANSI output, resize, mouse, IME, Unicode, and alternate-screen behavior without snapshot polling.
- Structural workspace, tab, pane, layout, and Agent updates from Herdr event subscriptions.
- Real prompts submitted through Herdr's `agent.prompt` API from an optional terminal-side dialog.
- Per-Agent in-memory text and image drafts that survive empty workspaces, navigation, and failed sends.
- Remote image paste, drag/drop, and file selection with host-readable Agent attachment paths.
- Real pane splitting, mouse and keyboard split resizing, and confirmed pane closing.
- A mouse and keyboard resizable desktop navigation rail with a browser-saved width.
- New Claude Code, Codex, Pi, and OpenCode Agents with visible, fixed approved commands.
- A keyboard-navigable `⌘K` or `Ctrl+K` palette for jumping between workspaces, Agents, and Terminals.
- On-demand session details without synthetic activity or unsupported runtime metadata.
- Last-valid-snapshot recovery with snapshot age, safe disabled actions, and per-pane read recovery.
- Dark appearance by default with a saved light option, while interactive terminals stay on a high-contrast dark palette for reliable ANSI and TUI readability.
- JetBrains Mono terminal text with bundled Nerd Font symbols and no client-side font install.
- Controller and optional independent viewer tokens, same-origin WebSockets, and short-lived one-use terminal tickets.

## Radix UI

The front end intentionally uses every requested Radix family.

- **Colors:** semantic Sand, Amber, Blue, Grass, and Red scales from `@radix-ui/colors`.
- **Icons:** interface symbols from `@radix-ui/react-icons`.
- **Themes:** buttons, badges, fields, icon buttons, and the appearance provider from `@radix-ui/themes`.
- **Primitives:** Dialog, Scroll Area, Tabs, and Tooltip primitives.

## Requirements

- Node.js 22 or newer.
- Herdr 0.8 or newer installed and running with `herdr terminal session control` and `observe` support.
- `just` for the recommended startup commands.
- Docker when using the container workflow.

Check the local herdr server before starting the web app:

```sh
herdr status server
```

## Project-directory CLI

Install the published command from the public npm registry:

```sh
npm install --global herdr-web
```

To link the command from this checkout instead:

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

The command requires `herdr` and `just`; a linked development command additionally depends on this checkout and its installed npm dependencies.

## Run locally

Install dependencies once:

```sh
just install
```

Start Vite and the authenticated Hedr bridge:

```sh
just run
```

`just run` chooses available web and bridge ports, creates an access token, and prints local and LAN URLs containing that token.

Open the printed `network` URL from another device on the same trusted network.

For a stable controller token, optional independent viewer token, or a named-session socket:

```sh
HEDR_TOKEN=my-long-random-controller-token \
HEDR_VIEW_TOKEN=my-different-read-only-token \
HERDR_SOCKET_PATH="$HOME/.config/herdr/sessions/work/herdr.sock" \
just run
```

Without `just`, set a token explicitly before running the development processes:

```sh
HEDR_TOKEN=my-long-random-token npm run dev
```

Vite prints the network URL, and the page asks for the token when it is not included in the URL.

## Workbench workflow

Needs input lists blocked Agents across every workspace and identifies each Agent's workspace.

The sidebar follows Herdr's layout with **Spaces** above a global **Agents** panel, while the tab bar shows each Agent or standalone Terminal in Herdr tab order.

Use **Grouped** to keep Agents in Space and tab order, or **Priority** to surface blocked and newly completed Agents first; the choice is saved in this browser.

Use **New** below Spaces to preview and create a persistent Herdr workspace for a host directory.

Use **Menu** for saved appearance settings, the workbench keybinding reference, and an explicit Herdr reload.

Returning to a Space restores its last selected tab, while choosing a Needs input or Agents item opens that exact Agent.

Use the **+** beside the tab strip to start another Agent in the current Space without leaving the terminal context.

Split panes stay inside their parent tab, follow Herdr's right or down split direction on wide screens, and use a readable pane selector on narrow screens.

Drag the divider between two visible panes to preview a new ratio, then release it to persist the ratio atomically through Herdr's `layout.set_split_ratio` API.

The pane divider also supports arrow keys plus Home and End, while controller loss or a rejected update restores the last confirmed Herdr ratio.

Drag the desktop navigation divider or focus it and use Left, Right, Home, or End to adjust its width; this browser-only preference does not alter Herdr.

Each Agent tab keeps its status visible, while one compact terminal bar combines the current working directory, branch, pane title, connection state, and terminal actions without redundant title rows.

The focused terminal owns the remaining screen and is the primary interaction surface.

Typing, paste, mouse input, terminal applications, and resize are forwarded through a dedicated WebSocket to one Herdr terminal session.

Use the terminal toolbar to search output, stage an image path, or open the optional Agent prompt dialog.

A controller conflict offers explicit read-only observation or takeover instead of silently stealing control.

Standalone Terminals support the same interactive session when Herdr terminal streaming is available.

If terminal streaming is unavailable, Hedr keeps the bounded snapshot view and Agent composer as an explicit compatibility fallback.

Use **New agent** to review and launch one of the four approved runtime presets.

Agent launch continues as a visible background action so closing its setup dialog never pretends to cancel server work.

Use the details button for real workspace, runtime, connection, and focused-pane information.

Closing a split pane requires confirmation, while cancelling leaves the pane unchanged.

Text and image drafts are kept separately per Agent during in-app navigation and clear only after Herdr accepts the prompt.

If delivery cannot be confirmed, inspect the terminal before choosing **Send again** because the original prompt may already have arrived.

Drafts remain intentionally in memory and do not survive a page reload.

Herdr structural events refresh the control plane, with a 30-second consistency refresh and temporary 1.5-second fallback only while the event stream is unavailable.

If control-plane refresh temporarily fails after a successful connection, the workbench keeps the live terminal session and last valid workspace snapshot visible, shows its age, disables mutations, and offers **Retry now**.

If an individual pane read fails, other panes remain usable and the failed pane offers **Retry output**.

On mobile, **New**, **Menu**, Spaces, and Agents remain available in the navigation drawer, while session details stay in **More actions** so navigation, search, and terminal work remain reachable at 320px.

## Terminal controls

- Type normally to send exact terminal input.
- Use `Cmd+C` on macOS or `Ctrl+Shift+C` elsewhere to copy a terminal selection.
- Use `Cmd+V` on macOS or `Ctrl+V` on Windows and Linux for normal text paste or to stage a clipboard image.
- Use `Cmd+Shift+F` or `Ctrl+Shift+F` to search terminal output.
- Use the image toolbar button to stage a local image.
- Use the mobile **Esc**, **Ctrl**, and **Tab** key row when the soft keyboard does not expose terminal modifiers.
- Use **Prompt Agent** when you intentionally want Herdr's semantic `agent.prompt` action instead of terminal input.

## Send remote images

Focus the interactive terminal, then paste an image with `Cmd+V` on macOS or `Ctrl+V` on Windows and Linux; the image button is the fallback.

Pasting during connection still opens the review dialog, but uploading waits until the terminal reports **Interactive**.

The staged-image dialog performs no upload until **Upload and insert path** is confirmed.

The bridge verifies PNG, JPEG, GIF, or WebP signatures, enforces an 8 MiB limit, writes a random file under the active pane's `.hedr/uploads/` directory, and inserts a shell-escaped absolute path at the terminal cursor.

If insertion cannot be confirmed, the dialog keeps the uploaded path available for copy or retry without uploading a duplicate.

The compatibility composer still supports workbench-wide image paste, drag/drop, and file selection when interactive terminal streaming is unavailable.

Remove old attachments manually when they are no longer needed:

```sh
find /path/to/project/.hedr/uploads -type f -delete
```

Add `.hedr/` to each target repository's ignore rules if untracked local files should stay hidden from `git status`.

## Run with Docker

Build and start the production container:

```sh
just up
```

`just up` performs these steps:

1. Creates an access token unless `HEDR_TOKEN` is already set.
2. Starts a loopback-only TCP forwarder for the host Herdr Unix socket.
3. Starts a separately authenticated loopback proxy for host-side Herdr terminal-session processes.
4. Builds and starts the Node.js production container.
5. Selects an available host port and prints local and LAN URLs.

Set a fixed web port, custom herdr socket, or narrower project mount when needed:

```sh
HEDR_PORT=4173 \
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

The Hedr bridge can submit prompts and control terminal panes, so it fails closed when `HEDR_TOKEN` is empty.

Set a different `HEDR_VIEW_TOKEN` to grant snapshot, event-stream, and read-only terminal observation without prompt, upload, pane, session, or takeover permissions.

The browser exchanges its bearer token for a random terminal ticket that expires after 30 seconds and can be consumed only once.

Terminal WebSockets require the page's same origin and never place the bearer token in the WebSocket URL.

The token in a printed URL is moved into `sessionStorage` and removed from the address bar after the page loads.

The Docker socket forwarder listens only on host loopback.

Docker image paste requires write access to the configured `HERDR_PROJECTS_ROOT`, so mount only trusted project directories.

Treat the printed URL like a password, use this directly only on a trusted LAN, and place the app behind HTTPS and stronger access controls before exposing it to an untrusted network.

## Verification

```sh
npm run check          # Biome formatting and lint rules
npm run check:package  # npm package metadata and runtime contents
npm test               # Vitest client, bridge, reducer, and interaction tests
npm run test:e2e       # Playwright desktop and mobile browser checks
npm run build          # Browser and Node production bundles
npm run ci             # checks, package inspection, tests, and build
```

Install Playwright's Chromium once when it is not already available:

```sh
npx playwright install chromium
```

## Automation and releases

GitHub Actions runs `.github/workflows/ci.yml` for pull requests, pushes to `main`, and manual dispatches.

CI runs formatting and lint checks, all unit and integration tests, both production builds, Chromium browser tests, and a standalone Docker build.

Add a repository Actions secret named `PAT_TOKEN` before running release automation.

Set `PAT_TOKEN` to an npm access token permitted to publish `herdr-web`.

Version pull requests, GHCR images, and GitHub Releases use job-scoped `GITHUB_TOKEN` permissions.

Version bumps, publication, and GitHub Releases use the `release` environment so optional deployment-branch or reviewer protection can be configured in repository settings.

Run **Bump version** from `main` and choose `patch`, `minor`, or `major`.

The workflow updates `package.json` and `package-lock.json` in a GitHub-signed commit and opens a focused version-bump pull request.

After the version pull request passes CI and is merged, create and push a signed tag matching the package version:

```sh
git switch main
git pull --ff-only
git tag -s v0.2.0 -m "Hedr 0.2.0"
git push origin v0.2.0
```

The tag starts `.github/workflows/release.yml`, which verifies the tag and lockfile versions, reruns all checks, calls `.github/workflows/publish.yml`, and creates the GitHub Release only after every publication succeeds.

Publish sends `herdr-web` to the public npm registry using `PAT_TOKEN`.

It also builds `linux/amd64` and `linux/arm64` images with SBOM and provenance, then pushes immutable version, minor, major, commit, and `latest` tags to `ghcr.io/narumiruna/hedr`.

```sh
docker pull ghcr.io/narumiruna/hedr:latest
```

The **Publish** workflow can be rerun manually only from a matching `vX.Y.Z` tag and skips an npm version that already exists.

## Architecture

`server/herdr-client.ts` implements herdr's newline-delimited JSON socket transport.

`server/herdr-service.ts` reads `session.snapshot`, subscribes to structural Herdr events, and exposes prompt, split-ratio, split, close, upload, and approved agent-start operations.

`server/terminal-session.ts` launches Herdr terminal control or observation sessions locally or through the authenticated Docker host proxy, validates ordered NDJSON frames, and applies bounded browser-input backpressure.

`server/terminal-websocket.ts` consumes one-use tickets, validates origin, and bridges browser messages to one terminal process without replay.

`server/http-app.ts` validates controller or viewer authentication, request sizes, resource IDs, and action payloads before invoking Herdr.

`src/live-state.ts` maps protocol-19 snapshots into the workbench model in `src/state.ts`, grouping split panes under their detected Agent while retaining shell-only tabs as standalone Terminals.

`src/use-herdr-runtime.ts` consumes the structural event stream, separates rejected mutations from unknown outcomes, refreshes after accepted actions, and preserves the last valid snapshot during transient failures.

`src/components/InteractiveTerminal.tsx` owns xterm.js, terminal WebSocket lifecycle, image-path staging, search, and the optional prompt dialog.

The deterministic demo state remains available only through explicit test injection and `VITE_DEMO_MODE=true` for browser tests.

Hedr does not edit Herdr configuration files directly.

Use Herdr's own configuration commands until it exposes typed configuration reads and atomic patches through its public API.

The interface does not fabricate lifecycle history or settings that Herdr does not expose.
