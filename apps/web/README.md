# herdr-web

Browser workbench and authenticated bridge for [Herdr](https://github.com/herdrdev/herdr).

Requires Node.js 22+ and a running Herdr server. Install and launch the CLI:

```sh
npm install --global herdr-web
herdr-web
```

Run `herdr-web /path/to/project` to focus or create a workspace, or `herdr-web update` to install the latest release. Press Ctrl+C to stop the workbench. URLs printed by the CLI contain an access token: treat them as passwords and use LAN access only on a trusted network.

This npm package is published from `apps/web/` in the [herdr-web repository](https://github.com/narumiruna/herdr-web). For development, Docker, configuration and security instructions, see the [repository README](https://github.com/narumiruna/herdr-web#readme).
