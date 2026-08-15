# herdr-web Package Rename Plan

## Goal

Publish the application as the public npm package `herdr-web` and expose the installed CLI as `herdr-web`.

## Non-Goals

The upstream `herdr` executable and API names remain unchanged.

The herdr-web product UI, `HERDR_WEB_*` configuration, `.herdr-web` runtime directories, GitHub repository URL, and GHCR image remain unchanged because they are not npm or CLI identifiers.

## Plan

- [x] Rename the npm package, executable mapping, CLI entry file, help text, and CLI tests to `herdr-web`; `package-lock.json` and all 5 CLI tests match.
- [x] Update package validation, README installation instructions, and local command examples to `herdr-web`; active-file search found no obsolete package or CLI identifiers.
- [x] Change release automation from GitHub Packages to the public npm registry and use `PAT_TOKEN`; workflow and package metadata now target `https://registry.npmjs.org`.
- [x] Run package inspection and repository CI; `npm run check:package`, `npm pack --dry-run --ignore-scripts`, and `npm run ci` passed.

## Completion Checklist

- [x] `package.json` and `package-lock.json` identify `herdr-web@0.1.0`.
- [x] `npm pack --dry-run --ignore-scripts` exposes the `herdr-web` executable and includes `scripts/herdr-web.mjs` among 45 files.
- [x] Public npm publication references use `herdr-web` and `https://registry.npmjs.org`.
- [x] `npm run ci` passes with 14 test files, 100 tests, and both production builds.
