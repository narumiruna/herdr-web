import { describe, expect, test, vi } from "vitest";
import {
  parseMachineProfiles,
  SavedMachineService,
  summarizeMachineSnapshot,
} from "../server/machine-service";

const profiles = [
  {
    enabled: true,
    id: "0123456789abcdef0123456789abcdef",
    label: "Build machine",
    selected: true,
    session: "agents",
    target: "developer@private.example",
  },
  {
    enabled: false,
    id: "fedcba9876543210fedcba9876543210",
    label: "Archive",
    selected: false,
    session: "default",
    target: "archive.example",
  },
];

const snapshot = JSON.stringify({
  id: "cli:api:snapshot",
  result: {
    snapshot: {
      agents: [
        {
          agent: "muse",
          agent_status: "blocked",
          label: "  ",
          pane_id: "w1:p1",
          terminal_title_stripped: "Muse review",
          title: "",
          workspace_id: "w1",
        },
        {
          agent: "pi",
          agent_status: "working",
          pane_id: "w1:p2",
          workspace_id: "w1",
        },
      ],
      protocol: 22,
      version: "0.9.0",
      workspaces: [{ label: "herdr", workspace_id: "w1" }],
    },
  },
});

describe("saved machine supervision", () => {
  test("parses bounded profiles without retaining SSH targets", () => {
    const parsed = parseMachineProfiles(JSON.stringify(profiles));

    expect(parsed).toEqual([
      {
        enabled: true,
        id: profiles[0]?.id,
        label: "Build machine",
        selected: true,
        session: "agents",
      },
      {
        enabled: false,
        id: profiles[1]?.id,
        label: "Archive",
        selected: false,
        session: "default",
      },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("private.example");
  });

  test("reports machine-catalog truncation instead of presenting a complete fleet", async () => {
    const manyProfiles = Array.from({ length: 17 }, (_, index) => ({
      enabled: false,
      id: index.toString(16).padStart(32, "0"),
      label: `Machine ${index}`,
      selected: false,
      session: "default",
    }));
    const run = vi.fn().mockResolvedValue({
      stdout: JSON.stringify(manyProfiles),
    });

    const result = await new SavedMachineService("herdr", run).list();

    expect(result).toMatchObject({
      machineCount: 17,
      machinesTruncated: true,
    });
    expect(result.machines).toHaveLength(16);
    expect(run).toHaveBeenCalledOnce();
  });

  test("summarizes remote Spaces, Agents, and attention without exposing pane ids", () => {
    const [profile] = parseMachineProfiles(JSON.stringify(profiles));
    if (!profile) throw new Error("Missing machine profile");

    const summary = summarizeMachineSnapshot(profile, snapshot);

    expect(summary).toMatchObject({
      agentCount: 2,
      label: "Build machine",
      needsInput: 1,
      protocol: 22,
      status: "online",
      version: "0.9.0",
      workspaceCount: 1,
      workspaces: [
        {
          agentCount: 2,
          agents: [
            expect.objectContaining({
              label: "Muse review",
              status: "blocked",
            }),
            expect.objectContaining({ label: "pi", status: "working" }),
          ],
          agentsTruncated: false,
          label: "herdr",
          needsInput: 1,
        },
      ],
      workspacesTruncated: false,
    });
    expect(JSON.stringify(summary)).not.toContain("w1:p1");
  });

  test("marks bounded details as truncated and gives duplicate labels opaque keys", () => {
    const [profile] = parseMachineProfiles(JSON.stringify(profiles));
    if (!profile) throw new Error("Missing machine profile");
    const crowdedSnapshot = JSON.stringify({
      result: {
        snapshot: {
          agents: Array.from({ length: 33 }, (_, index) => ({
            agent_status: "idle",
            pane_id: `pane-${index}`,
            terminal_title_stripped: "Duplicate Agent",
            workspace_id: "space-0",
          })),
          protocol: 22,
          version: "0.9.0",
          workspaces: Array.from({ length: 65 }, (_, index) => ({
            label: "Duplicate Space",
            workspace_id: `space-${index}`,
          })),
        },
      },
    });

    const summary = summarizeMachineSnapshot(profile, crowdedSnapshot);

    expect(summary).toMatchObject({
      workspaceCount: 65,
      workspacesTruncated: true,
    });
    expect(summary.workspaces).toHaveLength(64);
    expect(new Set(summary.workspaces.map(({ key }) => key))).toHaveProperty(
      "size",
      64,
    );
    expect(summary.workspaces[0]).toMatchObject({
      agentCount: 33,
      agentsTruncated: true,
    });
    expect(summary.workspaces[0]?.agents).toHaveLength(32);
    expect(
      new Set(summary.workspaces[0]?.agents.map(({ key }) => key)),
    ).toHaveProperty("size", 32);
    expect(summary.workspaces.map(({ key }) => key)).not.toContain("space-0");
    expect(summary.workspaces[0]?.agents.map(({ key }) => key)).not.toContain(
      "pane-0",
    );
    const repeated = summarizeMachineSnapshot(profile, crowdedSnapshot);
    expect(repeated.workspaces.map(({ key }) => key)).toEqual(
      summary.workspaces.map(({ key }) => key),
    );
    expect(repeated.workspaces[0]?.agents.map(({ key }) => key)).toEqual(
      summary.workspaces[0]?.agents.map(({ key }) => key),
    );
  });

  test("uses exact argv routing and isolates unavailable and disabled machines", async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === "machine") return { stdout: JSON.stringify(profiles) };
      throw Object.assign(new Error("remote failed"), {
        stderr: "ssh: connect to host developer@private.example failed\n",
      });
    });
    const service = new SavedMachineService("herdr-preview", run);

    const result = await service.list();

    expect(run.mock.calls).toEqual([
      [["machine", "list", "--json"], 5_000],
      [["--machine", profiles[0]?.id, "api", "snapshot"], 12_000],
    ]);
    expect(result).toMatchObject({
      machineCount: 2,
      machinesTruncated: false,
    });
    expect(result.machines).toEqual([
      expect.objectContaining({
        error: "Remote snapshot is unavailable",
        status: "offline",
      }),
      expect.objectContaining({ status: "disabled" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("private.example");
    expect(await service.list()).toBe(result);
    expect(run).toHaveBeenCalledTimes(2);

    expect(await service.list(true)).not.toBe(result);
    expect(run.mock.calls.slice(2)).toEqual([
      [["machine", "list", "--json"], 5_000],
      [["--machine", profiles[0]?.id, "api", "snapshot"], 12_000],
    ]);
  });

  test("rejects malformed machine ids before using them as command arguments", () => {
    expect(() =>
      parseMachineProfiles(
        JSON.stringify([
          {
            enabled: true,
            id: "--session",
            label: "unsafe",
            session: "default",
          },
        ]),
      ),
    ).toThrow("invalid machine profile id");
  });
});
