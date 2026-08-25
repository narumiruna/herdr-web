import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";
import { npmExecutable, startWorkbench } from "../scripts/start-workbench.mjs";

describe("cross-platform workbench startup", () => {
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
