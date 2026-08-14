## GOTCHA

- Symptom: a `just` shell assignment fails near `(`. Cause: `just` recipes pass `$` directly, unlike Make. Fix: use `$(...)` and `$name`, not doubled dollar signs.
- Symptom: raw `pane.read` closes without a response when given `recent-unwrapped`. Cause: the CLI spelling differs from the protocol enum. Fix: send `recent_unwrapped` over the socket.
- Symptom: CLI path tests differ between `/var` and `/private/var` on macOS. Cause: temporary-directory paths cross a system symlink. Fix: compare `realpath`-canonicalized paths.

## TASTE

- Keep imports static and top-level; never use inline or dynamic imports.
