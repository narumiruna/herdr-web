import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const projectRoot = await realpath(process.cwd());
const previewPath = resolve(projectRoot, "scripts/preview.mjs");
const directories: string[] = [];

interface Invocation {
  args: string[];
  cwd: string;
  token: string;
  port: string;
  bridgePort: string;
  extra?: string;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function runPreview(env: NodeJS.ProcessEnv = {}, missingNpm = false) {
  const directory = await mkdtemp(resolve(tmpdir(), "herdr-web-preview-"));
  directories.push(directory);
  const logPath = resolve(directory, "call.json");
  const npmPath = resolve(directory, "npm");
  if (!missingNpm) {
    await writeFile(
      npmPath,
      `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(process.env.CALL_LOG, JSON.stringify({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  token: process.env.HERDR_WEB_TOKEN,
  port: process.env.PORT,
  bridgePort: process.env.BRIDGE_PORT,
  extra: process.env.EXTRA_SETTING,
}));
if (process.env.NPM_SIGNAL) process.kill(process.pid, process.env.NPM_SIGNAL);
else process.exit(Number(process.env.NPM_EXIT ?? "0"));
`,
    );
    await chmod(npmPath, 0o755);
  }
  const result = spawnSync(process.execPath, [previewPath], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      HERDR_WEB_TOKEN: "",
      BRIDGE_PORT: "",
      PORT: "",
      CALL_LOG: logPath,
      PATH: missingNpm
        ? directory
        : `${directory}${delimiter}${process.env.PATH}`,
      ...env,
    },
  });
  let invocation: Invocation | undefined;
  if (!missingNpm) {
    invocation = JSON.parse(await readFile(logPath, "utf8")) as Invocation;
  }
  return { ...result, invocation };
}

describe("production preview", () => {
  it("builds before preview and keeps start as the raw built server", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(projectRoot, "package.json"), "utf8"),
    );
    expect(manifest.scripts.prepreview).toBe("npm run build");
    expect(manifest.scripts.preview).toBe("node scripts/preview.mjs");
    expect(manifest.scripts.start).toBe("node dist-server/index.js");
    expect(manifest.scripts.dev).toBe("node scripts/herdr-web.mjs");
  });

  it("preserves the token, port, and other environment settings", async () => {
    const result = await runPreview({
      HERDR_WEB_TOKEN: "fixed-token",
      PORT: "18787",
      EXTRA_SETTING: "kept",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      "herdr-web: http://localhost:18787/?token=fixed-token\n",
    );
    expect(result.invocation).toEqual({
      args: ["start"],
      cwd: projectRoot,
      token: "fixed-token",
      port: "18787",
      bridgePort: "18787",
      extra: "kept",
    });
  });

  it("prints the bridge port when it overrides PORT", async () => {
    const result = await runPreview({
      HERDR_WEB_TOKEN: "fixed-token",
      BRIDGE_PORT: "18788",
      PORT: "18787",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "http://localhost:18788/?token=fixed-token",
    );
    expect(result.invocation).toMatchObject({
      port: "18788",
      bridgePort: "18788",
    });
  });

  it("generates an access token and selects an available port", async () => {
    const result = await runPreview();

    expect(result.status).toBe(0);
    expect(result.invocation?.token).toMatch(/^[a-f0-9]{48}$/);
    expect(Number(result.invocation?.port)).toBeGreaterThan(0);
    expect(Number(result.invocation?.port)).toBeLessThanOrEqual(65535);
    expect(result.stdout).toBe(
      `herdr-web: http://localhost:${result.invocation?.port}/?token=${result.invocation?.token}\n`,
    );
    expect(result.invocation?.args).toEqual(["start"]);
  });

  it("reports spawn errors", async () => {
    const result = await runPreview(
      { HERDR_WEB_TOKEN: "fixed-token", PORT: "18787" },
      true,
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("spawn npm ENOENT");
  });

  it.each([
    {
      env: { NPM_EXIT: "9" },
      message: "preview server exited with status 9",
    },
    {
      env: { NPM_SIGNAL: "SIGTERM" },
      message: "preview server stopped by SIGTERM",
    },
  ])("reports $message", async ({ env, message }) => {
    const result = await runPreview({
      HERDR_WEB_TOKEN: "fixed-token",
      PORT: "18787",
      ...env,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
  });
});
