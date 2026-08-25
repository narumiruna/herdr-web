import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";

function availablePort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const selected =
        typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(selected));
    });
  });
}

async function findPort(preferred) {
  for (let port = preferred; port < preferred + 100; port += 1) {
    const selected = await availablePort(port);
    if (selected !== false) return selected;
  }
  const selected = await availablePort(0);
  if (selected === false || selected === 0) {
    throw new Error("Could not find an available TCP port");
  }
  return selected;
}

function lanAddress() {
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter(
      (entry) =>
        entry.family === "IPv4" &&
        !entry.internal &&
        !entry.address.startsWith("169.254."),
    )
    .map(({ address }) => address);
  return (
    addresses.find((address) => address.startsWith("192.168.")) ??
    addresses.find((address) => address.startsWith("10.")) ??
    addresses[0] ??
    "localhost"
  );
}

export function npmExecutable(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export async function startWorkbench({
  env = process.env,
  platform = process.platform,
  projectRoot,
  spawnProcess = spawn,
}) {
  const token = env.HERDR_WEB_TOKEN || randomBytes(24).toString("hex");
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
