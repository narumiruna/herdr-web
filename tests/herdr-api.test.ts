import { afterEach, describe, expect, test, vi } from "vitest";
import {
  HerdrApiClient,
  normalizeWorkspacePath,
  workspaceLabelFromPath,
} from "../src/herdr-api";

afterEach(() => vi.unstubAllGlobals());

describe("workspace paths", () => {
  test("preserves separators for the Herdr host to interpret", () => {
    expect(normalizeWorkspacePath(" /repo/project/// ")).toBe(
      "/repo/project///",
    );
    expect(normalizeWorkspacePath("/tmp/project\\")).toBe("/tmp/project\\");
    expect(normalizeWorkspacePath("/tmp/project\\/")).toBe("/tmp/project\\/");
    expect(normalizeWorkspacePath("C:\\")).toBe("C:\\");
    expect(normalizeWorkspacePath("\\\\server\\share\\")).toBe(
      "\\\\server\\share\\",
    );
  });

  test("suggests labels without changing POSIX backslashes", () => {
    expect(workspaceLabelFromPath("/repo/project///")).toBe("project");
    expect(workspaceLabelFromPath("/tmp/project\\/")).toBe("project\\");
    expect(workspaceLabelFromPath("/tmp/project\\name")).toBe("project\\name");
    expect(workspaceLabelFromPath("C:\\repo\\project\\")).toBe("project");
    expect(workspaceLabelFromPath("\\\\server\\share\\project\\")).toBe(
      "project",
    );
  });
});

describe("runtime management API", () => {
  test("uses authenticated plugin and integration routes", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ type: "ok" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HerdrApiClient("secret");

    await api.setPluginEnabled("example.board", true);
    await api.invokePluginAction("example.board.refresh");
    await api.manageIntegration("qwen", "install");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/herdr/plugins/example.board",
      expect.objectContaining({
        body: JSON.stringify({ enabled: true }),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/herdr/plugin-actions/example.board.refresh/invoke",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/herdr/integrations/qwen",
      expect.objectContaining({
        body: JSON.stringify({ action: "install" }),
        method: "POST",
      }),
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers).toMatchObject({ authorization: "Bearer secret" });
    }
  });
});
