# Repository guidance

## Documentation

- Use herdr-web for this tool's product, package, CLI, and app-owned configuration; reserve Herdr for the upstream runtime, protocol, socket, API integration, and Herdr-owned resources.

## Code style

- Keep imports static and top-level; never use inline or dynamic imports.

## Commands

- In `just` recipes, use `$(...)` and `$name`, not Make-style doubled dollar signs.

## Herdr integration

- Send `recent_unwrapped` as the `pane.read` source over the socket, not the CLI spelling `recent-unwrapped`.
- Bind-mount `HERDR_PROJECTS_ROOT` at the same absolute path and run Docker with the host UID/GID so host-side Agents can read uploaded images.
- Map `snapshot.agents` as detected Agents and add only tabs without an Agent as standalone Terminals; do not count every pane as an Agent.

## Testing

- Compare `realpath`-canonicalized paths in CLI tests because macOS temporary-directory paths can differ between `/var` and `/private/var`.

## Repository structure

- [UNREVIEWED] Keep the published `herdr-web` package, CLI, bridge, browser sources, and tests in `apps/web/`; use the private root npm workspace and root `package-lock.json` for development.
- [UNREVIEWED] Run repository checks from the root (`npm run ci`, `npm run test:e2e`), but pack, version, and publish only the `apps/web` workspace; never publish the private root package.

## Workbench UI

- Use an H monogram with a terminal cursor for the herdr-web brand mark.
- Keep the workbench terminal-first; use one compact navigation rail and disclose runtime details on demand.
- Keep navigation, terminal output, composer, and dialogs in the same light or dark appearance.
- Show Herdr tabs and Agent status in a tab bar; keep the sidebar focused on workspaces and cross-workspace attention.
- Prefer the current working directory over a duplicated large session title.
- Use amber for Needs input, blue for Working, green for Done, and reserve red for failures and destructive actions.
- Preserve Agent drafts across all in-app navigation and never present an unknown mutation result as a safe automatic retry.
- Keep mobile supervision focused on navigation, search, and the terminal; move lower-frequency actions into one shallow action sheet.
- Listen for image paste on `window` and inspect both clipboard files and items so image attachment works outside the message field while leaving text paste untouched.
- Keep each pane pinned to the bottom as terminal output grows until the user intentionally scrolls back; Radix scroll areas do not follow growing content automatically.
- Use the bundled JetBrainsMono Nerd Font Mono for terminals and output previews so Nerd Font private-use glyphs render correctly.
