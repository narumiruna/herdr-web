# Image Upload Reliability Plan

## Goal

Make image uploads complete faster on multi-image batches and recover safely from slow or transient network failures without creating duplicate host files.

## Context

- Every API request currently times out after 15 seconds, including images up to 8 MiB.
- Interactive terminal batches upload up to eight images sequentially.
- Failed items can be retried manually, but a retry can create a duplicate file when the first response was lost after the server wrote the image.

## Architecture

- `src/herdr-api.ts` owns a longer image-specific timeout, bounded transient retries, and one stable upload ID per `File` object.
- `server/http-app.ts`, `server/herdr-service.ts`, and `server/image-upload.ts` carry the upload ID to idempotent storage.
- Idempotent paths combine the opaque upload ID with a content digest; atomic publication prevents retries from observing partial files.
- `src/components/use-terminal-images.ts` uploads at most three images concurrently while preserving queue order for final path insertion.

## Non-Goals

- Do not add image compression or alter uploaded bytes.
- Do not increase the 8 MiB per-image or eight-image per-batch limits.
- Do not press Enter after inserting paths or change terminal control behavior.
- Do not automatically delete uploaded files.

## Risks

- Parallel uploads can saturate slow links, so concurrency remains bounded at three.
- Automatic retries are bounded and reuse an idempotency key; permanent client errors still fail immediately.
- Legacy callers without an upload ID retain random-path behavior.

## Plan

- [x] Add focused tests for stable upload IDs, extended timeout, bounded transient retry, and server-side idempotent writes; 81 focused tests pass across the API, HTTP, service, terminal, and queue suites.
- [x] Add focused terminal tests for bounded parallel upload and ordered insertion; the focused terminal suite verifies a peak of three requests and original-order output.
- [x] Implement reliable client/server upload transport and bounded terminal batch concurrency in `src/herdr-api.ts`, `server/image-upload.ts`, and `src/components/use-terminal-images.ts`.
- [x] Update `README.md`, align the split-terminal image test with its read-only `Watching` state, and pass formatting, full test, build, browser, and whitespace checks.

## Completion Checklist

- [x] Slow image requests receive a 120-second image-specific timeout.
- [x] Transient failures retry automatically with the same upload ID, while a test confirms permanent HTTP 400 responses do not retry.
- [x] Repeating an acknowledged or uncertain upload ID returns one host path without duplicate files; the service test verifies one directory entry.
- [x] Multi-image batches upload with at most three concurrent requests and insert paths in original order.
- [x] Focused tests (81), `npm run check`, full `npm test` (238), `npm run build`, image Playwright tests (2), and `git diff --check` pass.
- [x] Archive this completed plan with verification evidence.
