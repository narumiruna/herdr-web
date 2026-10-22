import { spawn } from "node:child_process";
import { accessToken, findPort, lanAddress } from "./startup-environment.mjs";

export function npmExecutable(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function runNpm(
  args,
  {
    env = process.env,
    platform = process.platform,
    projectRoot,
    spawnProcess = spawn,
  },
  label,
) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(npmExecutable(platform), args, {
      cwd: projectRoot,
      env,
      shell: platform === "win32",
      stdio: "inherit",
    });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    const cleanup = () => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (signal) {
        reject(new Error(`${label} stopped by ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`${label} exited with status ${code ?? 1}`));
      } else {
        resolve();
      }
    });
  });
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

  await runNpm(
    [
      "exec",
      "--",
      "concurrently",
      "--kill-others",
      "--names",
      "web,bridge",
      "vite",
      platform === "win32"
        ? '"tsx watch server/index.ts"'
        : "tsx watch server/index.ts",
    ],
    {
      projectRoot,
      platform,
      spawnProcess,
      env: {
        ...env,
        BRIDGE_PORT: String(bridgePort),
        HERDR_WEB_TOKEN: token,
        VITE_PORT: String(webPort),
      },
    },
    "development server",
  );
}
