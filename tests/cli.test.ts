import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const cliPath = resolve(projectRoot, "scripts/herdr-web.mjs");

interface Invocation {
  command: "herdr" | "just";
  args: string[];
  cwd: string;
}

interface CliOptions {
  env?: Record<string, string>;
  snapshot?: unknown;
}

async function createFakeCommands(root: string) {
  const binDirectory = resolve(root, "bin");
  const logPath = resolve(root, "calls.ndjson");
  await mkdir(binDirectory);

  const commandSource = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { basename } from "node:path";
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(process.env.CALL_LOG, JSON.stringify({ command, args, cwd: process.cwd() }) + "\\n");
if (command === "herdr" && args[0] === "api" && args[1] === "snapshot") {
  process.stdout.write(process.env.HERDR_SNAPSHOT ?? "{}");
  process.exit(Number(process.env.HERDR_SNAPSHOT_EXIT ?? "0"));
}
process.exit(Number(process.env[command === "herdr" ? "HERDR_ACTION_EXIT" : "JUST_EXIT"] ?? "0"));
`;

  for (const command of ["herdr", "just"]) {
    const commandPath = resolve(binDirectory, command);
    await writeFile(commandPath, commandSource);
    await chmod(commandPath, 0o755);
  }

  return { binDirectory, logPath };
}

async function runCli(
  args: string[],
  {
    env = {},
    snapshot = { result: { snapshot: { panes: [] } } },
  }: CliOptions = {},
) {
  const root = await mkdtemp(resolve(tmpdir(), "herdr-web-cli-"));
  const { binDirectory, logPath } = await createFakeCommands(root);
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CALL_LOG: logPath,
      HERDR_SNAPSHOT: JSON.stringify(snapshot),
      NO_COLOR: "1",
      PATH: `${binDirectory}:${process.env.PATH}`,
      ...env,
    },
  });
  let invocations: Invocation[] = [];
  try {
    invocations = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Invocation);
  } catch {
    // A validation failure is expected to execute no external commands.
  }
  return { ...result, invocations, root: await realpath(root) };
}

describe("herdr-web CLI", () => {
  it("creates a workspace for a directory and starts the web workbench", async () => {
    const fixtureRoot = await mkdtemp(resolve(tmpdir(), "herdr project "));
    const target = resolve(fixtureRoot, "sample project");
    await mkdir(target);

    const result = await runCli([target]);
    const canonicalTarget = await realpath(target);

    expect(result.status).toBe(0);
    expect(result.invocations).toEqual([
      { command: "herdr", args: ["api", "snapshot"], cwd: result.root },
      {
        command: "herdr",
        args: [
          "workspace",
          "create",
          "--cwd",
          canonicalTarget,
          "--label",
          basename(target),
          "--focus",
        ],
        cwd: result.root,
      },
      { command: "just", args: ["run"], cwd: projectRoot },
    ]);
  });

  it("focuses a workspace whose pane already uses the directory", async () => {
    const target = await mkdtemp(resolve(tmpdir(), "existing-herdr-project-"));
    const snapshot = {
      result: {
        snapshot: {
          panes: [{ workspace_id: "w7", cwd: target }],
        },
      },
    };

    const result = await runCli([target], { snapshot });

    expect(result.status).toBe(0);
    expect(result.invocations[1]).toEqual({
      command: "herdr",
      args: ["workspace", "focus", "w7"],
      cwd: result.root,
    });
    expect(result.invocations).not.toContainEqual(
      expect.objectContaining({ args: expect.arrayContaining(["create"]) }),
    );
  });

  it("starts the web workbench without selecting the current directory", async () => {
    const result = await runCli([]);

    expect(result.status).toBe(0);
    expect(result.invocations).toEqual([
      { command: "just", args: ["run"], cwd: projectRoot },
    ]);
  });

  it("opens the current directory when explicitly requested", async () => {
    const result = await runCli(["."]);

    expect(result.status).toBe(0);
    expect(result.invocations).toEqual([
      { command: "herdr", args: ["api", "snapshot"], cwd: result.root },
      {
        command: "herdr",
        args: [
          "workspace",
          "create",
          "--cwd",
          result.root,
          "--label",
          basename(result.root),
          "--focus",
        ],
        cwd: result.root,
      },
      { command: "just", args: ["run"], cwd: projectRoot },
    ]);
  });

  it("reports bare startup failures without invoking Herdr", async () => {
    const result = await runCli([], { env: { JUST_EXIT: "9" } });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("just run exited with status 9");
    expect(result.invocations).toEqual([
      { command: "just", args: ["run"], cwd: projectRoot },
    ]);
  });

  it("rejects an invalid directory before calling Herdr", async () => {
    const result = await runCli(["missing-directory"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Directory not found");
    expect(result.invocations).toEqual([]);
  });

  it("rejects unknown options before calling external commands", async () => {
    const result = await runCli(["--unknown"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Expected zero or one directory argument");
    expect(result.invocations).toEqual([]);
  });

  it("rejects extra positional arguments before calling external commands", async () => {
    const target = await mkdtemp(resolve(tmpdir(), "extra-herdr-project-"));
    const result = await runCli([target, "extra"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Expected zero or one directory argument");
    expect(result.invocations).toEqual([]);
  });

  it("does not start the web workbench when Herdr fails", async () => {
    const target = await mkdtemp(resolve(tmpdir(), "failing-herdr-project-"));
    const canonicalTarget = await realpath(target);
    const result = await runCli([target], { env: { HERDR_ACTION_EXIT: "7" } });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Herdr command failed");
    expect(result.invocations).toEqual([
      { command: "herdr", args: ["api", "snapshot"], cwd: result.root },
      {
        command: "herdr",
        args: [
          "workspace",
          "create",
          "--cwd",
          canonicalTarget,
          "--label",
          basename(target),
          "--focus",
        ],
        cwd: result.root,
      },
    ]);
  });

  it("prints help without calling external commands", async () => {
    const result = await runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Start the herdr-web workbench");
    expect(result.stdout).toContain("USAGE herdr-web [OPTIONS] [DIRECTORY]");
    expect(result.stdout).toContain("Project directory to focus or create");
    expect(result.invocations).toEqual([]);
  });
});
