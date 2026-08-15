import * as Tooltip from "@radix-ui/react-tooltip";
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import {
  type ComposerDraft,
  EMPTY_COMPOSER_DRAFT,
  TerminalWorkspace,
} from "../src/components/TerminalWorkspace";
import {
  type Agent,
  createDemoState,
  type PaneSplitDirection,
} from "../src/state";
import { HerdrMutationError } from "../src/use-herdr-runtime";

vi.mock("../src/components/InteractiveTerminal", () => ({
  InteractiveTerminal: ({ paneId }: { paneId: string }) => (
    <div data-testid={`interactive-${paneId}`} />
  ),
}));

function demoAgent(): Agent {
  const agent = createDemoState().agents.find(
    ({ id }) => id === "agent-review",
  );
  if (!agent) throw new Error("Missing demo Agent");
  return structuredClone(agent);
}

interface HarnessProps {
  actionsEnabled?: boolean;
  agent?: Agent;
  onMessage?: (
    message: string,
    image?: File,
    uploadedPath?: string,
  ) => Promise<{ uploadedPath?: string }>;
  onResizePanes?: (ratio: number) => void | Promise<void>;
  onRetryOutput?: () => void;
  onSelectPane?: (paneId: string) => void;
  onSplitPane?: (direction: PaneSplitDirection) => void | Promise<void>;
  terminalStreaming?: boolean;
}

function Harness({
  actionsEnabled = true,
  agent = demoAgent(),
  onMessage = async () => ({}),
  onResizePanes = () => undefined,
  onRetryOutput = () => undefined,
  onSelectPane = () => undefined,
  onSplitPane = () => undefined,
  terminalStreaming = false,
}: HarnessProps) {
  const [drafts, setDrafts] = useState<Record<string, ComposerDraft>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const draft = drafts[agent.id] ?? EMPTY_COMPOSER_DRAFT;

  return (
    <Theme>
      <Tooltip.Provider>
        <TerminalWorkspace
          actionsEnabled={actionsEnabled}
          agent={agent}
          createTerminalTicket={async () => ({
            expiresAt: Date.now() + 30_000,
            path: "/api/herdr/terminal",
            ticket: "test-ticket",
            type: "terminal_ticket",
          })}
          draft={draft}
          isSending={sending[agent.id] === true}
          workspace={createDemoState().workspaces[0]}
          onClearDraft={(agentId) =>
            setDrafts((current) => ({
              ...current,
              [agentId]: EMPTY_COMPOSER_DRAFT,
            }))
          }
          onDraftChange={(agentId, update) =>
            setDrafts((current) => ({
              ...current,
              [agentId]: {
                ...(current[agentId] ?? EMPTY_COMPOSER_DRAFT),
                ...update,
              },
            }))
          }
          onMessage={onMessage}
          onResizePanes={onResizePanes}
          onRetryOutput={onRetryOutput}
          onSendingChange={(agentId, value) =>
            setSending((current) => ({ ...current, [agentId]: value }))
          }
          onSplitPane={onSplitPane}
          onTerminalFontSizeChange={() => undefined}
          onSelectPane={onSelectPane}
          onClosePane={() => undefined}
          onUploadImage={async () => ({
            mediaType: "image/png",
            path: "/home/user/.herdr-web/uploads/test.png",
            size: 1,
            type: "image_uploaded",
          })}
          terminalControlEnabled
          terminalEnabled
          terminalFontSize={13}
          terminalReason="This bridge is configured for snapshots only."
          terminalStreaming={terminalStreaming}
        />
      </Tooltip.Provider>
    </Theme>
  );
}

