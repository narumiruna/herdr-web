import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";

const execute = promisify(execFile);
const cleanups: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hw-docker-")));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const scripts = join(root, "apps/web/scripts");
  const bin = join(root, "bin");
  const dataHome = join(root, "data home");
  const log = join(root, "calls.ndjson");
  await mkdir(scripts, { recursive: true });
  await mkdir(bin);
  const script = join(scripts, "docker.sh");
  await copyFile(resolve("scripts/docker.sh"), script);

  // Mock Docker and proxy entry points, not shell process management.
  const command = `#!${process.execPath}
const { appendFileSync } = require("node:fs");
const { basename } = require("node:path");
const name = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(process.env.CALL_LOG, JSON.stringify({
  name, args, cwd: process.cwd(), token: process.env.HERDR_WEB_TOKEN,
  uid: process.env.HERDR_WEB_HOST_UID, gid: process.env.HERDR_WEB_HOST_GID,
  projects: process.env.HERDR_PROJECTS_ROOT, home: process.env.HERDR_WEB_HOME,
  protocol: process.env.HERDR_TERMINAL_CLIENT_PROTOCOL,
}) + "\\n");
if (name === "docker") {
  if (args[1] === "port") console.log("0.0.0.0:43173");
  if (args[1] === "up") process.exit(Number(process.env.COMPOSE_EXIT || 0));
} else if (name === "herdr") {
  console.log(process.env.HERDR_STATUS ?? JSON.stringify({client: {protocol: 4}}));
  process.exit(Number(process.env.HERDR_STATUS_EXIT || 0));
} else if (args[0] === "-e") {
  const result = require("node:child_process").spawnSync(process.execPath, args, {stdio: "inherit"});
  process.exit(result.status ?? 1);
} else if (args[0].endsWith("access-token.mjs")) {
  process.stdout.write("generated-token");
} else if (args[0].endsWith("find-port.mjs")) {
  process.stdout.write(args[1]);
} else if (args[0].endsWith("lan-address.mjs")) {
  process.stdout.write("192.168.1.2");
} else if (args[0].endsWith("-proxy.mjs")) {
  setInterval(() => {}, 1000);
} else {
  process.exit(1);
}
`;
  for (const name of ["node", "docker", "herdr"]) {
    await writeFile(join(bin, name), command, { mode: 0o755 });
  }
  const socketPath = join(root, "herdr.sock");
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );

  const run = (action: string, env: Record<string, string> = {}) =>
    execute("sh", [script, action], {
      cwd: tmpdir(),
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        CALL_LOG: log,
        HERDR_WEB_HOME: dataHome,
        HERDR_PROJECTS_ROOT: root,
        HERDR_HOST_SOCKET_PATH: socketPath,
        HERDR_BINARY: join(bin, "herdr"),
        HERDR_WEB_TOKEN: "fixed-token",
        HERDR_TERMINAL_PROXY_TOKEN: "proxy-token",
        HERDR_TERMINAL_CLIENT_PROTOCOL: "4",
        HERDR_WEB_HOST_UID: "1234",
        HERDR_WEB_HOST_GID: "5678",
        ...env,
      },
    });
  cleanups.push(() => run("down").catch(() => {}));
  return {
    root,
    dataHome,
    run,
    calls: async () =>
      (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
  };
}

describe.skipIf(process.platform === "win32")("Docker npm commands", () => {
  test("starts from the repository root and stops proxies from the saved data home", async () => {
    const { root, dataHome, run, calls } = await fixture();
    const { stdout } = await run("up");
    expect(stdout).toContain("http://localhost:43173/?token=fixed-token");
    expect(stdout).toContain("http://192.168.1.2:43173/?token=fixed-token");
    expect(
      await readFile(join(root, ".herdr-web-runtime/data-home"), "utf8"),
    ).toBe(`${dataHome}\n`);
    expect((await stat(dataHome)).mode & 0o777).toBe(0o700);
    const pids = await Promise.all(
      ["socket", "terminal"].map(async (name) =>
        Number(
          await readFile(join(dataHome, `runtime/${name}-proxy.pid`), "utf8"),
        ),
      ),
    );
    for (const pid of pids) expect(() => process.kill(pid, 0)).not.toThrow();
    expect(await calls()).toContainEqual(
      expect.objectContaining({
        name: "docker",
        args: ["compose", "up", "--build", "--detach", "--remove-orphans"],
        cwd: root,
        token: "fixed-token",
        uid: "1234",
        gid: "5678",
        projects: root,
        home: dataHome,
        protocol: "4",
      }),
    );
    await run("down", { HERDR_WEB_HOME: join(root, "other home") });
    await expect(stat(join(dataHome, "runtime"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(join(root, ".herdr-web-runtime"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("cleans up proxy PID files when Compose startup fails", async () => {
    const { dataHome, run } = await fixture();
    await expect(run("up", { COMPOSE_EXIT: "7" })).rejects.toMatchObject({
      code: 7,
    });
    for (const name of ["socket", "terminal"]) {
      await expect(
        stat(join(dataHome, `runtime/${name}-proxy.pid`)),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  });

  test("generates credentials and discovers the terminal protocol", async () => {
    const { run, calls } = await fixture();
    const { stdout } = await run("up", {
      HERDR_WEB_TOKEN: "",
      HERDR_TERMINAL_PROXY_TOKEN: "",
      HERDR_TERMINAL_CLIENT_PROTOCOL: "",
    });
    expect(stdout).toContain("?token=generated-token");
    expect(await calls()).toContainEqual(
      expect.objectContaining({
        name: "docker",
        protocol: "4",
        token: "generated-token",
      }),
    );
  });

  test.each(["{}", '{"client":{"protocol":"4"}}', "not-json"])(
    "rejects an invalid terminal protocol before starting Docker: %s",
    async (status) => {
      const { run, calls } = await fixture();
      await expect(
        run("up", {
          HERDR_TERMINAL_CLIENT_PROTOCOL: "",
          HERDR_STATUS: status,
        }),
      ).rejects.toMatchObject({ code: 1 });
      expect(await calls()).not.toContainEqual(
        expect.objectContaining({ name: "docker" }),
      );
    },
  );

  test("does not start Docker when Herdr status fails without output", async () => {
    const { run, calls } = await fixture();
    await expect(
      run("up", {
        HERDR_TERMINAL_CLIENT_PROTOCOL: "",
        HERDR_STATUS: "",
        HERDR_STATUS_EXIT: "7",
      }),
    ).rejects.toMatchObject({ code: 1 });
    expect(await calls()).not.toContainEqual(
      expect.objectContaining({ name: "docker" }),
    );
  });

  test.each([
    { setting: "HERDR_PROJECTS_ROOT", message: "project root not found" },
    { setting: "HERDR_HOST_SOCKET_PATH", message: "herdr socket not found" },
  ])(
    "rejects missing $setting before starting proxies",
    async ({ setting, message }) => {
      const { root, dataHome, run } = await fixture();
      await expect(
        run("up", { [setting]: join(root, "missing") }),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining(message),
      });
      for (const name of ["socket", "terminal"]) {
        await expect(
          stat(join(dataHome, `runtime/${name}-proxy.pid`)),
        ).rejects.toMatchObject({ code: "ENOENT" });
      }
    },
  );

  test.each(["up", "down"])(
    "rejects a relative data home before %s",
    async (action) => {
      const { run } = await fixture();
      await expect(
        run(action, { HERDR_WEB_HOME: "relative" }),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining("HERDR_WEB_HOME must be absolute"),
      });
    },
  );
});
