import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SessionDetails } from "../src/components/SessionDetails";
import { type Agent, createDemoState } from "../src/state";

function fixture() {
  const state = createDemoState();
  const agent = structuredClone(state.agents[0]);
  const workspace = state.workspaces[0];
  return { agent, workspace };
}

function details(agent: Agent, workspace = fixture().workspace) {
  return (
    <SessionDetails
      agent={agent}
      workspace={workspace}
      connection="connected"
    />
  );
}

const originalExecCommand = Object.getOwnPropertyDescriptor(
  document,
  "execCommand",
);
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalExecCommand) {
    Object.defineProperty(document, "execCommand", originalExecCommand);
  } else {
    Reflect.deleteProperty(document, "execCommand");
  }
});

describe("SessionDetails", () => {
  test("copies the exact selected pane directory and updates on pane selection", async () => {
    const { agent, workspace } = fixture();
    const path = "/repo/long project/linked worktree/src";
    agent.panes.push({
      id: "second",
      title: "Shell",
      command: "zsh",
      cwd: path,
      lines: [],
    });
    agent.activePaneId = "second";
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { rerender } = render(details(agent, workspace));

    expect(screen.getByText(path)).toHaveTextContent(path);
    expect(
      screen.getByText("Focused pane").nextElementSibling,
    ).toHaveTextContent("Shell");
    expect(screen.getByText("Command").nextElementSibling).toHaveTextContent(
      "zsh",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copy current working directory" }),
    );
    expect(writeText).toHaveBeenCalledWith(path);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Current working directory copied",
    );

    agent.panes[0].cwd = "/repo/other";
    agent.activePaneId = agent.panes[0].id;
    rerender(details({ ...agent }, workspace));
    expect(screen.getByText("/repo/other")).toBeVisible();
    expect(
      screen.queryByText("Current working directory copied"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy current working directory" }),
    );
    expect(writeText).toHaveBeenLastCalledWith("/repo/other");
  });

  test("does not let an old copy result replace the selected Agent's result", async () => {
    const { agent, workspace } = fixture();
    let rejectFirst: ((error: Error) => void) | undefined;
    const writeText = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { rerender } = render(details(agent, workspace));
    fireEvent.click(
      screen.getByRole("button", { name: "Copy current working directory" }),
    );
    rerender(details({ ...agent, id: "other-agent" }, workspace));
    fireEvent.click(
      screen.getByRole("button", { name: "Copy current working directory" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Current working directory copied",
    );
    rejectFirst?.(new Error("Old request failed"));
    await Promise.resolve();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Current working directory copied",
    );
  });

  test("uses the workspace directory when pane metadata is absent", async () => {
    const { agent, workspace } = fixture();
    agent.panes = [];
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(details(agent, workspace));
    expect(screen.getByText(workspace.path)).toBeVisible();
    expect(
      screen.getByText("Focused pane").nextElementSibling,
    ).toHaveTextContent("Unavailable");
    expect(screen.getByText("Panes").nextElementSibling).toHaveTextContent("0");
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy current working directory" }),
    );
    expect(writeText).toHaveBeenCalledWith(workspace.path);
  });

  test("falls back to the first pane if the selected pane no longer exists", () => {
    const { agent } = fixture();
    agent.activePaneId = "removed";
    agent.panes[0].cwd = "/repo/first";
    render(details(agent));
    expect(screen.getByText("/repo/first")).toBeVisible();
    expect(
      screen.getByText("Focused pane").nextElementSibling,
    ).toHaveTextContent(agent.panes[0].title);
  });

  test("reports clipboard rejection without an unhandled error", async () => {
    const { agent } = fixture();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    render(details(agent));
    fireEvent.click(
      screen.getByRole("button", { name: "Copy current working directory" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The current directory could not be copied.",
    );
    expect(
      screen.queryByText("Current working directory copied"),
    ).not.toBeInTheDocument();
  });

  test.each([false, true])(
    "handles legacy copy result %s and restores focus",
    async (success) => {
      const { agent, workspace } = fixture();
      vi.stubGlobal("navigator", {});
      let copiedText = "";
      const execCommand = vi.fn(() => {
        const fallback = document.querySelector("textarea");
        expect(fallback?.closest(".details-panel")).not.toBeNull();
        copiedText = fallback?.value ?? "";
        return success;
      });
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: execCommand,
      });
      const { container } = render(details(agent, workspace));
      const copy = screen.getByRole("button", {
        name: "Copy current working directory",
      });
      copy.focus();
      fireEvent.click(copy);
      if (success) {
        expect(await screen.findByRole("status")).toHaveTextContent(
          "Current working directory copied",
        );
      } else {
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "could not be copied",
        );
      }
      expect(copiedText).toBe(agent.panes[0].cwd || workspace.path);
      expect(execCommand).toHaveBeenCalledWith("copy");
      expect(container.ownerDocument.querySelector("textarea")).toBeNull();
      expect(copy).toHaveFocus();
    },
  );

  test.each([0, 31, 100])(
    "shows valid context percentage %s",
    (contextPercent) => {
      const { agent } = fixture();
      agent.contextPercent = contextPercent;
      agent.runtime = "Claude";
      agent.model = "Sonnet";
      render(details(agent));
      expect(screen.getByText("Runtime").nextElementSibling).toHaveTextContent(
        "Claude",
      );
      expect(screen.getByText("Model").nextElementSibling).toHaveTextContent(
        "Sonnet",
      );
      expect(screen.getByText("Context").nextElementSibling).toHaveTextContent(
        `${contextPercent}%`,
      );
      expect(screen.queryByText("Branch")).not.toBeInTheDocument();
    },
  );

  test.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 101])(
    "omits unavailable context percentage %s",
    (contextPercent) => {
      const { agent, workspace } = fixture();
      agent.contextPercent = contextPercent;
      agent.runtime = "";
      agent.model = "";
      agent.panes = [];
      workspace.path = "";
      render(details(agent, workspace));
      expect(screen.queryByText("Context")).not.toBeInTheDocument();
      expect(screen.queryByText("Runtime")).not.toBeInTheDocument();
      expect(screen.queryByText("Model")).not.toBeInTheDocument();
      expect(screen.queryByText("Current directory")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Copy current working directory",
        }),
      ).not.toBeInTheDocument();
    },
  );

  test("does not show Agent context for standalone terminals with a dummy zero", () => {
    const { agent } = fixture();
    agent.kind = "terminal";
    agent.contextPercent = 0;
    render(details(agent));
    expect(screen.queryByText("Context")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  test("does not repeat a model that is the runtime name", () => {
    const { agent } = fixture();
    agent.model = agent.runtime;
    render(details(agent));
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
  });
});
