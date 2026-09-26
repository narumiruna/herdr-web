import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";
import { npmExecutable, startWorkbench } from "../scripts/start-workbench.mjs";

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
    const child = new EventEmitter();
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
    expect(spawnProcess).toHaveBeenCalledWith("npm", ["run", "dev"], {
      cwd: "/test",
      env,
      shell: false,
      stdio: "inherit",
    });
  });

  test("uses the Windows npm shim", () => {
    expect(npmExecutable("win32")).toBe("npm.cmd");
    expect(npmExecutable("linux")).toBe("npm");
  });

  test("starts the existing development processes with Windows-safe spawn options", async () => {
    const child = new EventEmitter();
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
      ["run", "dev"],
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
