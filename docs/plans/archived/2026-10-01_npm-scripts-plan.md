# Consolidate npm commands

## Goal

Replace both `justfile` files with npm commands without duplicate aliases.

## Plan

- [x] Compare both recipe lists with the root and web workspace npm scripts.
- [x] Merge authenticated development startup into `dev` and production startup into `preview`; startup, CLI, and preview tests pass. Preview handles the bridge port override consistently. Launcher signals are forwarded, and listeners are removed after child failure or exit.
- [x] Move Docker startup and shutdown into one repository script; `sh -n` and 11 isolated Docker/proxy tests pass, including malformed protocol, failed status, and missing project/socket paths.
- [x] Add root `docker:up`, `docker:down`, `check:fix`, and `link:cli`; both justfiles are deleted, and documentation, UI messages, and package checks use npm.
- [x] Complete final validation: `npm run ci` passes with 420 tests, package inspection, build, and font checks; 54 focused tests and `git diff --check` pass. Launcher-only SIGTERM smoke checks confirm generated credentials, printed URLs, HTTP 200 pages, bridge health, and server shutdown using temporary data homes and explicit unused ports. GitHub CI run [39807351727](https://github.com/narumiruna/herdr-web/actions/runs/39807351727) verifies implementation commit `306bfa9`: Linux repository checks pass, Linux and macOS each pass all 109 browser tests, and the Windows startup job passes.

## Completion Checklist

- [x] Each recipe has an npm equivalent or uses a built-in npm command (`npm install`, `npm run`); no `run`, `e2e`, or installation aliases are added.
- [x] Current setup instructions do not require Just; existing archived plans and historical roadmap references remain unchanged.
- [x] Checks pass without starting or stopping the user's Docker containers or Herdr resources; Docker tests use temporary checkouts, mock executables, and mock proxies.

## Review and Validation Limits

- Source review covers correctness, security boundaries, process lifecycle, compatibility, regressions, and scope. The launcher signal issue found during review is fixed and tested.
- The default local browser command reused another worktree's server and failed. That service was not stopped. An isolated local run had 84 passes, two theme timeouts, one interruption, and 22 tests not run; a focused contrast retry also timed out. Clean Linux and macOS CI then passed the unchanged full browser suites. Temporary configurations are removed and are not part of the change.
- One local pre-commit attempt had two test failures. Both files passed a focused rerun (58 tests), and the normal hook passed on retry; no hook was bypassed.
- Native Windows execution is not run locally; the Windows CI build and startup-contract tests pass. Real Docker operations and global CLI linking are not run. Docker and npm failure paths use isolated mocks. Existing Docker signal/down-failure behavior and IPv4-versus-wildcard port probing are unchanged.
- Biome reports 45 existing CSS warnings; the checks pass. No packages, version tags, or release workflows are published.

## Rollback / Recovery

The migration changes repository commands only. Restore the changed files from Git to recover the previous commands; no production data migration is required.
