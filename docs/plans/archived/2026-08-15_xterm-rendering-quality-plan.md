# xterm Rendering Quality Plan

## Goal

Make the interactive xterm surface render Herdr's box-drawing lines, Powerline separators, Nerd Font symbols, CJK text, and terminal colors cleanly while preserving terminal protocol behavior, accessibility, image paste, and resize ownership.

## Context

- The supplied 1724×126 capture shows visible gaps in long box-drawing lines, dense 13 px text, and uneven symbol alignment around the Herdr status bar.
- `InteractiveTerminal.tsx` currently uses xterm.js 6 with Fit and Search addons, JetBrains Mono followed by Symbols Nerd Font Mono, a fixed 13 px size, and the default renderer.
- `customGlyphs` is currently implicit, font readiness is not coordinated with the first fit, and each `ResizeObserver` callback can trigger an immediate fit and terminal resize message.
- The real-browser terminal harness already covers clipboard behavior and can provide deterministic ANSI, box-drawing, Powerline, Nerd Font, CJK, and Emoji rendering fixtures.

## Architecture

- Keep terminal rendering and presentation in the browser; do not change Herdr, the WebSocket message schema, control versus observe ownership, or server-side terminal dimensions.
- Add a small renderer lifecycle helper so optional WebGL initialization, Unicode selection, context-loss fallback, and disposal do not further expand `InteractiveTerminal.tsx`.
- Keep the built-in renderer as the guaranteed fallback and lazy-load WebGL only after xterm opens.
- Wait for the bundled terminal fonts before the authoritative fit, then coalesce subsequent fit work to one animation frame and send only changed dimensions.
- Store terminal font size under the existing `herdr-web-*` browser-storage namespace and keep 13 px as the migration-safe default.

## Tech Stack

- `@xterm/xterm` 6 with `@xterm/addon-webgl` 0.19 and `@xterm/addon-unicode11` 0.9 when compatibility checks pass.
- React, the existing Radix settings dialog, product-storage helpers, Vitest, and the Playwright terminal harness.

## Non-Goals

- Do not modify Herdr's TUI theme, layout, status content, protocol, socket, or resize owner.
- Do not add terminal ligatures, remote font downloads, arbitrary font-family input, or Docker-specific rendering behavior.
- Do not replace xterm.js or make WebGL a hard requirement.

## Risks

- WebGL can fail or lose its context on unsupported, virtualized, or memory-constrained browsers, so failure must silently retain a usable built-in renderer.
- A Unicode width table that differs from Herdr can shift status segments, so Unicode 11 must be enabled only after width-parity fixtures pass.
- Forced contrast correction can distort intentional ANSI status-bar colors, so the explicit palette must improve readability without rewriting full-cell application colors.
- Font-size changes alter columns and rows, so fitting must preserve the existing single control owner and avoid resize storms.
- Pixel-level rendering differs by device scale factor, so visual checks use bounded continuity and geometry assertions instead of a fragile full-screen golden image.
- The DPR 1 fixture verifies WebGL pixels, while the DPR 2 fixture verifies the real context-loss fallback because headless Chromium does not retain its emulated high-DPI WebGL framebuffer for deterministic screenshots; both paths validate Unicode and font readiness before rendering.

## Plan

- [x] Extend `e2e/terminal-harness.tsx` with a deterministic rendering frame containing box-drawing lines, Powerline separators, Nerd Font symbols, ANSI normal/bright colors, CJK, combining text, and Emoji; the Chromium fixture passes at device scale factors 1 and 2.
- [x] Add `@xterm/addon-webgl` and `@xterm/addon-unicode11` to `package.json` and `package-lock.json`, then add a focused renderer lifecycle module that lazy-loads addons, activates Unicode after width-parity validation, disposes every addon once, and falls back after initialization failure or WebGL context loss; dedicated lifecycle and width tests pass.
- [x] Update xterm construction in `src/components/InteractiveTerminal.tsx` to explicitly enable custom box glyphs, stable normal/bold weights, an inactive cursor, readable selection colors, smooth local scrollback, and a complete dark ANSI palette without changing input, paste, observe, or control behavior; interactive-terminal option assertions pass.
- [x] Coordinate bundled JetBrains Mono and Symbols Nerd Font readiness with the first authoritative fit, and add bounded fallback behavior when `document.fonts` is unavailable or rejects; unit and browser startup checks pass.
- [x] Replace direct ResizeObserver fitting with animation-frame coalescing, suppress duplicate dimensions, and perform one final fit after font or font-size changes while leaving Herdr resize ownership and WebSocket message types unchanged; browser resize bursts emit one final changed geometry.
- [x] Add terminal text-size presets and `Cmd/Ctrl +`, `Cmd/Ctrl -`, and `Cmd/Ctrl 0` handling through the existing Settings and Keybindings surfaces, clamp supported sizes, persist the value with product-storage helpers, and return focus to xterm after a shortcut; default, persistence, reset, bounds, focus, repeated-key, and browser-zoom tests pass.
- [x] Add `e2e/terminal-rendering.e2e.ts` checks for font availability, continuous box lines, aligned Powerline/Nerd symbols, stable CJK/Emoji cell geometry, no horizontal overflow, resize stability, WebGL-or-fallback readiness, and readable dark colors at device scale factors 1 and 2; all checks pass and screenshots remain failure artifacts.
- [x] Re-run `e2e/terminal-clipboard.e2e.ts` and interactive-terminal unit tests to prove repeated image paste, multi-image paste, text paste, search, selection copy, observe mode, reconnect, and control takeover remain unchanged; 4 focused browser tests and 66 focused unit/component tests pass.
- [x] Update `README.md` with renderer fallback behavior, terminal text-size controls, shortcuts, and the supported bundled fonts without implying that upstream Herdr settings changed.
- [x] Run `npm run ci`, `npm run test:e2e`, `npm run check:package`, and `git diff --check`, then inspect the production bundle for lazy WebGL chunking and compare the final Chromium rendering against the supplied Herdr status-bar capture; 149 unit/component tests, 20 browser tests, both builds, package inspection, lazy addon chunks, and the visual comparison pass.

## Completion Checklist

- [x] Long box-drawing lines have no per-cell gaps at device scale factors 1 and 2.
- [x] Powerline, Nerd Font, CJK, combining, and Emoji fixtures retain expected cell alignment.
- [x] WebGL improves supported browsers and every unsupported or lost-context path remains usable through the built-in renderer.
- [x] Font loading, pane dragging, and text-size changes do not create resize storms, stale dimensions, clipping, or disruptive layout shifts.
- [x] Terminal font size is keyboard-accessible, persisted, bounded, resettable, and exposed in the existing Settings and Keybindings surfaces.
- [x] Screen-reader mode, keyboard focus, input, text and image paste, search, selection copy, reconnect, observe mode, and control ownership still pass regression coverage.
- [x] Herdr APIs, settings, protocol, and terminal resize ownership are unchanged.
- [x] Documentation and all repository checks pass, and the final diff contains no unrelated changes.
