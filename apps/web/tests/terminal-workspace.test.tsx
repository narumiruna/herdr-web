import * as Tooltip from "@radix-ui/react-tooltip";
import { Theme } from "@radix-ui/themes";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownMenu } from "radix-ui";
import { type ReactNode, useState } from "react";
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
  InteractiveTerminal: ({
    paneId,
    toolbarContext,
    overflowActions,
  }: {
    paneId: string;
    toolbarContext: ReactNode;
    overflowActions: ReactNode;
  }) => (
    <div data-testid={`interactive-${paneId}`}>
      {toolbarContext}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>More terminal actions</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>{overflowActions}</DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  ),
}));

function demoAgent(): Agent {
  const agent = createDemoState().agents.find(
    ({ id }) => id === "agent-review",
  );
  if (!agent) throw new Error("Missing demo Agent");
  return structuredClone(agent);
}

function deferredMutation() {
  let reject = (_error: Error) => {};
  const promise = new Promise<void>((_resolve, decline) => {
    reject = decline;
  });
  return { promise, reject };
}

interface HarnessProps {
  actionsEnabled?: boolean;
  agent?: Agent;
  onMessage?: (
    message: string,
    image?: File,
    uploadedPath?: string,
  ) => Promise<{ uploadedPath?: string }>;
  onClosePane?: (paneId: string) => void | Promise<void>;
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
  onClosePane = () => undefined,
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
          onClosePane={onClosePane}
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

describe("TerminalWorkspace snapshot frames", () => {
  test("groups contiguous frame rows without merging prose or separate frames", () => {
    const agent = demoAgent();
    const frame = ["╭──────────╮", "│ content  │", "╰──────────╯"];
    agent.panes[0].lines = [
      ...frame,
      "Plain output between frames",
      "",
      ...frame,
      "● Read src/state.ts",
    ];
    const { container } = render(<Harness agent={agent} />);

    const frames = container.querySelectorAll(".terminal-frame");
    expect(frames).toHaveLength(2);
    for (const element of frames) {
      expect(element.textContent).toBe(frame.join("\n"));
    }
    expect(screen.getByText("Plain output between frames")).toBeVisible();
    expect(container.querySelector(".terminal-action")).toHaveTextContent(
      "● Read src/state.ts",
    );
  });

  test("keeps adjacent frames in separate accessible scroll regions", () => {
    const agent = demoAgent();
    const frame = ["╭──────────╮", "│ content  │", "╰──────────╯"];
    agent.panes[0].lines = [...frame, ...frame];
    render(<Harness agent={agent} />);

    const frames = screen.getAllByRole("region", { name: "Terminal frame" });
    expect(frames).toHaveLength(2);
    for (const element of frames) {
      expect(element.textContent).toBe(frame.join("\n"));
      expect(element).toHaveAttribute("tabindex", "0");
    }
  });

  test("preserves adjacent frame containers as a second frame arrives", () => {
    const agent = demoAgent();
    const rows = ["╭──────────╮", "│ content  │", "╰──────────╯"];
    agent.panes[0].lines = [...rows];
    const { rerender } = render(<Harness agent={agent} />);
    const first = screen.getByRole("region", { name: "Terminal frame" });
    first.scrollLeft = 20;

    const updated = structuredClone(agent);
    updated.panes[0].lines.push(rows[0]);
    rerender(<Harness agent={updated} />);
    const frames = screen.getAllByRole("region", { name: "Terminal frame" });
    expect(frames).toHaveLength(2);
    expect(frames[0]).toBe(first);
    const second = frames[1];

    updated.panes[0].lines.push(...rows.slice(1));
    rerender(<Harness agent={structuredClone(updated)} />);
    const completed = screen.getAllByRole("region", { name: "Terminal frame" });
    expect(completed).toHaveLength(2);
    expect(completed[0]).toBe(first);
    expect(completed[1]).toBe(second);
    expect(first.textContent).toBe(rows.join("\n"));
    expect(second?.textContent).toBe(rows.join("\n"));
    expect(first.scrollLeft).toBe(20);
    expect(second?.scrollLeft).toBe(0);
  });

  test("preserves a frame container when output appends another frame row", () => {
    const agent = demoAgent();
    agent.panes[0].lines = ["╭──────────╮", "│ content  │"];
    const { container, rerender } = render(<Harness agent={agent} />);
    const frame = container.querySelector(".terminal-frame");
    expect(frame).not.toBeNull();

    const updated = structuredClone(agent);
    updated.panes[0].lines.push("╰──────────╯", "Next output");
    rerender(<Harness agent={updated} />);

    expect(container.querySelectorAll(".terminal-frame")).toHaveLength(1);
    expect(container.querySelector(".terminal-frame")).toBe(frame);
    expect(frame?.textContent).toBe(
      updated.panes[0].lines.slice(0, 3).join("\n"),
    );
    expect(screen.getByText("Next output")).toBeVisible();
  });
});

describe("TerminalWorkspace decision states", () => {
  test("exposes branch text without action semantics and discloses pane actions", async () => {
    render(<Harness />);

    const branch = screen.getByTitle("Branch: feat/web-bridge");
    expect(branch.tagName).toBe("CODE");
    expect(branch).not.toHaveAttribute("role", "button");
    expect(branch).not.toHaveAttribute("tabindex");
    expect(branch).toHaveTextContent("Branch: feat/web-bridge");

    expect(
      screen.queryByRole("button", { name: "Copy current working directory" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Split pane" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Current working directory:/),
    ).not.toBeInTheDocument();
    const more = screen.getByRole("button", { name: "More terminal actions" });
    more.focus();
    expect(
      await screen.findByRole("tooltip", { name: "More terminal actions" }),
    ).toBeVisible();
    await userEvent.setup().keyboard("{Enter}");
    expect(
      screen.getByRole("menuitem", { name: "Focus this pane" }),
    ).toHaveFocus();
    expect(screen.getByRole("menuitem", { name: "Split right" })).toBeVisible();
  });

  test("prefers clipboard files, falls back to items, and leaves text paste alone", () => {
    render(<Harness />);
    const first = new File(["png"], "first.png", { type: "image/png" });
    const second = new File(["png"], "second.png", { type: "image/png" });
    expect(
      fireEvent.paste(window, {
        clipboardData: {
          files: [],
          items: [{ kind: "string", type: "text/plain" }],
        },
      }),
    ).toBe(true);
    fireEvent.paste(window, {
      clipboardData: {
        files: [first],
        items: [{ kind: "file", type: second.type, getAsFile: () => second }],
      },
    });
    expect(screen.getByText("first.png")).toBeVisible();
    expect(screen.queryByText("second.png")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove first.png" }));
    fireEvent.paste(window, {
      clipboardData: {
        files: [],
        items: [{ kind: "file", type: second.type, getAsFile: () => second }],
      },
    });
    expect(screen.getByText("second.png")).toBeVisible();
  });

  test.each([
    ["image/svg+xml", "content", "Choose a PNG, JPEG, GIF, or WebP image."],
    ["image/png", "", "Image size must be between 1 byte and 8 MiB."],
  ])("preserves validation for %s attachments", (type, contents, error) => {
    render(<Harness />);
    fireEvent.paste(window, {
      clipboardData: {
        files: [new File([contents], "invalid", { type })],
        items: [],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(error);
  });

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

  test("directs blocked Agents to an available input path", () => {
    const fallbackAgent = demoAgent();
    fallbackAgent.status = "blocked";
    fallbackAgent.canPrompt = true;
    fallbackAgent.currentStep = "";
    const { rerender } = render(<Harness agent={fallbackAgent} />);
    const banner = () =>
      screen.getByRole("region", { name: "Agent needs input" });

    expect(banner()).toHaveTextContent("Answer with the composer");
    expect(
      screen.getByRole("form", { name: "Message composer" }),
    ).toBeVisible();

    const interactiveAgent = { ...fallbackAgent, canPrompt: false };
    rerender(<Harness agent={interactiveAgent} terminalStreaming />);
    expect(banner()).toHaveTextContent("Answer in the terminal");

    rerender(<Harness agent={interactiveAgent} />);
    expect(banner()).toHaveTextContent("Open a native Herdr client");
    expect(banner()).toHaveTextContent(
      "Browser input is unavailable for this snapshot-only session.",
    );
    expect(
      screen.queryByRole("form", { name: "Message composer" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Interactive unavailable")).toBeVisible();
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

    await user.click(
      screen.getByRole("button", { name: "More terminal actions" }),
    );
    expect(screen.getByRole("menuitem", { name: "Split right" })).toBeVisible();
    await user.click(screen.getByRole("menuitem", { name: "Split down" }));

    expect(onSplitPane).toHaveBeenCalledWith("down");
  });

  test("keeps pane mutations unavailable with viewer access", async () => {
    const onSplitPane = vi.fn();
    render(<Harness actionsEnabled={false} onSplitPane={onSplitPane} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "More terminal actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Split right" }),
    ).toHaveAttribute("data-disabled");
    expect(
      screen.getByRole("menuitem", { name: "Split down" }),
    ).toHaveAttribute("data-disabled");
    expect(
      screen.getByRole("menuitem", { name: "Focus this pane" }),
    ).not.toHaveAttribute("data-disabled");
    expect(onSplitPane).not.toHaveBeenCalled();
  });

  test("shows uncertain split failures without offering an automatic retry", async () => {
    const onSplitPane = vi
      .fn()
      .mockRejectedValue(new HerdrMutationError("Network lost", "unknown"));
    render(<Harness onSplitPane={onSplitPane} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "More terminal actions" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Split right" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The split result could not be confirmed. Refresh before trying again.",
    );
    expect(onSplitPane).toHaveBeenCalledOnce();
  });

  test.each(["rejected", "unknown"] as const)(
    "keeps a deferred %s split failure with its originating Agent",
    async (outcome) => {
      const first = demoAgent();
      const second = { ...demoAgent(), id: "second-agent" };
      const pending = deferredMutation();
      const onSplitPane = vi.fn(() => pending.promise);
      const { rerender } = render(
        <Harness agent={first} onSplitPane={onSplitPane} terminalStreaming />,
      );
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", { name: "More terminal actions" }),
      );
      await user.click(screen.getByRole("menuitem", { name: "Split right" }));
      const terminal = screen.getByTestId(`interactive-${first.panes[0].id}`);

      rerender(
        <Harness agent={second} onSplitPane={onSplitPane} terminalStreaming />,
      );
      await act(async () => {
        pending.reject(new HerdrMutationError("Split rejected", outcome));
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTestId(`interactive-${first.panes[0].id}`)).toBe(
        terminal,
      );

      rerender(
        <Harness agent={first} onSplitPane={onSplitPane} terminalStreaming />,
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(
        outcome === "unknown"
          ? "The split result could not be confirmed. Refresh before trying again."
          : "Split rejected",
      );
      expect(alert.querySelector("button")).toBeNull();
      expect(onSplitPane).toHaveBeenCalledOnce();
      expect(screen.getByTestId(`interactive-${first.panes[0].id}`)).toBe(
        terminal,
      );
    },
  );

  test("isolates pending resize ratios and deferred failures across Agents", async () => {
    const first = demoAgent();
    first.panes.push({
      id: "shell",
      title: "shell",
      command: "zsh",
      lines: [],
    });
    first.paneSplit = { direction: "right", ratio: 0.5 };
    const second: Agent = {
      ...structuredClone(first),
      id: "second-agent",
      paneSplit: { direction: "right", ratio: 0.7 },
    };
    const firstPending = deferredMutation();
    const secondPending = deferredMutation();
    const onResizeFirst = vi.fn(() => firstPending.promise);
    const onResizeSecond = vi.fn(() => secondPending.promise);
    const view = (agent: Agent, onResizePanes: () => Promise<void>) => (
      <Harness agent={agent} onResizePanes={onResizePanes} terminalStreaming />
    );
    const { rerender } = render(view(first, onResizeFirst));
    const separator = () =>
      screen.getByRole("separator", { name: "Resize terminal panes" });
    const firstTerminal = screen.getByTestId(
      `interactive-${first.panes[0].id}`,
    );
    const secondTerminal = screen.getByTestId("interactive-shell");
    fireEvent.keyDown(separator(), { key: "ArrowRight" });
    expect(separator()).toHaveAttribute("aria-valuenow", "55");
    expect(separator()).toHaveAttribute("aria-disabled", "true");

    rerender(view(second, onResizeSecond));
    expect(separator()).toHaveAttribute("aria-valuenow", "70");
    expect(separator()).toHaveAttribute("aria-disabled", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(view(first, onResizeFirst));
    expect(separator()).toHaveAttribute("aria-valuenow", "55");
    expect(separator()).toHaveAttribute("aria-disabled", "true");
    rerender(view(second, onResizeSecond));
    fireEvent.keyDown(separator(), { key: "ArrowRight" });
    expect(separator()).toHaveAttribute("aria-valuenow", "75");
    expect(separator()).toHaveAttribute("aria-disabled", "true");

    await act(async () => {
      firstPending.reject(new HerdrMutationError("Network lost", "unknown"));
    });
    expect(separator()).toHaveAttribute("aria-valuenow", "75");
    expect(separator()).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId(`interactive-${first.panes[0].id}`)).toBe(
      firstTerminal,
    );
    expect(screen.getByTestId("interactive-shell")).toBe(secondTerminal);

    await act(async () => {
      secondPending.reject(new Error("Second resize rejected"));
    });
    expect(separator()).toHaveAttribute("aria-valuenow", "70");
    expect(separator()).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Second resize rejected",
    );

    rerender(view(first, onResizeFirst));
    expect(separator()).toHaveAttribute("aria-valuenow", "50");
    expect(separator()).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The resize result could not be confirmed. Refresh before trying again.",
    );
    expect(screen.getByRole("alert").querySelector("button")).toBeNull();
    expect(onResizeFirst).toHaveBeenCalledOnce();
    expect(onResizeSecond).toHaveBeenCalledOnce();
  });

  test("ends a resize drag on Agent navigation without replacing terminals", () => {
    const first = demoAgent();
    first.panes.push({
      id: "shell",
      title: "shell",
      command: "zsh",
      lines: [],
    });
    first.paneSplit = { direction: "right", ratio: 0.5 };
    const second: Agent = {
      ...structuredClone(first),
      id: "second-agent",
      paneSplit: { direction: "right", ratio: 0.7 },
    };
    const onResizePanes = vi.fn();
    const { rerender } = render(
      <Harness agent={first} onResizePanes={onResizePanes} terminalStreaming />,
    );
    const terminal = screen.getByTestId("interactive-shell");
    fireEvent.pointerDown(
      screen.getByRole("separator", { name: "Resize terminal panes" }),
      { button: 0, clientX: 0, pointerId: 1 },
    );
    expect(terminal.closest(".pane-grid")).toHaveAttribute(
      "data-resizing",
      "true",
    );
    rerender(
      <Harness
        agent={second}
        onResizePanes={onResizePanes}
        terminalStreaming
      />,
    );
    const separator = screen.getByRole("separator", {
      name: "Resize terminal panes",
    });
    expect(separator).toHaveAttribute("aria-valuenow", "70");
    expect(separator).toHaveAttribute("aria-disabled", "false");
    expect(terminal.closest(".pane-grid")).toHaveAttribute(
      "data-resizing",
      "false",
    );
    fireEvent.pointerUp(separator, { clientX: 0, pointerId: 1 });
    expect(onResizePanes).not.toHaveBeenCalled();
    expect(screen.getByTestId("interactive-shell")).toBe(terminal);
    rerender(
      <Harness agent={first} onResizePanes={onResizePanes} terminalStreaming />,
    );
    expect(
      screen.getByRole("separator", { name: "Resize terminal panes" }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(terminal.closest(".pane-grid")).toHaveAttribute(
      "data-resizing",
      "false",
    );
  });

  test.each([false, true])(
    "keeps close confirmation and uncertain results reachable (streaming: %s)",
    async (terminalStreaming) => {
      const agent = demoAgent();
      agent.panes.push({
        id: "shell",
        title: "shell",
        command: "zsh",
        lines: [],
      });
      const onClosePane = vi
        .fn()
        .mockRejectedValue(new HerdrMutationError("Network lost", "unknown"));
      render(
        <Harness
          agent={agent}
          onClosePane={onClosePane}
          terminalStreaming={terminalStreaming}
        />,
      );
      const user = userEvent.setup();
      await user.click(
        screen.getAllByRole("button", { name: "More terminal actions" })[0],
      );
      expect(
        screen.getByRole("menuitem", { name: "Split right" }),
      ).toHaveAttribute("data-disabled");
      await user.click(
        screen.getByRole("menuitem", {
          name: `Close ${agent.panes[0].title} pane`,
        }),
      );
      const cancel = screen.getByRole("button", { name: "Cancel" });
      expect(cancel).toHaveFocus();
      await user.click(
        screen.getByRole("button", { name: "Confirm close pane" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "The close result could not be confirmed. Refresh before trying again.",
      );
      expect(onClosePane).toHaveBeenCalledWith(agent.panes[0].id);
      await user.click(cancel);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  test("keeps branch only in the active streaming pane without replacing terminals", () => {
    const agent = demoAgent();
    agent.panes[0].cwd = "/repo/first";
    agent.panes.push({
      id: "shell",
      title: "shell",
      command: "zsh",
      cwd: "/repo/second",
      lines: [],
    });
    const { rerender } = render(<Harness agent={agent} terminalStreaming />);
    const first = screen.getByTestId(`interactive-${agent.panes[0].id}`);
    const second = screen.getByTestId("interactive-shell");
    expect(screen.getAllByTitle("Branch: feat/web-bridge")).toHaveLength(1);
    expect(first).toContainElement(
      screen.getByTitle("Branch: feat/web-bridge"),
    );
    expect(screen.queryByText("/repo/first")).not.toBeInTheDocument();
    expect(screen.queryByText("/repo/second")).not.toBeInTheDocument();
    agent.activePaneId = "shell";
    rerender(<Harness agent={{ ...agent }} terminalStreaming />);
    expect(screen.getByTestId(`interactive-${agent.panes[0].id}`)).toBe(first);
    expect(screen.getByTestId("interactive-shell")).toBe(second);
    expect(second).toContainElement(
      screen.getByTitle("Branch: feat/web-bridge"),
    );
    expect(screen.getAllByTitle("Branch: feat/web-bridge")).toHaveLength(1);
    expect(
      screen.getByRole("tablist", { name: "Session panes" }),
    ).toBeVisible();
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
      screen.getByRole("button", { name: "More terminal actions" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Focus this pane" }));

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
    expect(screen.getByRole("alert")).toHaveTextContent("rejected");
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
