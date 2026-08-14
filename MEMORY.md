## GOTCHA

- Symptom: a `just` shell assignment fails near `(`. Cause: `just` recipes pass `$` directly, unlike Make. Fix: use `$(...)` and `$name`, not doubled dollar signs.
- Symptom: raw `pane.read` closes without a response when given `recent-unwrapped`. Cause: the CLI spelling differs from the protocol enum. Fix: send `recent_unwrapped` over the socket.
- Symptom: CLI path tests differ between `/var` and `/private/var` on macOS. Cause: temporary-directory paths cross a system symlink. Fix: compare `realpath`-canonicalized paths.
- Symptom: an Agent cannot read an image uploaded inside Docker. Cause: container-only paths and ownership differ from the Herdr host. Fix: bind-mount `HERDR_PROJECTS_ROOT` at the same absolute path and run with the host UID/GID.
- Symptom: `Ctrl+V` or `Cmd+V` only attaches an image when the message field is focused. Cause: the paste handler is scoped to the textarea. Fix: listen for image paste on `window` and inspect both clipboard files and items while leaving text paste untouched.
- Symptom: the live UI reports more Agents than Herdr. Cause: mapping every pane as an Agent also counts split and standalone shells. Fix: map `snapshot.agents` as detected Agents and add only tabs without an Agent as standalone Terminals.
- Symptom: new terminal output appears below the visible viewport. Cause: the Radix scroll area does not follow growing content automatically. Fix: keep each pane pinned to the bottom until the user intentionally scrolls back.
- Symptom: terminal status lines show empty boxes instead of Nerd Font icons. Cause: IBM Plex Mono does not include Nerd Font private-use glyphs. Fix: bundle Symbols Nerd Font Mono as the terminal fallback font.

## TASTE

- Keep imports static and top-level; never use inline or dynamic imports.
- Keep the workbench terminal-first; use one compact navigation rail and disclose runtime details on demand.
- Keep navigation, terminal output, composer, and dialogs in the same light or dark appearance.
