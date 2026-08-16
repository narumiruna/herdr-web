#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand, renderUsage, runMain } from "citty";

function fail(message) {
  process.stderr.write(`herdr-web: ${message}\n`);
  process.exitCode = 1;
}

function canonicalDirectory(input) {
  const expanded =
    input === "~" || input.startsWith("~/")
      ? resolve(homedir(), input.slice(2))
      : resolve(input);
  try {
    const path = realpathSync(expanded);
    if (!statSync(path).isDirectory()) {
      fail(`Not a directory: ${input}`);
      return undefined;
    }
    return path;
  } catch {
    fail(`Directory not found: ${input}`);
    return undefined;
  }
}

function runHerdr(args, capture = false) {
  try {
    return execFileSync("herdr", args, {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
  } catch {
    fail(`Herdr command failed: herdr ${args.join(" ")}`);
    return undefined;
  }
}

function matchingWorkspace(snapshotText, targetDirectory) {
  try {
    const response = JSON.parse(snapshotText);
    const panes = response?.result?.snapshot?.panes;
    if (!Array.isArray(panes)) throw new Error("missing panes");
    for (const pane of panes) {
      if (typeof pane?.workspace_id !== "string") continue;
      for (const candidate of [pane.cwd, pane.foreground_cwd]) {
        if (typeof candidate !== "string") continue;
        try {
          if (realpathSync(candidate) === targetDirectory) {
            return pane.workspace_id;
          }
        } catch {
          // Ignore stale pane directories and continue searching.
        }
      }
    }
    return undefined;
  } catch {
    fail("Herdr returned an invalid session snapshot");
    return undefined;
  }
}

async function rejectUnsupportedInvocation(rawArgs, command) {
  if (rawArgs.length <= 1 && !rawArgs[0]?.startsWith("-")) return false;
  process.stderr.write(`${await renderUsage(command)}\n`);
  fail("Expected zero or one directory argument");
  return true;
}

async function startWeb() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    await new Promise((resolveChild, rejectChild) => {
      const child = spawn("just", ["run"], {
        cwd: projectRoot,
        env: process.env,
        stdio: "inherit",
      });
      child.once("error", rejectChild);
      child.once("exit", (code, signal) => {
        if (signal) {
          rejectChild(new Error(`just run stopped by ${signal}`));
          return;
        }
        if (code !== 0) {
          rejectChild(new Error(`just run exited with status ${code ?? 1}`));
          return;
        }
        resolveChild();
      });
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not start just run");
  }
}

const main = defineCommand({
  meta: {
    name: "herdr-web",
    description:
      "Start the herdr-web workbench, optionally opening a project directory.",
  },
  args: {
    directory: {
      type: "positional",
      required: false,
      description: "Project directory to focus or create",
    },
  },
  async run(context) {
    if (await rejectUnsupportedInvocation(context.rawArgs, context.cmd)) return;
    const { directory } = context.args;
    if (directory === undefined) {
      await startWeb();
      return;
    }
    const targetDirectory = canonicalDirectory(directory);
    if (!targetDirectory) return;
    const snapshot = runHerdr(["api", "snapshot"], true);
    if (snapshot === undefined) return;
    const workspaceId = matchingWorkspace(snapshot, targetDirectory);
    if (process.exitCode === 1) return;
    const action = workspaceId
      ? ["workspace", "focus", workspaceId]
      : [
          "workspace",
          "create",
          "--cwd",
          targetDirectory,
          "--label",
          basename(targetDirectory) || "workspace",
          "--focus",
        ];
    if (runHerdr(action) !== undefined) {
      await startWeb();
    }
  },
});

await runMain(main);
