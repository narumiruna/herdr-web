# Central herdr-web Data Home Plan

## Goal

Store all new herdr-web file data under `$HOME/.herdr-web/` without changing Herdr's upstream configuration, socket, protocol, API, or resources.

## Architecture

- `$HOME/.herdr-web/uploads/` stores remote image uploads from every project using collision-resistant filenames.
- `$HOME/.herdr-web/runtime/` stores Docker helper PID files and logs, with a checkout-local pointer so `just down` can find a custom active home.
- `HERDR_WEB_HOME` optionally overrides the product data home and defaults to `$HOME/.herdr-web`.
- Docker bind-mounts the product data home at the same absolute host and container path so Herdr Agents can read inserted attachment paths.
- `HERDR_*` variables and `$HOME/.config/herdr/` remain owned by upstream Herdr and unchanged.

## Risks

- A narrowed Docker project mount no longer includes uploads automatically, so the product data home needs its own bind mount.
- Existing project-local uploads are user data and must remain untouched.
- Existing checkout-local runtime helpers must be stopped during the transition so no proxy process is orphaned.

## Rollback / Recovery

- Revert the focused migration commit to restore project-local uploads and checkout-local runtime files.
- Do not delete old uploads during rollback or migration.
- Stop stale helpers with `just down` before or after updating.

## Plan

- [x] Update image storage and service wiring to use `$HOME/.herdr-web/uploads/`; 13 service tests verify central paths, file contents, `0700`/`0600` modes, project-root authorization, and no project-local writes.
- [x] Update `justfile` and `compose.yaml` to use `$HOME/.herdr-web/runtime/`, remember the active custom home for shutdown, and same-path Docker mounting; Just parsing, default and custom Compose rendering, and relative-path rejection pass.
- [x] Update UI copy, test fixtures, README, and relevant archived design records for the centralized structure while preserving all upstream Herdr paths.
- [x] Run focused tests, repository CI, browser tests, package checks, and final data-path scans; 53 focused tests, 136 repository tests, both builds, 17 Chromium tests, and package inspection pass.

## Completion Checklist

- [x] New uploads resolve under `$HOME/.herdr-web/uploads/` by default.
- [x] Docker helper state resolves under `$HOME/.herdr-web/runtime/` by default.
- [x] Docker exposes the product data home at the same absolute path.
- [x] Existing project-local data is not modified or staged.
- [x] Herdr-owned paths and environment variables remain unchanged.
- [x] All required checks pass and the diff contains only the centralized-data migration.
