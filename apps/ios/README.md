# herdr-web for iPhone (v1)

A native SwiftUI supervisor for your own herdr-web bridge. It reads workspaces, tabs, detected Agents, and bounded recent output; a controller can send a text prompt to a detected Agent. It does not embed the web app or connect directly to the Herdr socket.

## Build and test

Install full Xcode with an iOS Simulator runtime (iOS 17 or later). The project and shared scheme are committed; XcodeGen is only needed to regenerate after changing `project.yml` (`cd apps/ios && xcodegen generate`). On machines with Command Line Tools selected, set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for each command or select Xcode with `xcode-select`.

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/ios/HerdrWeb.xcodeproj -scheme HerdrWeb -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project apps/ios/HerdrWeb.xcodeproj -scheme HerdrWeb -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test
```

Use any available iPhone Simulator name in place of `iPhone 17 Pro`. The build needs no signing; the tests use local ad-hoc signing (`-`) because iOS Keychain calls fail with status -34018 in an unsigned Simulator app. No Apple team or provisioning profile is required. The bundle identifier is a development namespace, **not** an App Store identity or provisioning claim. Physical-device signing, testing, and distribution remain separate work.

## Connect

Start Herdr and a herdr-web bridge from the repository root. `just run` starts a development bridge on `127.0.0.1:$BRIDGE_PORT` (default 8787) and a Vite proxy on `$VITE_PORT` (default 5173) bound to the LAN. For a direct bridge endpoint on a trusted LAN, use `BRIDGE_HOST=0.0.0.0 HERDR_WEB_TOKEN=<random-secret> PORT=8787 npm start` after `npm run build`, or `just preview` for a loopback-only bridge. Place a trusted HTTPS reverse proxy in front before connecting over an untrusted network. Proxy `/api/herdr/state`, `/api/herdr/events`, and `/api/herdr/agents/.../prompt` to the bridge without rewriting Authorization, and allow long-lived NDJSON responses without buffering. Do not put a token in the URL. The browser's `/?token=...` link is **not** the native app endpoint: enter only the bridge origin and the token separately.

The app accepts HTTPS with a system-trusted certificate. For explicit development use, turn on **Allow local HTTP** and enter `http://localhost:8787` (Simulator only; localhost on an iPhone is the phone) or a `.local` hostname reachable on the local network. Arbitrary LAN IP addresses over HTTP are rejected; use HTTPS with trusted certificates for them. Apple's ATS local-network exception applies only to local networking; there is no global insecure transport or certificate bypass. Grant Local Network permission on the device if asked. Treat controller and viewer tokens as passwords. The controller token is stored in the device-only Keychain after a successful state response; only the bridge URL and the local-HTTP choice are in preferences. Disconnect removes both. The viewer token (if configured with `HERDR_WEB_VIEW_TOKEN` or an active viewer share) displays read-only state; the bridge also enforces 403 for mutations. Changing connection is not available while a prompt is in flight.

## Scope and limitations

Navigation is workspace → tab → Agent/Terminal → read-only recent output. Agent detection comes from `snapshot.agents`; tabs without one have a standalone Terminal. When streaming is enabled, only Agent previews may be supplied; otherwise the bridge includes bounded pane reads. Missing or truncated output is not an interactive terminal. The app reconnects with capped exponential backoff only in the foreground, supports pull-to-refresh, and never automatically resends a prompt. On Herdr protocol 20+, a blocked Agent requires a terminal reply and cannot receive a prompt through this endpoint; the composer is disabled for that state. A timeout or connection loss after submitting a prompt has an **unknown result**; inspect the Agent before sending another. Drafts survive in-app navigation but are cleared when disconnecting or switching bridge; they are not persisted to disk.

Not included: interactive terminal/WebSocket, pane or tab mutations, image upload, Web Push, background streaming, Android. For a physical device, set up trusted HTTPS, provisioning/signing, LAN reachability, and a device smoke test before distribution.

The bundled regular JetBrainsMono Nerd Font Mono TTF (2.43 MiB, 12,226 mappings) was converted without subsetting from the verified v3.5.1 WOFF2 under `apps/web/public/fonts/`. Its PostScript name is `JetBrainsMonoNFM-Regular`; test glyphs include `\ue0b0`, `\uf489`, and `\U000f02a2`. Copyright and redistribution terms are in `Resources/JETBRAINS-MONO-OFL.txt`, `Resources/NERD-FONTS-LICENSE.txt`, and `Resources/JETBRAINS-MONO-NERD-FONTS-README.md` (also bundled for redistribution). See `apps/web/public/fonts/README.md` for original ZIP checksum and upstream provenance.
