# Bare herdr-web Launch Plan

## Goal

Make `herdr-web` start only the web workbench without focusing or creating a Herdr workspace, while preserving explicit directory behavior for `herdr-web .` and `herdr-web <directory>`.

## Context

`scripts/herdr-web.mjs` currently replaces a missing directory argument with `process.cwd()`, then reads the Herdr snapshot and focuses or creates a workspace before starting `just run`.

`tests/cli.test.ts` explicitly protects that old default, while the CLI help describes the current directory as the default.

The existing `startWeb()` path can already launch the workbench independently of workspace selection.

## Non-Goals

- Do not change how explicit directories are canonicalized, validated, matched, focused, or created.
- Do not change `just run`, browser workspace selection, or Herdr itself.

## Risks

- This intentionally changes a public CLI default, so help text and README examples must clearly distinguish bare and explicit-directory invocations.
- The bare command must not request a Herdr snapshot as a side effect; otherwise it would still couple startup to directory-selection logic and Herdr CLI availability earlier than necessary.

## Plan

- [x] Update `tests/cli.test.ts` so a bare `herdr-web` invocation expects only `just run`, while `herdr-web .` expects the current directory to be canonicalized and focused or created through Herdr; the pre-implementation focused run failed only the new bare-command regression, and the implemented suite passes all 7 tests with `npm test -- tests/cli.test.ts`.
- [x] Refactor `scripts/herdr-web.mjs` so workspace lookup and mutation run only when a directory argument is present, and the no-argument path calls `startWeb()` directly; all 7 explicit-path, invalid-path, help, startup-failure, and bare-startup tests pass with `npm test -- tests/cli.test.ts`.
- [x] Revise the help text in `scripts/herdr-web.mjs` and the Project-directory CLI section in `README.md` to document `herdr-web` as workbench-only startup and `herdr-web .` or `herdr-web <directory>` as workspace-opening startup; the required `rg` check finds no active current-directory default claim.
- [x] Run the repository checks to confirm formatting, package contents, tests, and build output remain valid; `npm run ci` passed Biome over 75 files, package validation over 51 packed files, all 138 unit tests, and the production build, while `npm run test:e2e` passed all 17 browser tests.

## Rollback / Recovery

Restore the missing-argument fallback to `process.cwd()` together with its prior tests and documentation if the new default must be reverted.

No data migration or cleanup is required because the change only prevents implicit workspace focus or creation.

## Completion Checklist

- [x] `herdr-web` starts `just run` without invoking `herdr` or deriving a workspace from the shell's current directory, verified by exact fake-command invocation assertions.
- [x] `herdr-web .` continues to focus or create a workspace for the canonical current directory before starting the web workbench, verified by the focused CLI suite.
- [x] `herdr-web <directory>`, invalid-directory handling, `--help`, and bare startup failure remain covered by 7 passing CLI tests.
- [x] CLI help and `README.md` describe the new distinction consistently, with no active current-directory default claim found by the planned search.
- [x] Focused CLI tests, Biome, package validation, all 138 unit tests, the production build, and all 17 browser tests pass.
