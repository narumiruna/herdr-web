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
const cliPath = resolve(projectRoot, "scripts/herdeer.mjs");

interface Invocation {
  command: "herdr" | "just";
  args: string[];
  cwd: string;
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
  snapshot: unknown = { result: { snapshot: { panes: [] } } },
) {
  const root = await mkdtemp(resolve(tmpdir(), "herdeer-cli-"));
  const { binDirectory, logPath } = await createFakeCommands(root);
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CALL_LOG: logPath,
      HERDR_SNAPSHOT: JSON.stringify(snapshot),
      PATH: `${binDirectory}:${process.env.PATH}`,
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

describe("herdeer CLI", () => {
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

    const result = await runCli([target], snapshot);

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

  it("defaults to the current directory", async () => {
    const result = await runCli([]);

    expect(result.status).toBe(0);
    expect(result.invocations[1]).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining(["--cwd", result.root]),
      }),
    );
  });

  it("rejects an invalid directory before calling Herdr", async () => {
    const result = await runCli(["missing-directory"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Directory not found");
    expect(result.invocations).toEqual([]);
  });

  it("prints help without calling external commands", async () => {
    const result = await runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: herdeer [directory]");
    expect(result.invocations).toEqual([]);
  });
});
