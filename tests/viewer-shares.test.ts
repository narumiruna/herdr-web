import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createHerdrHttpHandler, type HerdrService } from "../server/http-app";
import { projectStateForShare } from "../server/share-projection";
import { ViewerShareStore } from "../server/share-store";
import { TerminalTicketStore } from "../server/terminal-tickets";

const directories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function scopedState() {
  const pane = (workspaceId: string, tabId: string, paneId: string) => ({
    agent: "pi",
    agent_status: "blocked",
    cwd: `/secret/${workspaceId}`,
    pane_id: paneId,
    revision: 2,
    tab_id: tabId,
    tokens: { model: "safe-model", secret: "must-not-project" },
    workspace_id: workspaceId,
  });
  const p1 = pane("w1", "t1", "p1");
  const p1b = pane("w1", "t1", "p1b");
  const p2 = pane("w2", "t2", "p2");
  return {
    capabilities: { terminalReason: "", terminalStreaming: true },
    previews: {
      p1: {
        pane_id: "p1",
        revision: 2,
        secret_future_field: "must-not-project-read",
        text: "shared output",
      },
      p2: { pane_id: "p2", revision: 2, text: "private output" },
    },
    readErrors: {},
    reads: {},
    snapshot: {
      agents: [p1, p2],
      focused_pane_id: "p1",
      focused_workspace_id: "w1",
      layouts: [
        {
          focused_pane_id: "p1",
          panes: [
            { focused: true, pane_id: "p1" },
            { focused: false, pane_id: "p1b" },
          ],
          splits: [{ direction: "right", id: "split-secret", ratio: 0.5 }],
          tab_id: "t1",
          workspace_id: "w1",
        },
        {
          focused_pane_id: "p2",
          panes: [{ focused: true, pane_id: "p2" }],
          tab_id: "t2",
          workspace_id: "w2",
        },
      ],
      panes: [p1, p1b, p2],
      protocol: 20,
      tabs: [
        { label: "one", number: 1, tab_id: "t1", workspace_id: "w1" },
        { label: "two", number: 1, tab_id: "t2", workspace_id: "w2" },
      ],
      version: "0.8.2",
      workspaces: [
        { active_tab_id: "t1", label: "one", workspace_id: "w1" },
        { active_tab_id: "t2", label: "two", workspace_id: "w2" },
      ],
    },
  };
}

