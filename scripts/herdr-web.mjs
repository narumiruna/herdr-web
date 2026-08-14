#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `Start herdr web for a project directory.

Usage: herdr-web [directory]

Arguments:
  directory  Project directory to open (default: current directory)

The command focuses an existing matching Herdr workspace or creates one,
then starts the authenticated web workbench with the existing just workflow.
`;

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

async function startWeb() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(HELP);
} else if (args.length > 1 || args[0]?.startsWith("-")) {
  process.stderr.write(HELP);
  fail("Expected zero or one directory argument");
} else {
  const targetDirectory = canonicalDirectory(args[0] ?? process.cwd());
  if (targetDirectory) {
    const snapshot = runHerdr(["api", "snapshot"], true);
    if (snapshot !== undefined) {
      const workspaceId = matchingWorkspace(snapshot, targetDirectory);
      if (process.exitCode !== 1) {
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
          try {
            await startWeb();
          } catch (error) {
            fail(
              error instanceof Error
                ? error.message
                : "Could not start just run",
            );
          }
        }
      }
    }
  }
}
