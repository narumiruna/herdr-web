# herdr web

A responsive browser workbench for [herdr](https://github.com/herdrdev/herdr), the persistent runtime for coding-agent terminals.

The interface keeps herdr's core job visible: find the agent that needs attention, inspect its live terminal, and send a real prompt without hunting through sessions.

## Features

- Live workspace, tab, pane, terminal-output, and agent-state snapshots from herdr 0.8.
- Real prompts submitted through herdr's `agent.prompt` API, with responses shown in the terminal.
- Remote image paste, drag/drop, and file selection with host-readable Agent attachment paths.
- Working, blocked, idle, completed, and plain terminal states at a glance.
- Real pane splitting and closing.
- New Claude Code, Codex, Pi, and OpenCode sessions with fixed approved commands.
- A `⌘K` or `Ctrl+K` command palette for jumping between spaces and agents.
- Light and dark appearances.
- Responsive desktop, tablet, and mobile layouts.
- Bearer-token protection for every terminal-control API request.

## Radix UI

The front end intentionally uses every requested Radix family.

- **Colors:** semantic Sand, Amber, Blue, Grass, and Red scales from `@radix-ui/colors`.
- **Icons:** interface symbols from `@radix-ui/react-icons`.
- **Themes:** buttons, badges, fields, icon buttons, and the appearance provider from `@radix-ui/themes`.
- **Primitives:** Dialog, Dropdown Menu, Scroll Area, Separator, and Tooltip primitives.

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

## Send remote images

Paste an image into the message field, drop one onto the composer, or use the image button.

The composer accepts one PNG, JPEG, GIF, or WebP file up to 8 MiB and can send it without additional text.

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

`src/live-state.ts` maps protocol-19 snapshots into the workbench model in `src/state.ts`.

`src/use-herdr-runtime.ts` polls every 1.5 seconds and refreshes immediately after mutations so real agent output appears without reloading the page.

The deterministic demo state remains available only through explicit test injection and `VITE_DEMO_MODE=true` for browser tests.

Lifecycle event subscriptions and the three session action menu placeholders—copy summary, open branch, and stop session—are not implemented yet.