async function startShareApi(store: ViewerShareStore) {
  const state = scopedState();
  const service: HerdrService = {
    closePane: vi.fn(),
    createSession: vi.fn(),
    createWorkspace: vi.fn(),
    getState: vi.fn().mockResolvedValue(state),
    promptAgent: vi.fn(),
    setSplitRatio: vi.fn(),
    splitPane: vi.fn(),
    uploadImage: vi.fn(),
  };
  const tickets = new TerminalTicketStore();
  const server = createServer(
    createHerdrHttpHandler({
      service,
      shareStore: store,
      terminalConfigured: true,
      terminalTickets: tickets,
      token: "controller-secret",
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  return { base: `http://127.0.0.1:${address.port}`, service, tickets };
}

describe("scoped viewer shares", () => {
  test("projects exact workspace, session, and pane scope without unknown fields", () => {
    const projected = projectStateForShare(scopedState(), {
      agentId: "p1",
      paneId: "p1",
      workspaceId: "w1",
    });
    expect(projected?.snapshot).toMatchObject({
      agents: [{ pane_id: "p1", tokens: { model: "safe-model" } }],
      panes: [{ pane_id: "p1" }],
      tabs: [{ tab_id: "t1" }],
      workspaces: [{ workspace_id: "w1" }],
    });
    expect(JSON.stringify(projected)).not.toContain("w2");
    expect(JSON.stringify(projected)).not.toContain("private output");
    expect(JSON.stringify(projected)).not.toContain("must-not-project");
    expect(JSON.stringify(projected)).not.toContain("must-not-project-read");
    expect(JSON.stringify(projected)).not.toContain("p1b");
  });

  test("stores only token hashes and rejects expired or revoked credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-shares-"));
    directories.push(directory);
    let now = 1_000;
    const path = join(directory, "viewer-shares.json");
    const store = new ViewerShareStore(path, { now: () => now });
    await store.load();
    const created = await store.create({ workspaceId: "w1" }, 5_000);

    expect(store.resolve(created.token)?.id).toBe(created.share.id);
    expect(await readFile(path, "utf8")).not.toContain(created.token);
    now = created.share.expiresAt;
    expect(store.resolve(created.token)).toBeUndefined();

    now = 2_000;
    const revocable = await store.create({ workspaceId: "w1" }, 5_000);
    expect(await store.revoke(revocable.share.id)).toBe(true);
    expect(store.resolve(revocable.token)).toBeUndefined();

    const retryable = await store.create({ workspaceId: "w1" }, 5_000);
    const backup = `${directory}-backup`;
    await rename(directory, backup);
    await writeFile(directory, "block persistence");
    await expect(store.revoke(retryable.share.id)).rejects.toThrow();
    expect(store.resolve(retryable.token)).toBeUndefined();
    await rm(directory, { force: true });
    await rename(backup, directory);
    expect(await store.revoke(retryable.share.id)).toBe(true);
  });

  test("enforces scope on snapshots and tickets and invalidates revocation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-share-api-"));
    directories.push(directory);
    const store = new ViewerShareStore(join(directory, "shares.json"));
    await store.load();
    const { base, service, tickets } = await startShareApi(store);
    const controllerHeaders = {
      authorization: "Bearer controller-secret",
      "content-type": "application/json",
    };
    const createdResponse = await fetch(`${base}/api/herdr/viewer-shares`, {
      body: JSON.stringify({
        expiresInMinutes: 15,
        scope: { agentId: "p1", paneId: "p1", workspaceId: "w1" },
      }),
      headers: controllerHeaders,
      method: "POST",
    });
    const created = (await createdResponse.json()) as {
      share: { id: string };
      token: string;
      url: string;
    };
    expect(created.url).toContain("/#token=");
    expect(created.url).not.toContain("?token=");
    const shareHeaders = {
      authorization: `Bearer ${created.token}`,
      "content-type": "application/json",
    };

    const state = await fetch(`${base}/api/herdr/state`, {
      headers: shareHeaders,
    });
    expect(state.status).toBe(200);
    const projected = await state.text();
    expect(projected).toContain("shared output");
    expect(projected).not.toContain("private output");

    service.subscribeEvents = vi.fn(async (_signal, onEvent, onReady) => {
      onReady?.();
      onEvent({
        data: { pane_id: "p2", workspace_id: "w2" },
        event: "pane_updated",
      });
      onEvent({
        data: { pane_id: "p1", workspace_id: "w1" },
        event: "pane_updated",
      });
    });
    const events = await fetch(`${base}/api/herdr/events`, {
      headers: shareHeaders,
    });
    const eventText = await events.text();
    expect(eventText).toContain("scope_updated");
    expect(eventText).not.toContain("p2");
    expect(eventText).not.toContain("w2");

    const outside = await fetch(`${base}/api/herdr/panes/p2/terminal-ticket`, {
      body: JSON.stringify({ cols: 80, mode: "observe", rows: 24 }),
      headers: shareHeaders,
      method: "POST",
    });
    expect(outside.status).toBe(403);
    const inside = await fetch(`${base}/api/herdr/panes/p1/terminal-ticket`, {
      body: JSON.stringify({ cols: 80, mode: "observe", rows: 24 }),
      headers: shareHeaders,
      method: "POST",
    });
    const ticket = (await inside.json()) as { ticket: string };
    expect(inside.status).toBe(201);
    expect(tickets.consume(ticket.ticket)).toMatchObject({
      mode: "observe",
      paneId: "p1",
      shareId: created.share.id,
    });
    const pendingResponse = await fetch(
      `${base}/api/herdr/panes/p1/terminal-ticket`,
      {
        body: JSON.stringify({ cols: 80, mode: "observe", rows: 24 }),
        headers: shareHeaders,
        method: "POST",
      },
    );
    const pendingTicket = (await pendingResponse.json()) as { ticket: string };

    const revoke = await fetch(
      `${base}/api/herdr/viewer-shares/${created.share.id}`,
      { headers: controllerHeaders, method: "DELETE" },
    );
    expect(revoke.status).toBe(200);
    expect(tickets.consume(pendingTicket.ticket)).toBeUndefined();
    expect(
      await fetch(`${base}/api/herdr/state`, { headers: shareHeaders }),
    ).toHaveProperty("status", 401);
  });
});
