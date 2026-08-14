import * as Tooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import {
  type ComposerDraft,
  EMPTY_COMPOSER_DRAFT,
  TerminalWorkspace,
} from "../src/components/TerminalWorkspace";
import { type Agent, createDemoState } from "../src/state";
import { HerdrMutationError } from "../src/use-herdr-runtime";

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
  onRetryOutput?: () => void;
  onSelectPane?: (paneId: string) => void;
}

function Harness({
  actionsEnabled = true,
  agent = demoAgent(),
  onMessage = async () => ({}),
  onRetryOutput = () => undefined,
  onSelectPane = () => undefined,
}: HarnessProps) {
  const [drafts, setDrafts] = useState<Record<string, ComposerDraft>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const draft = drafts[agent.id] ?? EMPTY_COMPOSER_DRAFT;

  return (
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
        onRetryOutput={onRetryOutput}
        onSendingChange={(agentId, value) =>
          setSending((current) => ({ ...current, [agentId]: value }))
        }
        onSplitPane={() => undefined}
        onSelectPane={onSelectPane}
        onClosePane={() => undefined}
        onUploadImage={async () => ({
          mediaType: "image/png",
          path: "/repo/.hedr/uploads/test.png",
          size: 1,
          type: "image_uploaded",
        })}
        terminalControlEnabled
        terminalEnabled
        terminalReason="This bridge is configured for snapshots only."
        terminalStreaming={false}
      />
    </Tooltip.Provider>
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
