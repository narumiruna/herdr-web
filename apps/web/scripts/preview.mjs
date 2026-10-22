import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runNpm } from "./start-workbench.mjs";
import { accessToken, findPort } from "./startup-environment.mjs";

try {
  const token = process.env.HERDR_WEB_TOKEN || accessToken();
  const port =
    process.env.BRIDGE_PORT || process.env.PORT || String(await findPort(8787));
  process.stdout.write(`herdr-web: http://localhost:${port}/?token=${token}\n`);
  await runNpm(
    ["start"],
    {
      projectRoot: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      env: {
        ...process.env,
        HERDR_WEB_TOKEN: token,
        BRIDGE_PORT: port,
        PORT: port,
      },
    },
    "preview server",
  );
} catch (error) {
  process.stderr.write(
    `herdr-web: ${error instanceof Error ? error.message : "Could not start the preview server"}\n`,
  );
  process.exitCode = 1;
}
