## GOTCHA

- Symptom: a `just` shell assignment fails near `(`. Cause: `just` recipes pass `$` directly, unlike Make. Fix: use `$(...)` and `$name`, not doubled dollar signs.

## TASTE

- Keep imports static and top-level; never use inline or dynamic imports.
