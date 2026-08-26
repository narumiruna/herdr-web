import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RuntimeManagementDialog } from "../src/components/RuntimeManagementDialog";

const management = {
  actions: [
    {
      action_id: "example.board.refresh",
      description: "Refresh the board",
      plugin_id: "example.board",
      title: "Refresh board",
    },
  ],
  logs: [
    {
      action_id: "example.board.refresh",
      error: "launch failed",
      log_id: "log-1",
      plugin_id: "example.board",
      started_unix_ms: 1_780_000_000_000,
      status: "succeeded",
      stderr: "warning output",
      stdout: "success output",
    },
  ],
  plugins: [
    {
      enabled: true,
      name: "Example board",
      plugin_id: "example.board",
      version: "1.0.0",
      warnings: [],
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("RuntimeManagementDialog", () => {
  test("loads plugins and routes plugin and integration mutations", async () => {
    const load = vi.fn().mockResolvedValue(management);
    const invoke = vi.fn().mockResolvedValue(undefined);
    const manageIntegration = vi.fn().mockResolvedValue(undefined);
    const setEnabled = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <RuntimeManagementDialog
        open
        onOpenChange={vi.fn()}
        load={load}
        onInvokePluginAction={invoke}
        onManageIntegration={manageIntegration}
        onSetPluginEnabled={setEnabled}
      />,
    );

    expect(await screen.findByText("Example board")).toBeVisible();
    const pluginLog = screen
      .getByText("example.board.refresh")
      .closest("article") as HTMLElement;
    expect(pluginLog).toHaveTextContent("launch failed");
    expect(pluginLog).toHaveTextContent("warning output");
    expect(pluginLog).toHaveTextContent("success output");

    await user.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(setEnabled).toHaveBeenCalledWith("example.board", false),
    );

    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("example.board.refresh"),
    );

    const qwen = screen
      .getByText("Qwen Code")
      .closest("article") as HTMLElement;
    await user.click(
      within(qwen).getByRole("button", { name: "Install / repair" }),
    );
    await waitFor(() =>
      expect(manageIntegration).toHaveBeenCalledWith("qwen", "install"),
    );
  });

  test("keeps an in-flight plugin action pending across dialog visibility changes", async () => {
    let resolveInvoke!: () => void;
    const invocation = new Promise<void>((resolve) => {
      resolveInvoke = resolve;
    });
    const load = vi.fn().mockResolvedValue(management);
    const invoke = vi.fn(() => invocation);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const dialog = (open: boolean) => (
      <RuntimeManagementDialog
        open={open}
        onOpenChange={vi.fn()}
        load={load}
        onInvokePluginAction={invoke}
        onManageIntegration={vi.fn()}
        onSetPluginEnabled={vi.fn()}
      />
    );
    const { rerender } = render(dialog(true));

    expect(await screen.findByText("Example board")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(invoke).toHaveBeenCalledTimes(1);

    rerender(dialog(false));
    expect(screen.queryByRole("dialog", { name: "Herdr runtime" })).toBeNull();
    rerender(dialog(true));

    const run = await screen.findByRole("button", { name: "Run" });
    expect(run).toBeDisabled();
    await user.click(run);
    expect(invoke).toHaveBeenCalledTimes(1);

    resolveInvoke();
    await waitFor(() => expect(run).toBeEnabled());
  });
});
