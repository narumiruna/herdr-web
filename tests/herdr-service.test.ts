import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { HerdrApiError, type HerdrClient } from "../server/herdr-client";
import { LiveHerdrService } from "../server/herdr-service";

describe("LiveHerdrService", () => {
  test("uses the raw protocol spelling when reading pane output", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        snapshot: { panes: [{ pane_id: "w5:p1" }] },
        type: "session_snapshot",
      })
      .mockResolvedValueOnce({
        read: { pane_id: "w5:p1", revision: 1, text: "hi" },
        type: "pane_read",
      });
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    await expect(service.getState()).resolves.toMatchObject({
      reads: { "w5:p1": { text: "hi" } },
    });
    expect(request).toHaveBeenNthCalledWith(2, "pane.read", {
      format: "text",
      lines: 240,
      pane_id: "w5:p1",
      source: "recent_unwrapped",
      strip_ansi: true,
    });
  });

  test("reports partial pane read failures without discarding the snapshot", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        snapshot: {
          panes: [{ pane_id: "w5:p1" }, { pane_id: "w5:p2" }],
        },
        type: "session_snapshot",
      })
      .mockResolvedValueOnce({
        read: { pane_id: "w5:p1", revision: 1, text: "hi" },
        type: "pane_read",
      })
      .mockRejectedValueOnce(new Error("socket read failed"));
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    await expect(service.getState()).resolves.toMatchObject({
      readErrors: { "w5:p2": "socket read failed" },
      reads: { "w5:p1": { text: "hi" } },
      snapshot: { panes: [{ pane_id: "w5:p1" }, { pane_id: "w5:p2" }] },
    });
  });

  test("marks panes beyond the bounded read limit as partial output", async () => {
    const panes = Array.from({ length: 65 }, (_, index) => ({
      pane_id: `w5:p${index + 1}`,
    }));
    const request = vi
      .fn()
      .mockResolvedValueOnce({ snapshot: { panes }, type: "session_snapshot" })
      .mockResolvedValue({
        read: { pane_id: "read", revision: 1, text: "output" },
        type: "pane_read",
      });
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    const result = await service.getState();

    expect(request).toHaveBeenCalledTimes(65);
    expect(result.readErrors["w5:p65"]).toContain("more than 64 panes");
  });

  test("stores a verified image under the target pane working directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-image-upload-"));
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const request = vi.fn().mockResolvedValue({
      pane: {
        cwd: directory,
        pane_id: "w5:p1",
      },
      type: "pane_info",
    });
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    try {
      const result = await service.uploadImage("w5:p1", {
        data: png,
        mediaType: "image/png",
      });

      expect(request).toHaveBeenCalledWith("pane.get", { pane_id: "w5:p1" });
      expect(result).toMatchObject({
        mediaType: "image/png",
        size: png.length,
        type: "image_uploaded",
      });
      expect(result.path).toContain(join(directory, ".hedr", "uploads"));
      await expect(readFile(result.path)).resolves.toEqual(png);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("rejects empty, unsupported, spoofed, and oversized images before reading pane state", async () => {
    const request = vi.fn();
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    await expect(
      service.uploadImage("w5:p1", {
        data: Buffer.alloc(0),
        mediaType: "image/png",
      }),
    ).rejects.toThrow("must not be empty");
    await expect(
      service.uploadImage("w5:p1", {
        data: Buffer.from("<svg/>"),
        mediaType: "image/svg+xml",
      }),
    ).rejects.toThrow("PNG, JPEG, GIF, or WebP");
    await expect(
      service.uploadImage("w5:p1", {
        data: Buffer.from("not a png"),
        mediaType: "image/png",
      }),
    ).rejects.toThrow("does not match");
    await expect(
      service.uploadImage("w5:p1", {
        data: Buffer.alloc(8 * 1024 * 1024 + 1),
        mediaType: "image/png",
      }),
    ).rejects.toThrow("8 MiB");
    expect(request).not.toHaveBeenCalled();
  });

  test("rejects pane directories outside the configured Docker project root", async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), "herdr-project-root-"));
    const outside = await mkdtemp(join(tmpdir(), "herdr-outside-root-"));
    const request = vi.fn().mockResolvedValue({
      pane: { cwd: outside, pane_id: "w5:p1" },
      type: "pane_info",
    });
    const service = new LiveHerdrService(
      { request } as unknown as HerdrClient,
      { projectsRoot },
    );

    try {
      await expect(
        service.uploadImage("w5:p1", {
          data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          mediaType: "image/png",
        }),
      ).rejects.toThrow("outside the Docker-mounted HERDR_PROJECTS_ROOT");
    } finally {
      await Promise.all(
        [projectsRoot, outside].map((path) =>
          rm(path, { force: true, recursive: true }),
        ),
      );
    }
  });

  test("waits for a new shell and agent to become prompt-ready", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        root_pane: { pane_id: "w5:p9" },
        tab: { tab_id: "w5:t9" },
        type: "tab_created",
      })
      .mockRejectedValueOnce(
        new HerdrApiError("agent_pane_busy", "Shell is still starting"),
      )
      .mockResolvedValueOnce({
        agent: { agent_status: "unknown", pane_id: "w5:p9" },
        type: "agent_started",
      })
      .mockResolvedValueOnce({
        agent: { agent: null, interactive_ready: false },
        type: "agent_info",
      })
      .mockResolvedValueOnce({
        agent: { agent: "pi", interactive_ready: true, pane_id: "w5:p9" },
        type: "agent_info",
      });
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    await expect(
      service.createSession({
        command: "pi",
        label: "ready-agent",
        runtime: "Pi",
        workspaceId: "w5",
      }),
    ).resolves.toMatchObject({
      agent: { agent: "pi", interactive_ready: true, pane_id: "w5:p9" },
      type: "agent_started",
    });
    expect(request).toHaveBeenCalledTimes(5);
  });

  test("rejects arbitrary commands before creating a tab", async () => {
    const request = vi.fn();
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    await expect(
      service.createSession({
        command: "pi && rm -rf /",
        label: "unsafe",
        runtime: "Pi",
        workspaceId: "w5",
      }),
    ).rejects.toThrow("Unsupported agent runtime or command");
    expect(request).not.toHaveBeenCalled();
  });
});
