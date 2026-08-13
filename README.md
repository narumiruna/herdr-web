# herdr web

A responsive browser workbench for [herdr](https://github.com/herdrdev/herdr), the persistent runtime for coding-agent terminals.

The interface keeps herdr's core job visible: find the agent that needs attention, inspect its terminal, and respond without hunting through sessions.

## Features

- Workspace and agent navigation ordered by attention state.
- Working, blocked, idle, and completed agent status at a glance.
- Focused terminal sessions with split panes and pane controls.
- Direct replies that resume blocked agents and update the activity stream.
- New Claude Code, Codex, Pi, and OpenCode session flows.
- A `⌘K` or `Ctrl+K` command palette for jumping between spaces and agents.
- Light and dark appearances.
- Responsive desktop, tablet, and mobile layouts with navigation and activity drawers.
- Keyboard focus, accessible dialog semantics, and reduced-motion support.

## Radix UI

The front end intentionally uses every requested Radix family.

- **Colors:** semantic Sand, Amber, Blue, Grass, and Red scales from `@radix-ui/colors`.
- **Icons:** interface symbols from `@radix-ui/react-icons`.
- **Themes:** buttons, badges, fields, icon buttons, and the appearance provider from `@radix-ui/themes`.
- **Primitives:** Dialog, Dropdown Menu, Scroll Area, Separator, and Tooltip primitives.

## Run locally

Node.js 22 or newer is recommended.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

A production build is available with:

```sh
npm run build
npm run preview
```

You can use the equivalent `just install`, `just run`, and `just build` commands when [just](https://github.com/casey/just) is installed.

## Run with Docker

Build and start the production container with `just`:

```sh
just up
```

Docker selects an available host port, and `just up` prints the URL to open.

Set `HERDR_WEB_PORT` when you need a fixed host port:

```sh
HERDR_WEB_PORT=4173 just up
```

Stop and remove the container with:

```sh
just down
```

The equivalent commands without `just` are `docker compose up --build -d` and `docker compose down`.

The image uses Node.js to build the Vite app, then serves the static bundle from Nginx with SPA route fallback and a `/healthz` health check.

## Verification

```sh
npm run check      # Biome formatting and lint rules
npm test           # Vitest reducer and interaction tests
npm run test:e2e   # Playwright desktop and mobile browser checks
npm run build      # TypeScript and production bundle
npm run ci         # check, unit tests, and build
```

Install Playwright's Chromium once before the end-to-end checks when it is not already available:

```sh
npx playwright install chromium
```

## Architecture and integration boundary

`src/state.ts` owns the typed workspace, agent, activity, and terminal state transitions.

The React interface dispatches domain actions rather than mutating fixtures inside components.

The included data is deterministic so the front end can run and be reviewed without a native daemon.

A production connection should translate herdr socket or browser-bridge snapshots and events into the same state actions.

The browser does not connect directly to herdr's native Unix socket, and this repository does not invent an authentication or network transport contract that the upstream server does not currently provide.
