# herdr-web

herdr-web is a responsive browser workbench for [herdr](https://github.com/herdrdev/herdr), the persistent runtime for coding-agent terminals.

It keeps herdr's core job visible: find the Agent that needs input, control its live terminal, and send a real prompt without hunting through sessions.

## Features

- Terminal-dominant desktop, tablet, and mobile layouts with one persistent navigation rail on wide screens.
- A workspace tab bar that preserves Herdr tab order across detected Agents and standalone Terminals.
- A global Attention Inbox with real terminal previews, Needs input, Failed, and Recently done groups, quick replies, snooze, per-Agent mute, review state, and keyboard triage.
- Service-worker-backed Needs input, Failed, and Done notifications with optional sound, per-Agent mute, cooldown, durable deduplication, privacy controls, and exact Space, Agent, and pane deep links.
- An Action Palette for navigation, approved pane and Agent actions, terminal search and takeover, appearance and text size, Herdr reload, and confirmed declared plugin actions.
- Mission Control for optional cross-Space supervision with real status, terminal previews, attention age, connection role, and direct Agent navigation.
- Browser-local and project-scoped workflow templates for ordered batches of approved Agent runtimes, initial prompts, working directories, and explicit launch barriers without autonomous Agent collaboration.
- Short-lived, revocable, read-only viewer links scoped to one Space, Agent, or pane, with state projection and observation-ticket enforcement.
- Interactive xterm.js terminals backed by Herdr 0.8 terminal control and observation sessions.
- Exact terminal input, ANSI output, resize, mouse, IME, Unicode, and alternate-screen behavior without snapshot polling.
- Structural workspace, tab, pane, layout, and Agent updates from Herdr event subscriptions.
- Real prompts submitted through Herdr's `agent.prompt` API from an optional terminal-side dialog.
- Per-Agent in-memory text and image drafts that survive empty workspaces, navigation, and failed sends.
- Remote image paste, drag/drop, and file selection with host-readable Agent attachment paths.
- Herdr-aligned **Split right** and **Split down** pane actions, mouse and keyboard split resizing, and confirmed pane closing.
- A mouse and keyboard resizable desktop navigation rail with a browser-saved width.
- New Claude Code, Codex, OpenCode, Pi, and Qwen Code Agents with visible, fixed approved commands.
- A controller-only Herdr runtime center for plugin state, declared actions, recent logs, and official integration install or uninstall operations.
- Browser tab titles that surface global Needs input counts and the selected Space and Agent.
- A keyboard-navigable `⌘K` or `Ctrl+K` palette for jumping between workspaces, Agents, and Terminals.
- On-demand session details without synthetic activity or unsupported runtime metadata.
- Last-valid-snapshot recovery with snapshot age, safe disabled actions, and per-pane read recovery.
- Four saved themes: Editorial Light and Dark use warm paper and subdued sumi tones, while Classic Light and Dark preserve the original Sand and Amber workbench.
- Interactive terminals retain their independent high-contrast dark palette across every theme for reliable ANSI and TUI readability.
- Bundled JetBrainsMono Nerd Font Mono (Nerd Fonts v3.5.1) for terminal text and icons, Unicode 11 cell widths, optional WebGL acceleration, and a safe built-in renderer fallback. Font source and licenses: [`public/fonts/README.md`](public/fonts/README.md).
- Browser-saved Compact, Default, and Comfortable terminal text sizes with focused-terminal zoom shortcuts.
- Explicit screen-reader terminal and reduced-motion modes, plus keyboard-only workbench and terminal-adjacent controls.
- A redacted terminal diagnostics panel for measured WebSocket bridge round trip, output delivery, reconnect count, renderer, dimensions, Unicode, Herdr protocol, and actual control or observation mode.
- An installable online-only PWA shell with authenticated Web Push for closed-app attention, notification clicks, connection visibility, and an optional foreground screen wake lock.
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
- `just` for the optional convenience and Docker commands.
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

With a directory, the command resolves it, focuses an existing Herdr workspace that already contains it or creates a new workspace, and then starts the authenticated web workflow directly through Node.js.

Without a directory, the command starts that web workflow without focusing or creating a workspace.

Run `herdr-web --help` for usage and press `Ctrl+C` to stop the development web processes.

The command does not require `just`.
Directory-opening mode also invokes `herdr`, while a linked development command depends on this checkout and its installed npm dependencies.
On Windows, the bridge discovers Herdr's named pipe from `herdr status --json` unless `HERDR_SOCKET_PATH` is set explicitly.

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
    ├── push-notifications.json
    ├── viewer-shares.json
    └── workflow-templates.json
```

Set the absolute `HERDR_WEB_HOME` path to override this location.

Uploads from earlier versions remain in their original project directories and are never moved or deleted automatically.

Herdr continues to own `$HOME/.config/herdr/`, its socket, API, and `HERDR_*` variables; herdr-web does not change them.

Without `just`, set a token explicitly before running the development processes manually:

```sh
HERDR_WEB_TOKEN=my-long-random-token npm run dev
```

Vite prints the network URL, and the page asks for the token when it is not included in the URL.

## Workbench workflow

Needs input lists blocked Agents across every workspace and identifies each Agent's workspace.

The sidebar follows Herdr's layout with **Spaces** above a global **Agents** panel, while the tab bar shows each Agent or standalone Terminal in Herdr tab order.

Use **Grouped** to keep Agents in Space and tab order, or **Priority** to surface blocked and newly completed Agents first; the choice is saved in this browser.

Use **New** below Spaces to preview and create a persistent Herdr workspace for a host directory.

Use **Menu → Settings** to choose Editorial Light, Editorial Dark, Classic Light, or Classic Dark, adjust terminal text size, configure notifications, choose explicit accessibility preferences, request a foreground wake lock, or install the PWA when the browser supports installation.
Use **Attention Inbox** to triage real Needs input, Failed, and Recently done Agent states without leaving the selected terminal.
Use **Mission Control** for an optional cross-Space overview; it does not replace the terminal-first workbench.
Use **Workflow templates** to save browser-local or centrally stored project-scoped launch batches whose commands remain fixed to approved runtimes.
Use **Viewer shares** as a controller to create a one-time secret link with an exact scope and expiry, inspect issued links, and revoke active access.
Use **Menu** for the workbench keybinding reference, the controller-only **Herdr runtime** center, and an explicit Herdr reload.
The runtime center lists installed plugins, enables or disables them, confirms declared plugin actions before execution, shows recent command logs, and installs or uninstalls allowlisted official Agent integrations through Herdr.
Herdr does not expose typed integration status through the socket API, so **Install / repair** is intentionally idempotent and the interface does not fabricate installed state.

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

Use the terminal toolbar to search output, inspect redacted transport diagnostics, stage image or file paths, or open the optional Agent prompt dialog.

A controller conflict offers explicit read-only observation or takeover instead of silently stealing control.

Standalone Terminals support the same interactive session when Herdr terminal streaming is available.

If terminal streaming is unavailable, herdr-web keeps the bounded snapshot view and Agent composer as an explicit compatibility fallback.

Use **New agent** to review and launch one of the five approved runtime presets, including Qwen Code.

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
- Use `Cmd+K` or `Ctrl+K` to open the Action Palette.
- In Attention Inbox, use `J` or `N` for next, `K` or `P` for previous, `R` to reply, and Enter to send and advance.
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

herdr-web uploads up to three images concurrently and inserts all shell-escaped absolute paths in the original order only after every image succeeds, without pressing Enter.

Each image request allows 120 seconds and retries transient network or server failures up to twice with the same upload ID. A recovered retry reuses one host path instead of creating a duplicate file, while permanent errors fail immediately.

If part of a batch still fails, successful paths remain visible and **Retry failed uploads** uploads only unfinished images.

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

The herdr-web bridge can submit prompts, control terminal panes, manage plugins, run plugin actions, and update official integrations, so it fails closed when `HERDR_WEB_TOKEN` is empty.

Set a different `HERDR_WEB_VIEW_TOKEN` to grant global snapshot, event-stream, and read-only terminal observation without prompt, upload, pane, session, takeover, plugin, integration, share-management, or workflow-management permissions.
Controller-created viewer shares are separate random credentials stored only as hashes, expire after 5 minutes to 7 days, expose a minimized exact-scope projection, issue observe-only scope-checked terminal tickets, and invalidate pending and active share sessions on revocation or expiry.
The one-time viewer-share URL keeps its secret in the fragment so it is not sent in the initial HTTP request, then moves it into `sessionStorage` and removes it from the address bar.

The browser exchanges its bearer token for a random terminal ticket that expires after 30 seconds and can be consumed only once.

Terminal WebSockets require the page's same origin and never place the bearer token in the WebSocket URL.

The controller or global viewer token in a printed URL is moved into `sessionStorage` and removed from the address bar after the page loads.

The Docker socket forwarder listens only on host loopback.

Docker image paste requires read access to the configured `HERDR_PROJECTS_ROOT` and write access to `HERDR_WEB_HOME`, so mount only trusted directories.

Treat every printed or shared URL like a password, use this directly only on a trusted LAN, and place the app behind HTTPS and stronger access controls before exposing it to an untrusted network.
The service worker never caches HTML, API responses, event streams, terminal tickets, credentials, or terminal data.
PWA installation, Web Push, and wake lock require browser support and a secure context outside localhost.
When a controller enables Agent notifications, the browser registers an authenticated Push subscription and the bridge sends Needs input, Failed, and Done transitions even after the page closes.
Push endpoints, browser keys, generated VAPID keys, cooldown state, mute preferences, and no bearer tokens are stored in the mode-0600 runtime file.
Set `HERDR_WEB_VAPID_CONTACT` to a `mailto:` or HTTPS contact when the generated VAPID identity should use an operator address.
herdr-web remains online-only and does not cache or claim offline terminal execution.

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

CI runs formatting and lint checks, all unit and integration tests, both production builds, and Chromium browser tests on Linux.
A Windows job also builds the application and verifies native npm startup, named-pipe metadata, and Windows path contracts.

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

`src/live-state.ts` maps Herdr protocol 19 and 20 snapshots into the workbench model in `src/state.ts`, grouping split panes under their detected Agent while retaining shell-only tabs as standalone Terminals.

`src/use-herdr-runtime.ts` consumes the structural event stream, separates rejected mutations from unknown outcomes, refreshes after accepted actions, and preserves the last valid snapshot during transient failures.

`src/attention-center.ts` owns defensive browser-local attention preferences, timestamps, mute, snooze, review, notification cooldown, and deduplication.

`server/share-store.ts` and `server/share-projection.ts` own hashed viewer-share credentials, expiry, revocation, exact-scope projection, and pane authorization.

`server/workflow-template-store.ts` owns atomic project-scoped workflow persistence, while `src/workflow-templates.ts` owns the versioned browser schema and bounded ordered execution.

`src/components/InteractiveTerminal.tsx` owns xterm.js, terminal WebSocket lifecycle, redacted diagnostics, image-path staging, search, and the optional prompt dialog.

`server/push-notifications.ts` owns persisted VAPID identity, authenticated subscriptions, transition deduplication, mute and privacy enforcement, and Web Push delivery.

`public/sw.js` owns PWA lifecycle, Push display, and same-origin notification clicks without an offline cache.

The deterministic demo state remains available only through explicit test injection and `VITE_DEMO_MODE=true` for browser tests.

herdr-web does not edit Herdr configuration files, plugin registries, or Agent integration files directly.

Plugin and integration mutations use Herdr's public API.
Use Herdr's own configuration commands until it exposes typed configuration reads and atomic patches through its public API.

The interface does not fabricate lifecycle history or settings that Herdr does not expose.
