# herdr-web

herdr-web is a responsive browser workbench for [herdr](https://github.com/herdrdev/herdr), the persistent runtime for coding-agent terminals.

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
- Herdr-aligned **Split right** and **Split down** pane actions, mouse and keyboard split resizing, and confirmed pane closing.
- A mouse and keyboard resizable desktop navigation rail with a browser-saved width.
- New Claude Code, Codex, Pi, and OpenCode Agents with visible, fixed approved commands.
- A keyboard-navigable `⌘K` or `Ctrl+K` palette for jumping between workspaces, Agents, and Terminals.
- On-demand session details without synthetic activity or unsupported runtime metadata.
- Last-valid-snapshot recovery with snapshot age, safe disabled actions, and per-pane read recovery.
- A restrained Japanese editorial appearance in warm paper and subdued sumi tones, with dark mode enabled by default and a saved light option.
- Interactive terminals retain their independent high-contrast dark palette for reliable ANSI and TUI readability.
- JetBrains Mono terminal text with bundled Nerd Font symbols, Unicode 11 cell widths, optional WebGL acceleration, and a safe built-in renderer fallback.
- Browser-saved Compact, Default, and Comfortable terminal text sizes with focused-terminal zoom shortcuts.
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

Start the web workbench without opening the shell's current directory:

```sh
herdr-web
```

Open the current directory or an explicit project directory only when requested:

```sh
herdr-web .
herdr-web /path/to/project
```

With a directory, the command resolves it, focuses an existing Herdr workspace that already contains it or creates a new workspace, and then starts the same authenticated web workflow as `just run`.

Without a directory, the command starts that web workflow without focusing or creating a workspace.

Run `herdr-web --help` for usage and press `Ctrl+C` to stop the development web processes.

The command requires `just`, while directory-opening mode also invokes `herdr`; a linked development command additionally depends on this checkout and its installed npm dependencies.

## Run locally

Install dependencies once:

```sh
just install
```

Start Vite and the authenticated herdr-web bridge:

```sh
just run
```

`just run` chooses available web and bridge ports, creates an access token, and prints local and LAN URLs containing that token.

Open the printed `network` URL from another device on the same trusted network.

For a stable controller token, optional independent viewer token, or a named-session socket:

```sh
HERDR_WEB_TOKEN=my-long-random-controller-token \
HERDR_WEB_VIEW_TOKEN=my-different-read-only-token \
HERDR_SOCKET_PATH="$HOME/.config/herdr/sessions/work/herdr.sock" \
just run
```

When updating from an earlier checkout, rename product-owned token, view-token, port, and host-identity variables to the documented `HERDR_WEB_*` form; upstream Herdr variables remain `HERDR_*`.

Saved appearance, terminal text size, Agent ordering, sidebar width, and session token values migrate to `herdr-web-*` browser keys on first use.

## Data directory

herdr-web stores new file data under one product-owned directory:

```text
$HOME/.herdr-web/
├── uploads/
└── runtime/
```

Set the absolute `HERDR_WEB_HOME` path to override this location.

Uploads from earlier versions remain in their original project directories and are never moved or deleted automatically.

Herdr continues to own `$HOME/.config/herdr/`, its socket, API, and `HERDR_*` variables; herdr-web does not change them.

Without `just`, set a token explicitly before running the development processes:

```sh
HERDR_WEB_TOKEN=my-long-random-token npm run dev
```

Vite prints the network URL, and the page asks for the token when it is not included in the URL.

## Workbench workflow

Needs input lists blocked Agents across every workspace and identifies each Agent's workspace.

The sidebar follows Herdr's layout with **Spaces** above a global **Agents** panel, while the tab bar shows each Agent or standalone Terminal in Herdr tab order.

Use **Grouped** to keep Agents in Space and tab order, or **Priority** to surface blocked and newly completed Agents first; the choice is saved in this browser.

Use **New** below Spaces to preview and create a persistent Herdr workspace for a host directory.

Use **Menu** for saved appearance and terminal text-size settings, the workbench keybinding reference, and an explicit Herdr reload.

Returning to a Space restores its last selected tab, while choosing a Needs input or Agents item opens that exact Agent.

Use the **+** beside the tab strip to start another Agent in the current Space without leaving the terminal context.

Use **Split right** for side-by-side panes or **Split down** for stacked panes; herdr-web forwards the same `right` or `down` direction used by Herdr's `pane.split` API.

Split panes stay inside their parent tab, follow that Herdr direction on wide screens, and use a readable pane selector on narrow screens.

Drag the divider between two visible panes to preview a new ratio, then release it to persist the ratio atomically through Herdr's `layout.set_split_ratio` API.

The pane divider also supports arrow keys plus Home and End, while controller loss or a rejected update restores the last confirmed Herdr ratio.

Drag the desktop navigation divider or focus it and use Left, Right, Home, or End to adjust its width; this browser-only preference does not alter Herdr.

Each Agent tab keeps its status visible, while one compact terminal bar combines the current working directory, branch, pane title, connection state, and terminal actions without redundant title rows.

The focused terminal owns the remaining screen and is the primary interaction surface.

Typing, paste, mouse input, terminal applications, and resize are forwarded through a dedicated WebSocket to one Herdr terminal session.

The terminal waits for its bundled fonts before the authoritative fit, uses Unicode 11 widths, and prefers WebGL while automatically retaining the built-in renderer when WebGL is unavailable or loses context.

Use the terminal toolbar to search output, stage image paths, or open the optional Agent prompt dialog.

A controller conflict offers explicit read-only observation or takeover instead of silently stealing control.

Standalone Terminals support the same interactive session when Herdr terminal streaming is available.

If terminal streaming is unavailable, herdr-web keeps the bounded snapshot view and Agent composer as an explicit compatibility fallback.

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
- Use `Cmd/Ctrl` + `+` or `Cmd/Ctrl` + `-` while the terminal is focused to adjust text size, and use `Cmd/Ctrl` + `0` to restore 13 px.
- Choose Compact, Default, or Comfortable under **Menu → Settings**; the selected size is saved only in this browser.
- Use the image toolbar button to stage a local image.
- Use the mobile **Esc**, **Ctrl**, and **Tab** key row when the soft keyboard does not expose terminal modifiers.
- Use **Prompt Agent** when you intentionally want Herdr's semantic `agent.prompt` action instead of terminal input.

## Send remote images

Focus the interactive terminal, then paste images with `Cmd+V` on macOS or `Ctrl+V` on Windows and Linux; the image button is the fallback.

Each batch accepts up to eight PNG, JPEG, GIF, or WebP images, preserves clipboard order, and allows the same image to be pasted again in a later batch.

Pasting during connection still opens the review dialog, but uploading waits until the terminal reports **Interactive**.

The staged-image dialog performs no upload until **Upload and insert path** or its multi-image equivalent is confirmed.

The bridge verifies each image signature, enforces an 8 MiB per-image limit, and writes a random file under `$HOME/.herdr-web/uploads/` by default.

herdr-web uploads a batch sequentially and inserts all shell-escaped absolute paths in one terminal input only after every image succeeds, without pressing Enter.

If part of a batch fails, successful paths remain visible and **Retry failed uploads** uploads only unfinished images.

Cancelling after a partial failure does not remove files that already reached the Herdr host, so remove those files manually when they are no longer needed.

If path insertion cannot be confirmed, the dialog retains every uploaded path for insertion retry without uploading a duplicate.

The compatibility composer retains its existing single-image paste, drag/drop, and file-selection behavior when interactive terminal streaming is unavailable.

Remove old attachments manually when they are no longer needed:

```sh
find "$HOME/.herdr-web/uploads" -type f -delete
```

Uploads created by earlier versions are left untouched in their project directories and can be removed manually after any Agent references to them are no longer needed.

## Run with Docker

Build and start the production container:

```sh
just up
```

`just up` performs these steps:

1. Creates an access token unless `HERDR_WEB_TOKEN` is already set.
2. Starts a loopback-only TCP forwarder for the host Herdr Unix socket.
3. Starts a separately authenticated loopback proxy for host-side Herdr terminal-session processes.
4. Builds and starts the Node.js production container.
5. Selects an available host port and prints local and LAN URLs.

Set a fixed web port, custom product data home, custom herdr socket, or narrower project mount when needed:

```sh
HERDR_WEB_PORT=4173 \
HERDR_WEB_HOME="$HOME/.herdr-web" \
HERDR_SOCKET_PATH="$HOME/.config/herdr/sessions/work/herdr.sock" \
HERDR_PROJECTS_ROOT="$HOME/workspace" \
just up
```

`just up` mounts both `HERDR_PROJECTS_ROOT` and `HERDR_WEB_HOME` at their same absolute container paths and runs the container with the host UID and GID so uploaded files remain accessible to both the container and host Agent.

The default project root is `$HOME`; choose the narrowest common parent containing all Herdr project directories.

Image uploads fail without prompting the Agent when its active directory is outside this mounted root.

Stop both the container and host socket forwarder:

```sh
just down
```

`just down` remembers the last `HERDR_WEB_HOME` used by `just up`, so a plain shutdown also cleans helper state started with an inline custom home.

The container serves the SPA and authenticated API from one Node.js process.

Its `/healthz` endpoint checks the web process, while authenticated `/api/herdr/state` proves access to the live herdr server.

## Security

The herdr-web bridge can submit prompts and control terminal panes, so it fails closed when `HERDR_WEB_TOKEN` is empty.

Set a different `HERDR_WEB_VIEW_TOKEN` to grant snapshot, event-stream, and read-only terminal observation without prompt, upload, pane, session, or takeover permissions.

The browser exchanges its bearer token for a random terminal ticket that expires after 30 seconds and can be consumed only once.

Terminal WebSockets require the page's same origin and never place the bearer token in the WebSocket URL.

The token in a printed URL is moved into `sessionStorage` and removed from the address bar after the page loads.

The Docker socket forwarder listens only on host loopback.

Docker image paste requires read access to the configured `HERDR_PROJECTS_ROOT` and write access to `HERDR_WEB_HOME`, so mount only trusted directories.

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

CI runs formatting and lint checks, all unit and integration tests, both production builds, and Chromium browser tests.

Add a repository Actions secret named `PAT_TOKEN` before running release automation.

Set `PAT_TOKEN` to a GitHub personal access token with permission to update repository contents so its branch and tag pushes trigger downstream workflows.

Configure npm Trusted Publishing for package `herdr-web` with this GitHub repository, workflow `publish.yml`, and environment `release`; no npm token is stored in GitHub.

GitHub Releases use job-scoped `GITHUB_TOKEN` permissions.

Version bumps, publication, and GitHub Releases use the `release` environment so optional deployment-branch or reviewer protection can be configured in repository settings.

Run **Bump version** from `main` and choose `patch` (the default), `minor`, or `major`.

The workflow updates `package.json` and `package-lock.json` in a GitHub-signed commit directly on `main`, then creates the matching `vX.Y.Z` tag at that exact commit without opening a pull request.

The PAT-authenticated commit starts CI, while its tag independently starts `.github/workflows/release.yml` and `.github/workflows/publish.yml`.

Release verifies that the stable semver tag belongs to `main`, matches both package files, and creates a GitHub Release with generated release notes.

Publish performs the same metadata checks, runs the repository and Chromium test gates, and sends `herdr-web` to the public npm registry through npm Trusted Publishing.

The **Publish** and **Release** workflows can be rerun manually only from a matching `vX.Y.Z` tag, and Publish skips an npm version that already exists.

If a bump reports that its version commit succeeded but tag creation failed, create the reported tag at the reported commit instead of running another version bump.

## Architecture

`server/herdr-client.ts` implements herdr's newline-delimited JSON socket transport.

`server/herdr-service.ts` reads `session.snapshot`, subscribes to structural Herdr events, and exposes prompt, directional pane split, split-ratio, close, upload, and approved agent-start operations.

`server/terminal-session.ts` launches Herdr terminal control or observation sessions locally or through the authenticated Docker host proxy, validates ordered NDJSON frames, and applies bounded browser-input backpressure.

`server/terminal-websocket.ts` consumes one-use tickets, validates origin, and bridges browser messages to one terminal process without replay.

`server/http-app.ts` validates controller or viewer authentication, request sizes, resource IDs, and action payloads before invoking Herdr.

`src/live-state.ts` maps protocol-19 snapshots into the workbench model in `src/state.ts`, grouping split panes under their detected Agent while retaining shell-only tabs as standalone Terminals.

`src/use-herdr-runtime.ts` consumes the structural event stream, separates rejected mutations from unknown outcomes, refreshes after accepted actions, and preserves the last valid snapshot during transient failures.

`src/components/InteractiveTerminal.tsx` owns xterm.js, terminal WebSocket lifecycle, image-path staging, search, and the optional prompt dialog.

The deterministic demo state remains available only through explicit test injection and `VITE_DEMO_MODE=true` for browser tests.

herdr-web does not edit Herdr configuration files directly.

Use Herdr's own configuration commands until it exposes typed configuration reads and atomic patches through its public API.

The interface does not fabricate lifecycle history or settings that Herdr does not expose.
