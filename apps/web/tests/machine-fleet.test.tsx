import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { MachineFleet } from "../src/components/MachineFleet";
import type { SavedMachineListResult } from "../src/herdr-api";

const machines = [
  {
    agentCount: 33,
    enabled: true,
    id: "machine-build",
    label: "Build machine",
    needsInput: 1,
    protocol: 22,
    selected: true,
    session: "agents",
    status: "online" as const,
    version: "0.9.0",
    workspaceCount: 65,
    workspaces: [
      {
        agentCount: 33,
        agents: [
          { key: "muse", label: "Muse review", status: "blocked" },
          { key: "pi", label: "Pi tests", status: "working" },
        ],
        agentsTruncated: true,
        key: "herdr",
        label: "herdr",
        needsInput: 1,
      },
    ],
    workspacesTruncated: true,
  },
  {
    agentCount: 0,
    enabled: false,
    id: "machine-archive",
    label: "Archive",
    needsInput: 0,
    selected: false,
    session: "default",
    status: "disabled" as const,
    workspaceCount: 0,
    workspaces: [],
    workspacesTruncated: false,
  },
];

const machineCatalog: SavedMachineListResult = {
  machineCount: 17,
  machines,
  machinesTruncated: true,
  type: "machine_list",
};

const emptyMachineCatalog: SavedMachineListResult = {
  machineCount: 0,
  machines: [],
  machinesTruncated: false,
  type: "machine_list",
};

describe("MachineFleet", () => {
  test("shows loading and empty states while checking saved machines", async () => {
    let resolveLoad: (value: SavedMachineListResult) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<SavedMachineListResult>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    render(<MachineFleet load={load} open />);

    expect(screen.getByRole("button", { name: /Reload/ })).toBeDisabled();
    resolveLoad(emptyMachineCatalog);

    expect(await screen.findByText(/No saved SSH machines/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Reload/ })).toBeEnabled();
  });

  test("shows online attention details and disabled saved machines", async () => {
    render(
      <MachineFleet load={vi.fn().mockResolvedValue(machineCatalog)} open />,
    );

    const fleet = await screen.findByRole("region", {
      name: "Saved SSH machines",
    });
    const build = within(fleet).getByText("Build machine").closest("article");
    if (!build) throw new Error("Missing build machine card");
    expect(fleet).toHaveTextContent("Showing the first 2 of 17 saved machines");
    expect(build).toHaveTextContent("Online");
    expect(build).toHaveTextContent("65 Spaces · showing 1");
    expect(build).toHaveTextContent("33 Agents · showing 2");
    expect(build).toHaveTextContent("1 need input");
    expect(build).toHaveTextContent("Muse review");
    expect(build).toHaveTextContent("blocked");
    expect(fleet).toHaveTextContent("Archive");
    expect(fleet).toHaveTextContent("This saved machine is disabled");
  });

  test("reloads summaries and reports failures without stale content", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(machineCatalog)
      .mockRejectedValueOnce(new Error("Herdr machine forwarding unavailable"));
    const user = userEvent.setup();
    render(<MachineFleet load={load} open />);

    expect(await screen.findByText("Build machine")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Reload/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Herdr machine forwarding unavailable",
    );
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls).toEqual([[false], [true]]);
  });
});