describe("TerminalWorkspace decision states", () => {
  test("replaces disabled Agent controls with a compact read-only terminal bar", () => {
    const agent = demoAgent();
    agent.kind = "terminal";
    agent.canPrompt = false;
    agent.status = "unknown";

    render(<Harness agent={agent} />);

    expect(
      screen.getByText("Read-only terminal").closest('[role="note"]'),
    ).toHaveTextContent("Read-only terminal");
    expect(
      screen.queryByRole("form", { name: "Message composer" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Send message" }),
    ).not.toBeInTheDocument();
  });

  test("does not submit Enter while an input method editor is composing", async () => {
    const onMessage = vi.fn(async () => ({}));
    render(<Harness onMessage={onMessage} />);
    const textbox = screen.getByRole("textbox", { name: "Message api-review" });

    await userEvent.setup().type(textbox, "決定");
    fireEvent.keyDown(textbox, { key: "Enter", isComposing: true });
    expect(onMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(textbox, { key: "Enter", isComposing: false });
    await waitFor(() =>
      expect(onMessage).toHaveBeenCalledWith("決定", undefined, undefined),
    );
  });

  test("keeps one attachment and explains how to replace it", () => {
    render(<Harness />);
    const first = new File(["png"], "first.png", { type: "image/png" });
    const second = new File(["png"], "second.png", { type: "image/png" });

    fireEvent.paste(window, { clipboardData: { files: [first], items: [] } });
    fireEvent.paste(window, { clipboardData: { files: [second], items: [] } });

    expect(screen.getByText("first.png")).toBeVisible();
    expect(screen.queryByText("second.png")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Remove the current image before attaching another.",
    );
  });

  test("shows partial pane read failures without hiding recovery", async () => {
    const agent = demoAgent();
    agent.panes[0] = {
      ...agent.panes[0],
      lines: [],
      outputError: "socket read failed",
      outputState: "unavailable",
    };
    const onRetryOutput = vi.fn();
    render(<Harness agent={agent} onRetryOutput={onRetryOutput} />);

    expect(
      screen.getByText("Terminal output is temporarily unavailable."),
    ).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Retry output" }));
    expect(onRetryOutput).toHaveBeenCalledOnce();
  });

  test("moves keyboard focus and active pane state with arrow keys", async () => {
    const agent = demoAgent();
    agent.panes.push({
      command: "zsh",
      id: "pane-shell",
      lines: ["$ pwd"],
      title: "shell",
    });
    const onSelectPane = vi.fn();
    render(<Harness agent={agent} onSelectPane={onSelectPane} />);
    const first = screen.getByRole("button", { name: /Focus claude/ });
    const second = screen.getByRole("button", { name: "Focus shell pane" });

    first.focus();
    await userEvent.setup().keyboard("{ArrowRight}");

    expect(second).toHaveFocus();
    expect(onSelectPane).toHaveBeenLastCalledWith("pane-shell");
  });

  test("offers Herdr's split right and split down directions", async () => {
    const onSplitPane = vi.fn();
    render(<Harness onSplitPane={onSplitPane} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Split pane" }));
    expect(screen.getByRole("menuitem", { name: "Split right" })).toBeVisible();
    await user.click(screen.getByRole("menuitem", { name: "Split down" }));

    expect(onSplitPane).toHaveBeenCalledWith("down");
  });

  test("previews and commits a pane ratio with mouse dragging", async () => {
    const agent = demoAgent();
    agent.panes.push({
      command: "zsh",
      id: "pane-shell",
      lines: ["$ pwd"],
      title: "shell",
    });
    agent.paneSplit = { direction: "right", ratio: 0.5 };
    const onResizePanes = vi.fn();
    render(<Harness agent={agent} onResizePanes={onResizePanes} />);
    const separator = screen.getByRole("separator", {
      name: "Resize terminal panes",
    });
    const grid = separator.parentElement;
    if (!grid) throw new Error("Missing pane grid");
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 1_000,
      top: 0,
      width: 1_000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(separator, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 496,
      right: 504,
      top: 0,
      width: 8,
      x: 496,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientX: 500,
      pointerId: 1,
    });
    fireEvent.pointerMove(separator, { clientX: 700, pointerId: 1 });
    fireEvent.pointerUp(separator, { clientX: 700, pointerId: 1 });

    await waitFor(() => expect(onResizePanes).toHaveBeenCalledOnce());
    expect(onResizePanes.mock.calls[0]?.[0]).toBeCloseTo(0.702, 2);
  });

  test("resizes a pane separator from the keyboard", async () => {
    const agent = demoAgent();
    agent.panes.push({
      command: "zsh",
      id: "pane-shell",
      lines: ["$ pwd"],
      title: "shell",
    });
    agent.paneSplit = { direction: "down", ratio: 0.5 };
    const onResizePanes = vi.fn();
    render(<Harness agent={agent} onResizePanes={onResizePanes} />);
    const separator = screen.getByRole("separator", {
      name: "Resize terminal panes",
    });

    separator.focus();
    await userEvent.setup().keyboard("{ArrowDown}");

    expect(onResizePanes).toHaveBeenCalledWith(0.55);
    expect(separator).toHaveAttribute("aria-orientation", "horizontal");
  });

  test("keeps both interactive terminals visible around the resize handle", () => {
    const agent = demoAgent();
    agent.panes.push({
      command: "zsh",
      id: "pane-shell",
      lines: [],
      title: "shell",
    });
    agent.paneSplit = { direction: "right", ratio: 0.6 };

    render(<Harness agent={agent} terminalStreaming />);

    expect(
      screen.getByTestId(`interactive-${agent.panes[0]?.id}`),
    ).toBeVisible();
    expect(screen.getByTestId("interactive-pane-shell")).toBeVisible();
    expect(
      screen.getByRole("separator", { name: "Resize terminal panes" }),
    ).toHaveAttribute("aria-valuenow", "60");
  });

  test("toggles pane focus mode without mutating the Herdr split", async () => {
    const agent = demoAgent();
    agent.panes.push({
      command: "zsh",
      id: "pane-shell",
      lines: ["$ pwd"],
      title: "shell",
    });
    agent.paneSplit = { direction: "right", ratio: 0.6 };
    render(<Harness agent={agent} />);
    const user = userEvent.setup();

    await user.click(
      screen.getAllByRole("button", { name: "Focus this pane" })[0],
    );

    expect(screen.getByRole("main")).toHaveAttribute("data-focus-mode", "true");
    expect(
      screen.queryByRole("separator", { name: "Resize terminal panes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "shell terminal" }),
    ).not.toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-focus-mode",
      "false",
    );
    expect(
      screen.getByRole("separator", { name: "Resize terminal panes" }),
    ).toHaveAttribute("aria-valuenow", "60");
  });

  test("restores the confirmed pane ratio when Herdr rejects a resize", async () => {
    const agent = demoAgent();
    agent.panes.push({
      command: "zsh",
      id: "pane-shell",
      lines: ["$ pwd"],
      title: "shell",
    });
    agent.paneSplit = { direction: "right", ratio: 0.5 };
    const onResizePanes = vi.fn().mockRejectedValue(new Error("rejected"));
    render(<Harness agent={agent} onResizePanes={onResizePanes} />);
    const separator = screen.getByRole("separator", {
      name: "Resize terminal panes",
    });

    separator.focus();
    await userEvent.setup().keyboard("{ArrowRight}");

    await waitFor(() =>
      expect(separator).toHaveAttribute("aria-valuenow", "50"),
    );
    expect(onResizePanes).toHaveBeenCalledWith(0.55);
  });

  test("uses a keyboard-accessible pane selector for externally-created extra panes", async () => {
    const agent = demoAgent();
    agent.panes.push(
      { command: "zsh", id: "pane-two", lines: ["two"], title: "two" },
      { command: "zsh", id: "pane-three", lines: ["three"], title: "three" },
    );
    const onSelectPane = vi.fn();
    render(<Harness agent={agent} onSelectPane={onSelectPane} />);

    const paneTabs = screen.getByRole("tablist", { name: "Session panes" });
    expect(paneTabs.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(
      screen.getByRole("region", { name: /claude · API review terminal/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "two terminal" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "three terminal" }),
    ).not.toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    tabs[0]?.focus();
    await userEvent.setup().keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveFocus();
    expect(onSelectPane).toHaveBeenLastCalledWith("pane-two");
  });

  test("keeps uploaded image paths when an uncertain delivery is sent again", async () => {
    const onMessage = vi
      .fn()
      .mockRejectedValueOnce(
        new HerdrMutationError(
          "Failed to fetch",
          "unknown",
          "/repo/upload.png",
        ),
      )
      .mockResolvedValueOnce({ uploadedPath: "/repo/upload.png" });
    render(<Harness onMessage={onMessage} />);
    const image = new File(["png"], "prompt.png", { type: "image/png" });
    fireEvent.paste(window, { clipboardData: { files: [image], items: [] } });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Send message" }));
    expect(
      await screen.findByRole("alert", { name: "Message failed" }),
    ).toHaveTextContent("Check the terminal");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Send message again" }));

    await waitFor(() => expect(onMessage).toHaveBeenCalledTimes(2));
    expect(onMessage.mock.calls[1]).toEqual(["", image, "/repo/upload.png"]);
  });
});
