# herdr-web Brand Migration Plan

## Goal

Use `herdr-web` consistently for this product, including release titles, UI copy, code identifiers, configuration, browser storage, runtime paths, tests, and historical repository documentation, while retaining `Herdr` only for the upstream runtime and API.

## Context

- Release `v0.1.2` was titled with the retired product name.
- The same publish run authenticated through npm Trusted Publishing but provenance rejected the stale pre-move repository URL.
- Product-owned environment variables, browser keys, runtime directories, service names, CSS classes, source identifiers, and archived artifacts still use the retired identifier.
- Existing local upload data is user-owned and must not be deleted during the repository migration.

## Architecture

- Product-owned identifiers use `herdr-web`, `HerdrWeb`, or `HERDR_WEB` according to their syntax.
- Upstream executable, protocol, API, socket, and runtime references remain `herdr`, `Herdr`, or `HERDR`.
- New uploads use `$HOME/.herdr-web/uploads`, while old project-local upload directories remain untouched and ignored as compatibility-only data.
- Browser preferences migrate once from legacy keys to `herdr-web-*` keys without exposing the retired brand in the interface.

## Risks

- Renamed product environment variables are a configuration migration; README examples must provide the new names.
- Renamed Docker service and runtime paths can leave an older local process running; users should stop the current checkout before updating.
- Moving source and test files requires every import and package-content assertion to follow the new path.
- Tag `v0.1.2` remains historical after its failed publication and removed release; future releases must use `herdr-web X.Y.Z`.

## Rollback / Recovery

- Revert the focused migration commit to restore repository identifiers.
- Do not remove or rewrite existing local upload files during rollback.
- If a renamed configuration prevents startup, rename product-owned variables to the documented `HERDR_WEB_*` form and restart.

## Plan

- [x] Rename product source files, symbols, visible copy, CSS classes, browser keys, request identifiers, and tests to `herdr-web`; 77 focused client, storage, upload, and bridge tests pass.
- [x] Rename product environment variables, Docker service, runtime paths, and upload directory while preserving upstream Herdr names; Docker Compose validation, `just` parsing, production startup, and upload tests pass.
- [x] Update release, publish, package provenance, README, memory, roadmaps, and archived plans so tracked content and paths contain no retired identifier; case-insensitive tracked-content, tracked-path, and working-source scans pass.
- [x] Run package validation, actionlint, unit/integration tests, browser tests, and production builds; 136 tests, both builds, 17 Chromium tests, package metadata inspection, workflow parsing, and actionlint pass.

## Completion Checklist

- [x] Future GitHub Release titles and publication summaries use `herdr-web X.Y.Z`.
- [x] npm provenance metadata targets `narumiruna/herdr-web`.
- [x] Product configuration and runtime identifiers use `HERDR_WEB_*` and `.herdr-web*`, while upstream `HERDR_*` names remain unchanged.
- [x] Existing local upload data is not modified or staged; its compatibility ignore remains in `.gitignore`.
- [x] A case-insensitive retired-identifier scan of tracked content and paths returns no matches.
- [x] All repository-required checks pass; final explicit staging is performed immediately before commit.
