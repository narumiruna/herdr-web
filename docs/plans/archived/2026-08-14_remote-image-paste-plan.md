## Goal

Allow a remote browser user to paste, drag, or choose an image in the active Agent composer, store it on the Herdr host, and submit a prompt containing the resulting local image path.

## Architecture

The browser stages one validated image with a compact preview.

On send, the authenticated bridge accepts bounded binary image data, verifies its signature, resolves the target pane working directory through `pane.get`, writes a random file under `.herdeer/uploads`, and then submits the text prompt with that path.

Docker will bind-mount a configurable project root at the same absolute path so the container and host Agent see the same file.

## Plan

- [x] Add failing service, HTTP, and live UI tests for image storage, authenticated binary upload, image-only prompts, and invalid input; targeted Vitest produced six expected failures before implementation.
- [x] Implement bounded image validation and pane-relative storage in the bridge; 12 targeted service and HTTP tests pass.
- [x] Add browser upload APIs, runtime prompt composition, and a progressively disclosed Radix composer attachment UI supporting paste, drag/drop, file choice, preview, replacement, and removal; nine targeted live and demo component tests pass.
- [x] Make Docker project paths available at identical host/container locations and document local, CLI, and Docker usage plus security and cleanup behavior; Compose inspection, image build, and a live container upload proved host path, bytes, and UID/GID consistency.
- [x] Run complete quality gates, archive this plan, and audit the worktree; `npm run ci` passed 35 tests and both builds, four Playwright tests passed, audit and diff checks passed, imports are static, and all source files remain under 1,000 lines.

## Risks

- Uploaded bytes are untrusted, so both content length and file signatures must be checked before disk writes.
- A pane may report a stale or container-inaccessible directory, so storage must fail clearly without prompting the Agent.
- Uploading inside a project can create untracked files, so the hidden destination and cleanup expectations must be documented.

## Completion Checklist

- [x] Pasting, dropping, or choosing PNG, JPEG, GIF, or WebP queues one visible attachment and text paste remains unchanged, proven by component and Playwright tests.
- [x] Sending an image writes verified bytes under the selected pane directory and prompts the Agent with the absolute path, proven by service, HTTP, live app, and Playwright tests.
- [x] Empty, unsupported, spoofed, and over-8 MiB images are rejected before storage or prompting, proven by service and HTTP tests.
- [x] Local and Docker workflows expose the same host-readable project path, proven by Compose inspection and a live container upload with byte and host ownership checks.
- [x] All repository quality gates pass with no known required work remaining.
