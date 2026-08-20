# herdr-web

A responsive browser workbench for [herdr](https://github.com/herdrdev/herdr), the persistent runtime for coding-agent terminals.

It keeps herdr's core job visible: find the Agent that needs input, control its live terminal, and send a real prompt without hunting through sessions.

## Quick start

Requires Node.js 22+, a running herdr 0.8+ server, and [`just`](https://github.com/casey/just).

Confirm the local herdr server is up, then run the workbench without installing it:

```sh
herdr status server
npx herdr-web                  # or: npx herdr-web /path/to/project
```

Install it globally for a shorter command on repeat use:

```sh
npm install --global herdr-web
herdr-web                      # or: herdr-web /path/to/project
```

Either form prints local and LAN URLs that already contain an access token.

Open the `network` URL from another device on the same trusted network, and press `Ctrl+C` to stop.

Given a directory, `herdr-web` resolves it and focuses the herdr workspace containing it, creating one if none exists.

Without a directory, it starts the same web workflow and touches no workspace.

Directory mode also invokes `herdr`; run `herdr-web --help` for usage.

## What it does

**Find the Agent that is blocked.**
A global **Needs input** queue sits above workspace navigation and lists blocked Agents across every workspace, each labeled with its workspace.

**Control its terminal.**
Interactive xterm.js panes are backed by herdr terminal control and observation sessions, so exact input, ANSI output, resize, mouse, IME, Unicode, and alternate-screen behavior work without snapshot polling.

**Send a real prompt.**
An optional terminal-side dialog submits through herdr's `agent.prompt` API instead of typing into the shell.

Around those three, the workbench provides terminal-dominant desktop, tablet, and mobile layouts, a tab bar in herdr tab order, directional pane splits with draggable ratios, a `⌘K` / `Ctrl+K` palette, per-Agent text and image drafts, remote image paste, and four approved Agent presets (Claude Code, Codex, Pi, OpenCode).

Structural updates arrive over herdr event subscriptions.

## Run from a checkout

```sh
just install       # install dependencies once
just install-cli   # optional: link the herdr-web command from this checkout
just run           # start Vite and the authenticated bridge
```

`just run` picks free web and bridge ports, creates an access token, and prints the tokenized URLs.

Without `just`, set a token explicitly:

```sh
HERDR_WEB_TOKEN=my-long-random-token npm run dev
```

Vite then prints the network URL, and the page asks for the token when the URL omits it.

## Run with Docker

```sh
just up     # build and start the production container
just down   # stop the container and the host socket forwarder
```

`just up` creates a token when `HERDR_WEB_TOKEN` is unset, starts a loopback-only TCP forwarder for the host herdr Unix socket, starts a separately authenticated loopback proxy for host-side terminal-session processes, builds and starts the Node.js container, then picks a free host port and prints the URLs.

```sh
HERDR_WEB_PORT=4173 \
HERDR_WEB_HOME="$HOME/.herdr-web" \
HERDR_SOCKET_PATH="$HOME/.config/herdr/sessions/work/herdr.sock" \
HERDR_PROJECTS_ROOT="$HOME/workspace" \
just up
```

Both `HERDR_PROJECTS_ROOT` and `HERDR_WEB_HOME` are mounted at their same absolute container paths, and the container runs with the host UID and GID so uploads stay accessible to the container and the host Agent.

`HERDR_PROJECTS_ROOT` defaults to `$HOME`; choose the narrowest parent containing all herdr project directories.

Image uploads fail silently for the Agent when its active directory falls outside that mount.

`just down` remembers the last `HERDR_WEB_HOME` used by `just up`, so a plain shutdown still cleans helper state started with an inline custom home.

One Node.js process serves the SPA and the authenticated API.

`/healthz` checks the web process, and authenticated `/api/herdr/state` proves access to the live herdr server.

## Configuration

| Variable | Purpose |
| --- | --- |
| `HERDR_WEB_TOKEN` | Controller token; the bridge fails closed when empty. |
| `HERDR_WEB_VIEW_TOKEN` | Optional independent read-only token. |
| `HERDR_WEB_PORT` | Fixed web port instead of an auto-selected one. |
| `HERDR_WEB_HOME` | Absolute product data directory, default `$HOME/.herdr-web`. |
| `HERDR_PROJECTS_ROOT` | Host directory mounted into the container, default `$HOME`. |
| `HERDR_SOCKET_PATH` | Upstream herdr socket for a named session. |

Product settings use the `HERDR_WEB_*` prefix; plain `HERDR_*` variables belong to upstream herdr.

When updating an older checkout, rename product-owned token, view-token, port, and host-identity variables to the `HERDR_WEB_*` form.

Saved appearance, terminal text size, Agent ordering, sidebar width, and session tokens migrate to `herdr-web-*` browser keys on first use.

### Data directory

```text
$HOME/.herdr-web/
├── uploads/
└── runtime/
```

herdr keeps ownership of `$HOME/.config/herdr/`, its socket, and its API; herdr-web never edits herdr configuration files.

Uploads from earlier versions stay in their original project directories and are never moved or deleted automatically.

## Using the workbench

### Navigating

The sidebar mirrors herdr's layout with **Spaces** above a global **Agents** panel, and the tab bar lists each Agent and standalone Terminal in herdr tab order.

Sort Agents by **Grouped** for Space and tab order or **Priority** to surface blocked and newly completed Agents first; the choice is saved in this browser.

Returning to a Space restores its last selected tab, while opening a **Needs input** or **Agents** entry jumps to that exact Agent.

Use **New** below Spaces to preview and create a persistent workspace for a host directory, **+** beside the tab strip to start another Agent in the current Space, and **New agent** to launch one of the four approved presets.

Agent launch continues as a visible background action, so closing its dialog never pretends to cancel server work.

**Menu** holds appearance and terminal text-size settings, the keybinding reference, and an explicit herdr reload.

On mobile, **New**, **Menu**, Spaces, and Agents move into the navigation drawer and session details into **More actions**, keeping navigation, search, and terminal work reachable at 320px.

### Terminal panes

One compact terminal bar combines the working directory, branch, pane title, connection state, and terminal actions, and the focused terminal owns the remaining screen.

Typing, paste, mouse input, and resize are forwarded over a dedicated WebSocket to a single herdr terminal session.

The terminal waits for its bundled fonts before the authoritative fit, uses Unicode 11 cell widths, and prefers WebGL while falling back to the built-in renderer when WebGL is unavailable or loses context.

A controller conflict offers explicit read-only observation or takeover rather than silently stealing control.

| Action | Keys |
| --- | --- |
| Copy selection | `Cmd+C` (macOS) or `Ctrl+Shift+C` |
| Paste text or stage a clipboard image | `Cmd+V` (macOS) or `Ctrl+V` |
| Search output | `Cmd/Ctrl+Shift+F` |
| Adjust text size | `Cmd/Ctrl` + `+` / `-`, `Cmd/Ctrl+0` to restore 13 px |
| Command palette | `Cmd/Ctrl+K` |

Compact, Default, and Comfortable sizes are also available under **Menu → Settings** and saved only in this browser.

The mobile **Esc**, **Ctrl**, and **Tab** key row covers modifiers the soft keyboard hides.

Use **Prompt Agent** when you intentionally want herdr's semantic `agent.prompt` action instead of terminal input.

### Splitting panes

**Split right** and **Split down** forward the matching `right` or `down` direction to herdr's `pane.split` API, and split panes stay inside their parent tab.

Wide screens follow the herdr direction; narrow screens use a pane selector instead.

Drag the divider to preview a ratio and release to persist it atomically through `layout.set_split_ratio`; arrow keys plus Home and End work too, and controller loss or a rejected update restores the last confirmed ratio.

Closing a split pane requires confirmation.

The desktop navigation divider resizes the same way but is a browser-only preference that never reaches herdr.

### Sending remote images

Focus the terminal and paste with `Cmd+V` or `Ctrl+V`; the toolbar image button is the fallback.

Each batch takes up to eight PNG, JPEG, GIF, or WebP images, preserves clipboard order, and allows the same image again in a later batch.

Pasting during connection opens the review dialog but defers uploading until the terminal reports **Interactive**, and nothing uploads before **Upload and insert path** is confirmed.

The bridge verifies each image signature, enforces an 8 MiB per-image limit, and writes a random file under `$HOME/.herdr-web/uploads/`.

A batch uploads sequentially, and all shell-escaped absolute paths are inserted in one terminal input — without pressing Enter — only after every image succeeds.

On partial failure, successful paths stay visible and **Retry failed uploads** retries only the unfinished images.

If path insertion cannot be confirmed, the dialog keeps every uploaded path so retrying inserts without re-uploading.

Cancelling after a partial failure leaves files that already reached the host, so clean up manually:

```sh
find "$HOME/.herdr-web/uploads" -type f -delete
```

### Drafts and recovery

Text and image drafts are kept per Agent, survive in-app navigation and failed sends, and clear only once herdr accepts the prompt.

They live in memory by design and do not survive a page reload.

When delivery cannot be confirmed, inspect the terminal before choosing **Send again**, because the original prompt may already have arrived.

Herdr events drive control-plane refreshes, with a 30-second consistency refresh and a temporary 1.5-second fallback only while the event stream is down.

If refresh fails after a successful connection, the workbench keeps the live session and last valid snapshot visible, shows its age, disables mutations, and offers **Retry now**.

A failed single-pane read leaves other panes usable and offers **Retry output**.

When terminal streaming is unavailable entirely, herdr-web falls back to the bounded snapshot view and Agent composer, which keeps its own single-image paste, drag/drop, and file selection.

## Security

The bridge can submit prompts and control panes, so it fails closed when `HERDR_WEB_TOKEN` is empty.

`HERDR_WEB_VIEW_TOKEN` grants snapshots, the event stream, and read-only terminal observation without prompt, upload, pane, session, or takeover permissions.

The browser exchanges its bearer token for a random terminal ticket that expires after 30 seconds and can be consumed once.

Terminal WebSockets require the page's own origin and never carry the bearer token in the URL.

A token from a printed URL moves into `sessionStorage` and leaves the address bar after load.

The Docker socket forwarder listens only on host loopback.

Docker image paste needs read access to `HERDR_PROJECTS_ROOT` and write access to `HERDR_WEB_HOME`, so mount only trusted directories.

Treat the printed URL like a password, use it directly only on a trusted LAN, and put the app behind HTTPS and stronger access controls before exposing it to an untrusted network.

## Development

```sh
npm run check          # Biome formatting and lint rules
npm run check:package  # npm package metadata and runtime contents
npm test               # Vitest client, bridge, reducer, and interaction tests
npm run test:e2e       # Playwright desktop and mobile browser checks
npm run build          # browser and Node production bundles
npm run ci             # all of the above
```

Install Playwright's Chromium once if it is missing:

```sh
npx playwright install chromium
```

### Architecture

| Module | Responsibility |
| --- | --- |
| `server/herdr-client.ts` | herdr's newline-delimited JSON socket transport. |
| `server/herdr-service.ts` | `session.snapshot` reads, structural event subscriptions, and prompt, split, ratio, close, upload, and agent-start operations. |
| `server/terminal-session.ts` | Local or Docker-proxied terminal control and observation sessions, NDJSON frame ordering, and bounded input backpressure. |
| `server/terminal-websocket.ts` | One-use tickets, origin validation, and browser-to-terminal bridging without replay. |
| `server/http-app.ts` | Controller and viewer authentication, request size, resource ID, and payload validation. |
| `src/live-state.ts` | Protocol-19 snapshots into the workbench model of `src/state.ts`, grouping split panes under their Agent and keeping shell-only tabs as Terminals. |
| `src/use-herdr-runtime.ts` | Event-stream consumption, rejected-versus-unknown mutation outcomes, post-action refresh, and last-valid-snapshot retention. |
| `src/components/InteractiveTerminal.tsx` | xterm.js, WebSocket lifecycle, image staging, search, and the prompt dialog. |

The front end uses `@radix-ui/colors` (Sand, Amber, Blue, Grass, Red), `@radix-ui/react-icons`, `@radix-ui/themes`, and the Dialog, Scroll Area, Tabs, and Tooltip primitives.

The deterministic demo state is reachable only through explicit test injection and `VITE_DEMO_MODE=true`.

The interface never fabricates lifecycle history or settings that herdr does not expose, and configuration changes stay with herdr's own commands until it exposes typed reads and atomic patches.

### Releases

`.github/workflows/ci.yml` runs formatting and lint checks, unit and integration tests, both production builds, and Chromium tests for pull requests, pushes to `main`, and manual dispatches.

Release automation needs a repository Actions secret `PAT_TOKEN` holding a personal access token with contents write permission, so its branch and tag pushes trigger downstream workflows.

Publishing uses npm Trusted Publishing configured for package `herdr-web` with this repository, workflow `publish.yml`, and environment `release`; no npm token is stored in GitHub.

GitHub Releases rely on job-scoped `GITHUB_TOKEN` permissions, and bumps, publication, and releases all run in the `release` environment so deployment-branch or reviewer protection can be added in repository settings.

Run **Bump version** from `main` and choose `patch` (default), `minor`, or `major`.

It updates `package.json` and `package-lock.json` in a GitHub-signed commit on `main` and creates the matching `vX.Y.Z` tag at that commit without a pull request.

That commit starts CI, while the tag independently starts `release.yml` and `publish.yml`.

Release verifies the stable semver tag belongs to `main` and matches both package files, then creates a GitHub Release with generated notes.

Publish repeats the metadata checks, runs the repository and Chromium test gates, and sends the package to npm, skipping a version that already exists.

**Publish** and **Release** can be rerun manually only from a matching `vX.Y.Z` tag.

If a bump reports a successful version commit but a failed tag creation, create the reported tag at the reported commit instead of bumping again.

## License

See [LICENSE](LICENSE).
