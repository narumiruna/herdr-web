## Goal

Provide an installable `hedr [directory]` command that focuses or creates a Herdr workspace for the directory and then starts the authenticated web workbench.

## Architecture

The dependency-free Node CLI will validate and canonicalize the directory, inspect the live Herdr snapshot, focus an existing matching workspace or create one, and delegate web startup to the existing `just run` workflow.

## Plan

- [x] Add isolated CLI tests for new directories, existing workspaces, help, and invalid paths; verified all five tests failed before implementation and passed afterward with `npm test -- tests/cli.test.ts`.
- [x] Add the executable CLI and package `bin` entry while preserving argument boundaries and surfacing external-command failures; verified by the five passing targeted CLI tests.
- [x] Document installation and usage, then install the linked command and run non-mutating help and invalid-path smoke tests; `just install-cli`, `hedr --help`, and invalid-path rejection all succeeded.
- [x] Run the complete repository quality gates and archive this plan; `npm run ci` passed 28 tests and both builds, `npm run test:e2e` passed 3 browser tests, and `git diff --check` passed.

## Risks

- Repeated invocations could create duplicate workspaces, so exact canonical pane working-directory matches must focus the existing workspace.
- The CLI controls a live Herdr server, so automated tests must replace `herdr` and `just` with isolated fakes.

## Completion Checklist

- [x] `hedr /path/to/project` creates or focuses the correct Herdr workspace, proven by five deterministic CLI tests.
- [x] The command starts the existing token-protected web workflow from the repository root, proven by the fake-command invocation log.
- [x] Installation and prerequisites are documented in `README.md` and `hedr --help`, verified through the globally linked command.
- [x] Formatting, 28 unit tests, browser and server builds, 3 browser tests, package-bin inspection, audit, and diff checks all pass.
