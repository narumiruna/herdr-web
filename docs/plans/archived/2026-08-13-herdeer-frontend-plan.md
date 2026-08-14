## Goal

Build a polished, responsive web front end for herdr that preserves its core workspace, agent-state, terminal, and intervention workflows while using Radix Colors, Icons, Themes, and Primitives.

## Context

The upstream herdr product is a persistent runtime for coding-agent terminals.
Its critical workflow is finding agents that are working, blocked, or idle, opening the relevant terminal, and responding without hunting through sessions.
The current repository is a minimal TypeScript template with no browser application.

## Architecture

Use a Vite React single-page application with typed in-memory demo data.
Keep state transitions in a reducer so the UI can later be connected to herdr's socket/API without coupling domain behavior to presentation.
Use a responsive three-region shell: workspace navigation, focused terminal session, and contextual activity/attention rail.

## Tech Stack

- React and TypeScript built by Vite.
- Radix Themes for the component system.
- Radix Colors for semantic palette tokens.
- Radix Icons for interface iconography.
- Radix Dialog, Scroll Area, Separator, and Tooltip primitives for accessible interactions.
- Vitest, Testing Library, and jsdom for behavior tests.

## Non-Goals

- Implementing or modifying the native herdr Rust server.
- Providing a production authentication or network transport layer without a browser-accessible backend contract.
- Emulating a full PTY in the demo front end.

## Plan

- [x] Inspect the starter repository and upstream herdr product to identify its core information and workflows; verified from the local repository, upstream `README.md`, `assets/screenshot.png`, and UI source.
- [x] Replace the Node template with a Vite React foundation and install the specified Radix packages; verified by the successful TypeScript and Vite production build in `npm run build`.
- [x] Define typed herdr demo state and reducer behavior with tests written before implementation for workspace selection, agent intervention, session creation, and pane splitting; verified by 5 passing tests in `npm test -- tests/state.test.ts` after an initial missing-module failure.
- [x] Implement the responsive herdr interface using Radix Colors, Icons, Themes, and Primitives, including navigation, terminal panes, blocked-agent response, command palette, appearance control, and session creation; verified by 5 Testing Library interaction tests.
- [x] Finish accessibility, responsive, empty/error-safe, reduced-motion, and visual details; verified by semantic unit queries, two passing Playwright flows, no horizontal overflow at 1536×960 or 390×844, and inspected desktop/mobile screenshots.
- [x] Update project documentation and automation for the browser app; verified by the updated `README.md`, `justfile`, package scripts, and successful `npm run ci`.

## Risks

- A static browser demo cannot attach directly to herdr's native Unix socket; the state layer is kept transport-agnostic for a future browser bridge.
- Dense terminal content can overwhelm narrow screens; mobile uses a focused-session layout with navigation and activity in accessible dialogs.

## Completion Checklist

- [x] The browser app renders the herdr workspace and agent-runtime experience using all four requested Radix families, verified by static imports for Colors, Icons, Themes, and five Primitive packages plus a successful production build.
- [x] Core workflows are interactive and covered by deterministic tests, verified by 10 passing tests in `npm test`.
- [x] Desktop and mobile layouts are usable with visible focus, reduced-motion support, and labeled controls, verified by two passing Playwright tests and inspected 1536×960 and 390×844 screenshots.
- [x] Formatting, tests, and production build all pass via `npm run ci`.
- [x] Setup, commands, scope, and integration boundary are documented in `README.md`.
