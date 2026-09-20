import { spawn } from "node:child_process";
import { accessToken, findPort, lanAddress } from "./startup-environment.mjs";

export function npmExecutable(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export async function startWorkbench({
  env = process.env,
  platform = process.platform,
  projectRoot,
  spawnProcess = spawn,
}) {
  const token = env.HERDR_WEB_TOKEN || accessToken();
  const webPort =
    Number.parseInt(env.VITE_PORT ?? "", 10) || (await findPort(5173));
  const bridgePort =
    Number.parseInt(env.BRIDGE_PORT ?? "", 10) || (await findPort(8787));
  const host = lanAddress();
  process.stdout.write(`herdr-web token: ${token}\n`);
  process.stdout.write(
    `local:   http://localhost:${webPort}/?token=${token}\n`,
  );
  process.stdout.write(`network: http://${host}:${webPort}/?token=${token}\n`);

  await new Promise((resolve, reject) => {
    const child = spawnProcess(npmExecutable(platform), ["run", "dev"], {
      cwd: projectRoot,
      env: {
        ...env,
        BRIDGE_PORT: String(bridgePort),
        HERDR_WEB_TOKEN: token,
        VITE_PORT: String(webPort),
      },
      shell: platform === "win32",
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`development server stopped by ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`development server exited with status ${code ?? 1}`));
      } else {
        resolve();
      }
    });
  });
}
