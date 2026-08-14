import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { EMPTY_COMPOSER_DRAFT } from "../src/components/TerminalWorkspace";

const xterm = vi.hoisted(() => ({
  instances: [] as Array<{
    data?: (value: string) => void;
    options?: unknown;
    reset: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    private instance: (typeof xterm.instances)[number] = {
      reset: vi.fn(),
      write: vi.fn(),
    };
    constructor(options: unknown) {
      this.instance.options = options;
      xterm.instances.push(this.instance);
    }
    loadAddon() {}
    open() {}
    dispose() {}
    focus() {}
    hasSelection() {
      return false;
    }
    getSelection() {
      return "";
    }
    reset = this.instance.reset;
    write = this.instance.write;
    onData(callback: (value: string) => void) {
      this.instance.data = callback;
      return { dispose() {} };
    }
    onResize() {
      return { dispose() {} };
    }
    attachCustomWheelEventHandler() {}
    attachCustomKeyEventHandler() {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("@xterm/addon-search", () => ({
  SearchAddon: class {
    findNext() {}
    findPrevious() {}
  },
}));

import { InteractiveTerminal } from "../src/components/InteractiveTerminal";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readonly sent: string[] = [];
  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(value: string) {
    this.sent.push(value);
  }

  close(code = 1000) {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  xterm.instances = [];
  vi.unstubAllGlobals();
});

function frame(bytes = "hello") {
  return {
    bytes: Buffer.from(bytes).toString("base64"),
    encoding: "ansi",
    full: true,
    height: 24,
    seq: 1,
    type: "terminal.frame",
    width: 80,
  };
}

async function renderTerminal(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const createTicket = vi.fn().mockResolvedValue({
    expiresAt: Date.now() + 30_000,
    path: "/api/herdr/terminal",
    ticket: "one-use-ticket",
    type: "terminal_ticket",
  });
  const onUploadImage = vi.fn().mockResolvedValue({
    mediaType: "image/png",
    path: "/repo/it'works.png",
    size: 11,
    type: "image_uploaded",
  });
  const props = {
    actionsEnabled: true,
    agentId: "w5:p1",
    agentLabel: "reviewer",
    canPrompt: true,
    controlEnabled: true,
    createTicket,
    draft: { ...EMPTY_COMPOSER_DRAFT },
    onDraftChange: vi.fn(),
    onPrompt: vi.fn().mockResolvedValue({ type: "agent_prompted" }),
    onUploadImage,
    paneId: "w5:p1",
    structuredActionsEnabled: true,
    ...overrides,
  };
  const view = render(<InteractiveTerminal {...props} />);
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  const socket = FakeWebSocket.instances[0];
  if (!socket) throw new Error("Missing terminal socket");
  return { ...view, createTicket, onUploadImage, props, socket };
}

describe("InteractiveTerminal", () => {
  test("uses a one-use ticket, renders ANSI, and forwards terminal input exactly once", async () => {
    const { createTicket, props, rerender, socket } = await renderTerminal();

    expect(createTicket).toHaveBeenCalledWith("w5:p1", {
      cols: 80,
      mode: "control",
      rows: 24,
      takeover: false,
    });
    expect(socket.url).toContain("ticket=one-use-ticket");
    expect(socket.url).not.toContain("Bearer");
    expect(xterm.instances[0]?.options).toMatchObject({
      theme: {
        background: "#0c0c0c",
        cursor: "#ffc53d",
        foreground: "#eeeeec",
      },
    });
    rerender(
      <InteractiveTerminal
        {...props}
        createTicket={vi.fn().mockResolvedValue({
          expiresAt: Date.now() + 30_000,
          path: "/api/herdr/terminal",
          ticket: "unused-replacement",
          type: "terminal_ticket",
        })}
      />,
    );
    expect(FakeWebSocket.instances).toHaveLength(1);
    socket.message(frame("\u001b[2J決定"));
    expect(await screen.findByText("Interactive")).toBeVisible();
    expect(xterm.instances[0]?.reset).toHaveBeenCalledOnce();
    expect(xterm.instances[0]?.write).toHaveBeenCalledOnce();

    xterm.instances[0]?.data?.("echo hi\r");
    const inputs = socket.sent
      .map((value) => JSON.parse(value))
      .filter(({ type }) => type === "terminal.input");
    expect(inputs).toEqual([{ data: "echo hi\r", type: "terminal.input" }]);
  });

  test("provides mobile Escape, Ctrl, and Tab input without replay", async () => {
    const { socket } = await renderTerminal();
    socket.message(frame());
    await screen.findByText("Interactive");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Esc" }));
    await user.click(screen.getByRole("button", { name: "Ctrl" }));
    xterm.instances[0]?.data?.("c");
    await user.click(screen.getByRole("button", { name: "Tab" }));

    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toEqual([
      { data: "\u001b", type: "terminal.input" },
      { data: "\u0003", type: "terminal.input" },
      { data: "\t", type: "terminal.input" },
    ]);
  });

  test("keeps browser input paused until a backpressured stream drains", async () => {
    const { socket } = await renderTerminal();
    socket.message(frame());
    socket.message({ type: "terminal.flow", writable: false });
    socket.message({ ...frame("more output"), full: false, seq: 2 });

    xterm.instances[0]?.data?.("must-wait");
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toHaveLength(0);

    socket.message({ type: "terminal.flow", writable: true });
    xterm.instances[0]?.data?.("send-now");
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toEqual([{ data: "send-now", type: "terminal.input" }]);
  });

  test("resynchronizes from a fresh canonical frame after a sequence gap", async () => {
    const { createTicket, socket } = await renderTerminal();
    socket.message(frame());

    socket.message({
      code: "terminal_sequence_gap",
      message: "Expected terminal frame 2 but received 3",
      recoverable: true,
      type: "terminal.error",
    });

    expect(await screen.findByText("Reconnecting terminal")).toBeVisible();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2), {
      timeout: 1_500,
    });
    expect(createTicket).toHaveBeenCalledTimes(2);
  });

  test("captures image paste while connecting and enables upload after the terminal becomes interactive", async () => {
    const { socket } = await renderTerminal();
    const file = new File(["png"], "early-paste.png", { type: "image/png" });
    const terminal = screen.getByRole("region", {
      name: "reviewer interactive terminal",
    });

    fireEvent.paste(terminal, {
      clipboardData: { files: [file], items: [] },
    });

    expect(
      await screen.findByRole("dialog", { name: "Insert image path" }),
    ).toBeVisible();
    const upload = screen.getByRole("button", {
      name: "Upload and insert path",
    });
    expect(upload).toBeDisabled();
    expect(
      screen.getByText(
        "Image ready. Wait for an Interactive terminal before uploading.",
      ),
    ).toBeVisible();

    socket.message(frame());
    await waitFor(() => expect(upload).toBeEnabled());
  });

  test("stages image paste without side effects and inserts an escaped path after confirmation", async () => {
    const { onUploadImage, socket } = await renderTerminal();
    socket.message(frame());
    await screen.findByText("Interactive");
    const file = new File(["png"], "paste.png", { type: "image/png" });
    const terminal = screen.getByRole("region", {
      name: "reviewer interactive terminal",
    });
    const xtermPaste = vi.fn();
    terminal.addEventListener("paste", xtermPaste);

    fireEvent.paste(terminal, {
      clipboardData: { files: [file], items: [] },
    });
    expect(
      await screen.findByRole("dialog", { name: "Insert image path" }),
    ).toBeVisible();
    expect(xtermPaste).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Cancel" }));
    expect(onUploadImage).not.toHaveBeenCalled();

    fireEvent.paste(terminal, {
      clipboardData: {
        files: [],
        getData: () => "ordinary terminal text",
        items: [],
      },
    });
    expect(xtermPaste).toHaveBeenCalledOnce();

    fireEvent.paste(terminal, {
      clipboardData: { files: [file], items: [] },
    });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Upload and insert path" }));
    await waitFor(() =>
      expect(onUploadImage).toHaveBeenCalledWith("w5:p1", file),
    );
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .find(({ type }) => type === "terminal.input"),
    ).toEqual({
      data: `'/repo/it'"'"'works.png'`.replaceAll("\\/", "/"),
      type: "terminal.input",
    });
  });

  test("opens viewer sessions in enforced read-only mode", async () => {
    const { createTicket, socket } = await renderTerminal({
      controlEnabled: false,
      structuredActionsEnabled: false,
    });

    expect(createTicket).toHaveBeenCalledWith(
      "w5:p1",
      expect.objectContaining({ mode: "observe" }),
    );
    socket.message(frame());
    expect(await screen.findByText("Watching")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Insert image path" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Prompt Agent" })).toBeDisabled();
    xterm.instances[0]?.data?.("must-not-send");
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toHaveLength(0);
  });

  test("offers read-only observation or explicit takeover when control is held elsewhere", async () => {
    const { socket } = await renderTerminal();
    socket.message({
      reason: "terminal is already controlled by another client",
      type: "terminal.closed",
    });

    expect(
      (await screen.findAllByText("Control is held elsewhere"))[0],
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Watch read-only" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Take control" })).toBeVisible();
  });
});
