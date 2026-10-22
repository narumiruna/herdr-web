import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";
import {
  npmExecutable,
  runNpm,
  startWorkbench,
} from "../scripts/start-workbench.mjs";

function mockChild() {
  return Object.assign(new EventEmitter(), { kill: vi.fn(() => true) });
}

describe("npm child lifecycle", () => {
  test.each(["SIGINT", "SIGTERM"] as const)(
    "forwards launcher %s and removes signal listeners after shutdown",
    async (signal) => {
      const beforeInterrupt = process.listeners("SIGINT");
      const beforeTerminate = process.listeners("SIGTERM");
      const before = process.listeners(signal);
      const child = mockChild();
      const started = runNpm(
        ["start"],
        { projectRoot: "/test", spawnProcess: () => child },
        "server",
      );
      const forward = process
        .listeners(signal)
        .find((listener) => !before.includes(listener));
      expect(forward).toBeDefined();
      forward?.(signal);
      expect(child.kill).toHaveBeenCalledWith(signal);
      child.emit("exit", null, signal);
      await expect(started).rejects.toThrow(`server stopped by ${signal}`);
      expect(process.listeners("SIGINT")).toEqual(beforeInterrupt);
      expect(process.listeners("SIGTERM")).toEqual(beforeTerminate);
    },
  );

  test.each(["error", "exit"])(
    "removes signal listeners after child %s",
    async (event) => {
      const beforeInterrupt = process.listeners("SIGINT");
      const beforeTerminate = process.listeners("SIGTERM");
      const child = mockChild();
      const started = runNpm(
        ["start"],
        { projectRoot: "/test", spawnProcess: () => child },
        "server",
      );
      if (event === "error") {
        child.emit("error", new Error("spawn failed"));
        await expect(started).rejects.toThrow("spawn failed");
      } else {
        child.emit("exit", 0, null);
        await expect(started).resolves.toBeUndefined();
      }
      expect(process.listeners("SIGINT")).toEqual(beforeInterrupt);
      expect(process.listeners("SIGTERM")).toEqual(beforeTerminate);
    },
  );
});

describe("cross-platform workbench startup", () => {
  test.each(["access-token", "find-port", "lan-address"])(
    "keeps the %s executable wrapper newline-free",
    async (script) => {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [
        `scripts/${script}.mjs`,
      ]);
      expect(stderr).toBe("");
      expect(stdout).not.toMatch(/[\r\n]/);
      if (script === "access-token") expect(stdout).toMatch(/^[a-f0-9]{48}$/);
      else if (script === "find-port") {
        expect(stdout).toMatch(/^\d+$/);
        expect(Number(stdout)).toBeGreaterThan(0);
        expect(Number(stdout)).toBeLessThanOrEqual(65535);
      } else expect(stdout).toMatch(/^(localhost|\d+\.\d+\.\d+\.\d+)$/);
    },
  );

  test.each([
    {
      event: "error",
      args: [new Error("spawn failed")],
      message: "spawn failed",
    },
    {
      event: "exit",
      args: [7, null],
      message: "development server exited with status 7",
    },
    {
      event: "exit",
      args: [null, "SIGTERM"],
      message: "development server stopped by SIGTERM",
    },
  ])("propagates child $message", async ({ event, args, message }) => {
    const child = mockChild();
    const spawnProcess = vi.fn(() => child);
    const env = {
      HERDR_WEB_TOKEN: "fixed-token",
      VITE_PORT: "15173",
      BRIDGE_PORT: "18787",
      EXTRA_SETTING: "kept",
    };
    const started = startWorkbench({
      env,
      platform: "linux",
      projectRoot: "/test",
      spawnProcess,
    });
    child.emit(event, ...args);
    await expect(started).rejects.toThrow(message);
    expect(spawnProcess).toHaveBeenCalledWith(
      "npm",
      [
        "exec",
        "--",
        "concurrently",
        "--kill-others",
        "--names",
        "web,bridge",
        "vite",
        "tsx watch server/index.ts",
      ],
      {
        cwd: "/test",
        env,
        shell: false,
        stdio: "inherit",
      },
    );
  });

  test("uses the Windows npm shim", () => {
    expect(npmExecutable("win32")).toBe("npm.cmd");
    expect(npmExecutable("linux")).toBe("npm");
  });

  test("starts the existing development processes with Windows-safe spawn options", async () => {
    const child = mockChild();
    const spawnProcess = vi.fn(() => child);
    const started = startWorkbench({
      env: {
        BRIDGE_PORT: "18787",
        HERDR_WEB_TOKEN: "fixed-token",
        VITE_PORT: "15173",
      },
      platform: "win32",
      projectRoot: "C:\\herdr-web",
      spawnProcess,
    });
    queueMicrotask(() => child.emit("exit", 0, null));

    await expect(started).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      "npm.cmd",
      [
        "exec",
        "--",
        "concurrently",
        "--kill-others",
        "--names",
        "web,bridge",
        "vite",
        '"tsx watch server/index.ts"',
      ],
      expect.objectContaining({
        cwd: "C:\\herdr-web",
        env: expect.objectContaining({
          BRIDGE_PORT: "18787",
          HERDR_WEB_TOKEN: "fixed-token",
          VITE_PORT: "15173",
        }),
        shell: true,
        stdio: "inherit",
      }),
    );
  });
});
