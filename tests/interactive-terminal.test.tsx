import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { EMPTY_COMPOSER_DRAFT } from "../src/components/TerminalWorkspace";

const xterm = vi.hoisted(() => ({
  instances: [] as Array<{
    data?: (value: string) => void;
    focus: ReturnType<typeof vi.fn>;
    options?: unknown;
    reset: ReturnType<typeof vi.fn>;
    resize?: (size: { cols: number; rows: number }) => void;
    write: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    private instance: (typeof xterm.instances)[number] = {
      focus: vi.fn(),
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
    focus = this.instance.focus;
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
    onResize(callback: (size: { cols: number; rows: number }) => void) {
      this.instance.resize = callback;
      return { dispose() {} };
    }
    paste(value: string) {
      this.instance.data?.(value);
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
  vi.useRealTimers();
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

async function renderTerminal(
  overrides: Record<string, unknown> = {},
  options: { takeControl?: boolean } = {},
) {
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
    focused: true,
    onDraftChange: vi.fn(),
    onPrompt: vi.fn().mockResolvedValue({ type: "agent_prompted" }),
    onUploadImage,
    paneId: "w5:p1",
    structuredActionsEnabled: true,
    ...overrides,
  };
  const view = render(<InteractiveTerminal {...props} />);
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  let socket = FakeWebSocket.instances[0];
  if (!socket) throw new Error("Missing terminal socket");
  if (
    options.takeControl !== false &&
    props.controlEnabled !== false &&
    props.focused !== false
  ) {
    socket.message(frame("observing"));
    await screen.findByText("Watching");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Take control" }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    socket = FakeWebSocket.instances[1];
    if (!socket) throw new Error("Missing controlling terminal socket");
    xterm.instances[0]?.reset.mockClear();
    xterm.instances[0]?.write.mockClear();
  }
  return { ...view, createTicket, onUploadImage, props, socket };
}

describe("InteractiveTerminal", () => {
  test("observes by default and forwards input only after explicit control", async () => {
    const {
      createTicket,
      props,
      rerender,
      socket: observeSocket,
    } = await renderTerminal({}, { takeControl: false });

    expect(createTicket).toHaveBeenCalledWith("w5:p1", {
      cols: 80,
      mode: "observe",
      rows: 24,
      takeover: false,
    });
    expect(observeSocket.url).toContain("ticket=one-use-ticket");
    expect(observeSocket.url).not.toContain("Bearer");
    expect(xterm.instances[0]?.options).toMatchObject({
      theme: {
        background: "#0c0c0c",
        cursor: "#ffc53d",
        foreground: "#eeeeec",
      },
    });
    observeSocket.message(frame("observing"));
    expect(await screen.findByText("Watching")).toBeVisible();
    xterm.instances[0]?.data?.("must-not-send");
    expect(
      observeSocket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toHaveLength(0);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Take control" }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const controlSocket = FakeWebSocket.instances[1];
    if (!controlSocket) throw new Error("Missing controlling socket");
    expect(createTicket).toHaveBeenLastCalledWith("w5:p1", {
      cols: 80,
      mode: "control",
      rows: 24,
      takeover: false,
    });
    expect(JSON.parse(observeSocket.sent.at(-1) ?? "{}")).toEqual({
      type: "terminal.release",
    });
    controlSocket.message(frame("\u001b[2J決定"));
    expect(await screen.findByText("Interactive")).toBeVisible();

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
    expect(FakeWebSocket.instances).toHaveLength(2);
    xterm.instances[0]?.data?.("echo hi\r");
    expect(
      controlSocket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toEqual([{ data: "echo hi\r", type: "terminal.input" }]);
  });

  test("falls back to observation when a control ticket is rejected", async () => {
    const createTicket = vi
      .fn()
      .mockResolvedValueOnce({
        expiresAt: Date.now() + 30_000,
        path: "/api/herdr/terminal",
        ticket: "observe-first",
        type: "terminal_ticket",
      })
      .mockRejectedValueOnce(new Error("Control request rejected"))
      .mockResolvedValueOnce({
        expiresAt: Date.now() + 30_000,
        path: "/api/herdr/terminal",
        ticket: "observe-recovery",
        type: "terminal_ticket",
      });
    const { socket } = await renderTerminal(
      { createTicket },
      { takeControl: false },
    );
    socket.message(frame());
    await screen.findByText("Watching");

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Take control" }));
    await waitFor(() => expect(createTicket).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    FakeWebSocket.instances[1]?.message(frame("still watching"));

    expect(await screen.findByText("Watching")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Control unavailable");
    expect(screen.getByRole("button", { name: "Take control" })).toBeEnabled();
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

  test("debounces controlling resize and releases back to observation", async () => {
    const { socket } = await renderTerminal();
    socket.message(frame());
    await screen.findByText("Interactive");
    vi.useFakeTimers();

    xterm.instances[0]?.resize?.({ cols: 100, rows: 30 });
    xterm.instances[0]?.resize?.({ cols: 120, rows: 40 });
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.resize"),
    ).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.resize"),
    ).toEqual([{ cols: 120, rows: 40, type: "terminal.resize" }]);

    xterm.instances[0]?.resize?.({ cols: 140, rows: 44 });
    fireEvent.click(screen.getByRole("button", { name: "Release control" }));
    vi.advanceTimersByTime(100);
    vi.useRealTimers();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(3));
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.resize"),
    ).toHaveLength(1);
    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual({
      type: "terminal.release",
    });
    FakeWebSocket.instances[2]?.message(frame("watching again"));
    expect(await screen.findByText("Watching")).toBeVisible();
    expect(screen.getByRole("button", { name: "Take control" })).toBeEnabled();
  });

  test("releases control when its split pane loses focus", async () => {
    const { props, rerender, socket } = await renderTerminal();
    socket.message(frame());
    await screen.findByText("Interactive");

    rerender(<InteractiveTerminal {...props} focused={false} />);

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(3));
    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual({
      type: "terminal.release",
    });
    FakeWebSocket.instances[2]?.message(frame("unfocused observation"));
    expect(await screen.findByText("Watching")).toBeVisible();
    expect(screen.getByRole("button", { name: "Take control" })).toBeDisabled();
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
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(3), {
      timeout: 1_500,
    });
    expect(createTicket).toHaveBeenCalledTimes(3);
  });

  test("captures image paste while connecting and enables upload after the terminal becomes interactive", async () => {
    const { socket } = await renderTerminal();
    const file = new File(["png"], "early-paste.png", { type: "image/png" });
    const terminal = screen.getByRole("region", {
      name: "reviewer interactive terminal",
    });

    const xtermInput = document.createElement("textarea");
    terminal.append(xtermInput);
    xtermInput.focus();
    fireEvent.keyDown(xtermInput, { key: "v", metaKey: true });
    const pasteCatcher = screen.getByLabelText("Terminal paste catcher");
    expect(pasteCatcher).toHaveFocus();
    fireEvent.paste(pasteCatcher, {
      clipboardData: { files: [file], items: [], types: ["Files"] },
    });

    expect(
      await screen.findByRole("dialog", { name: "Insert image path" }),
    ).toBeVisible();
    const upload = screen.getByRole("button", {
      name: "Upload and insert path",
    });
    expect(upload).toHaveClass("rt-Button", "rt-variant-solid");
    expect(upload.closest(".radix-themes")).not.toBeNull();
    expect(upload).toBeDisabled();
    expect(
      screen.getByText(
        "Image ready. Wait for an Interactive terminal before uploading.",
      ),
    ).toBeVisible();

    socket.message(frame());
    await waitFor(() => expect(upload).toBeEnabled());
  });

  test("forwards ordinary text from the paste catcher back through xterm", async () => {
    const { socket } = await renderTerminal();
    socket.message(frame());
    await screen.findByText("Interactive");
    const terminal = screen.getByRole("region", {
      name: "reviewer interactive terminal",
    });
    const xtermInput = document.createElement("textarea");
    terminal.append(xtermInput);
    xtermInput.focus();

    fireEvent.keyDown(xtermInput, { ctrlKey: true, key: "v" });
    const pasteCatcher = screen.getByLabelText("Terminal paste catcher");
    expect(pasteCatcher).toHaveFocus();
    fireEvent.paste(pasteCatcher, {
      clipboardData: {
        files: [],
        getData: () => "ordinary terminal text",
        items: [],
        types: ["text/plain"],
      },
    });

    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toEqual([{ data: "ordinary terminal text", type: "terminal.input" }]);
  });

  test("falls back to the Clipboard API when native paste data is empty", async () => {
    await renderTerminal();
    const read = vi.fn().mockResolvedValue([
      {
        getType: vi
          .fn()
          .mockResolvedValue(new Blob(["png"], { type: "image/png" })),
        types: ["image/png"],
      },
    ]);
    vi.stubGlobal("navigator", { clipboard: { read } });

    fireEvent.paste(window, {
      clipboardData: { files: [], items: [], types: [] },
    });

    expect(
      await screen.findByRole("dialog", { name: "Insert image path" }),
    ).toBeVisible();
    expect(screen.getByText("clipboard-image.png")).toBeVisible();
    expect(read).toHaveBeenCalledOnce();
  });

  test("routes global image paste only to the focused split pane", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const file = new File(["png"], "focused-pane.png", {
      type: "image/png",
    });
    const onUploadImage = vi.fn().mockResolvedValue({
      mediaType: "image/png",
      path: "/repo/focused-pane.png",
      size: file.size,
      type: "image_uploaded",
    });
    const shared = {
      actionsEnabled: true,
      agentId: "w5:p1",
      agentLabel: "reviewer",
      canPrompt: true,
      controlEnabled: true,
      createTicket: vi.fn().mockResolvedValue({
        expiresAt: Date.now() + 30_000,
        path: "/api/herdr/terminal",
        ticket: "split-ticket",
        type: "terminal_ticket",
      }),
      draft: { ...EMPTY_COMPOSER_DRAFT },
      onDraftChange: vi.fn(),
      onPrompt: vi.fn().mockResolvedValue({ type: "agent_prompted" }),
      onUploadImage,
      structuredActionsEnabled: true,
    };

    render(
      <>
        <InteractiveTerminal {...shared} focused={false} paneId="w5:p1" />
        <InteractiveTerminal {...shared} focused paneId="w5:p2" />
      </>,
    );
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    for (const socket of FakeWebSocket.instances) socket.message(frame());
    await waitFor(() =>
      expect(screen.getAllByText("Watching")).toHaveLength(2),
    );
    const takeControl = screen
      .getAllByRole("button", { name: "Take control" })
      .find((button) => !button.hasAttribute("disabled"));
    if (!takeControl) throw new Error("Missing focused control action");
    await userEvent.setup().click(takeControl);
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(3));
    FakeWebSocket.instances[2]?.message(frame());
    await screen.findByText("Interactive");

    fireEvent.paste(window, {
      clipboardData: { files: [file], items: [], types: ["Files"] },
    });

    expect(
      await screen.findAllByRole("dialog", { name: "Insert image path" }),
    ).toHaveLength(1);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Upload and insert path" }));
    await waitFor(() =>
      expect(onUploadImage).toHaveBeenCalledWith("w5:p2", file),
    );
    expect(onUploadImage).toHaveBeenCalledOnce();
  });

  test("completes two image paste cycles without requiring outside focus", async () => {
    const onUploadImage = vi
      .fn()
      .mockImplementation(async (_paneId: string, file: File) => ({
        mediaType: file.type,
        path: `/repo/${file.name}`,
        size: file.size,
        type: "image_uploaded",
      }));
    const { socket } = await renderTerminal({ onUploadImage });
    socket.message(frame());
    await screen.findByText("Interactive");
    const user = userEvent.setup();

    for (const name of ["repeat.png", "repeat.png"]) {
      const file = new File([name], name, { type: "image/png" });
      fireEvent.paste(window, {
        clipboardData: { files: [file], items: [], types: ["Files"] },
      });
      await user.click(
        await screen.findByRole("button", {
          name: "Upload and insert path",
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Insert image path" }),
        ).not.toBeInTheDocument(),
      );
    }

    expect(onUploadImage).toHaveBeenCalledTimes(2);
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toEqual([
      { data: " '/repo/repeat.png' ", type: "terminal.input" },
      { data: " '/repo/repeat.png' ", type: "terminal.input" },
    ]);
  });

  test("preserves a second pasted image while the first upload is pending", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const onUploadImage = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        mediaType: "image/png",
        path: "/repo/second.png",
        size: 6,
        type: "image_uploaded",
      });
    const { socket } = await renderTerminal({ onUploadImage });
    socket.message(frame());
    await screen.findByText("Interactive");
    const user = userEvent.setup();
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });

    fireEvent.paste(window, {
      clipboardData: { files: [first], items: [], types: ["Files"] },
    });
    await user.click(
      await screen.findByRole("button", { name: "Upload and insert path" }),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();
    fireEvent.paste(window, {
      clipboardData: { files: [second], items: [], types: ["Files"] },
    });
    expect(await screen.findByText("second.png")).toBeVisible();

    resolveFirst?.({
      mediaType: "image/png",
      path: "/repo/first.png",
      size: first.size,
      type: "image_uploaded",
    });

    await waitFor(() => expect(onUploadImage).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Insert image path/ }),
      ).not.toBeInTheDocument(),
    );
  });

  test("retries only failed images and inserts the complete ordered batch", async () => {
    const onUploadImage = vi
      .fn()
      .mockResolvedValueOnce({
        mediaType: "image/png",
        path: "/repo/first.png",
        size: 5,
        type: "image_uploaded",
      })
      .mockRejectedValueOnce(new Error("Second upload failed"))
      .mockResolvedValueOnce({
        mediaType: "image/png",
        path: "/repo/second.png",
        size: 6,
        type: "image_uploaded",
      });
    const { socket } = await renderTerminal({ onUploadImage });
    socket.message(frame());
    await screen.findByText("Interactive");
    const files = [
      new File(["first"], "first.png", { type: "image/png" }),
      new File(["second"], "second.png", { type: "image/png" }),
    ];
    fireEvent.paste(window, {
      clipboardData: { files, items: [], types: ["Files"] },
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: "Upload 2 images and insert paths",
      }),
    );
    expect(await screen.findByText("Second upload failed")).toBeVisible();
    expect(screen.getByText("/repo/first.png")).toBeVisible();
    expect(onUploadImage).toHaveBeenCalledTimes(2);
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toHaveLength(0);

    await user.click(
      screen.getByRole("button", { name: "Retry failed uploads" }),
    );
    await waitFor(() => expect(onUploadImage).toHaveBeenCalledTimes(3));
    expect(onUploadImage.mock.calls.map(([, file]) => file.name)).toEqual([
      "first.png",
      "second.png",
      "second.png",
    ]);
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toEqual([
      {
        data: " '/repo/first.png' '/repo/second.png' ",
        type: "terminal.input",
      },
    ]);
  });

  test("stages every supported image from one clipboard event in order", async () => {
    const { socket } = await renderTerminal();
    socket.message(frame());
    await screen.findByText("Interactive");
    const files = [
      new File(["one"], "one.png", { type: "image/png" }),
      new File(["two"], "two.jpg", { type: "image/jpeg" }),
      new File(["three"], "three.webp", { type: "image/webp" }),
    ];

    fireEvent.paste(window, {
      clipboardData: { files, items: [], types: ["Files"] },
    });

    expect(
      await screen.findByRole("dialog", { name: "Insert image paths" }),
    ).toBeVisible();
    const names = screen
      .getAllByTestId("terminal-image-name")
      .map((element) => element.textContent);
    expect(names).toEqual(["one.png", "two.jpg", "three.webp"]);
  });

  test("leaves image paste untouched with viewer access", async () => {
    await renderTerminal({
      controlEnabled: false,
      structuredActionsEnabled: false,
    });
    const file = new File(["png"], "viewer-paste.png", { type: "image/png" });

    expect(
      fireEvent.paste(window, {
        clipboardData: { files: [file], items: [] },
      }),
    ).toBe(true);

    expect(
      screen.queryByRole("dialog", { name: "Insert image path" }),
    ).not.toBeInTheDocument();
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
    const focusCallsBeforeCancel = xterm.instances[0]?.focus.mock.calls.length;
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Cancel" }));
    expect(onUploadImage).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(xterm.instances[0]?.focus.mock.calls.length).toBeGreaterThan(
        focusCallsBeforeCancel ?? 0,
      ),
    );

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
      data: ` '/repo/it'"'"'works.png' `.replaceAll("\\/", "/"),
      type: "terminal.input",
    });
  });

  test("restores control and retries insertion without uploading again", async () => {
    const { createTicket, onUploadImage, socket } = await renderTerminal();
    socket.message(frame());
    socket.message({ type: "terminal.flow", writable: false });
    await screen.findByText("Interactive");
    const file = new File(["image"], "insert-retry.png", {
      type: "image/png",
    });
    fireEvent.paste(window, {
      clipboardData: { files: [file], items: [], types: ["Files"] },
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Upload and insert path" }),
    );
    expect(
      await screen.findByText(
        /paths could not be inserted because this terminal is not writable/i,
      ),
    ).toBeVisible();
    expect(onUploadImage).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Copy uploaded path" }),
    ).toBeEnabled();

    socket.message({
      reason: "terminal is already controlled by another client",
      type: "terminal.closed",
    });
    await user.click(
      await screen.findByRole("button", { name: "Restore control" }),
    );
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(3));
    expect(createTicket).toHaveBeenLastCalledWith(
      "w5:p1",
      expect.objectContaining({ mode: "control", takeover: true }),
    );
    const recoveredSocket = FakeWebSocket.instances[2];
    if (!recoveredSocket) throw new Error("Missing recovered control socket");
    recoveredSocket.message(frame("control restored"));
    await screen.findByText("Interactive");
    await user.click(
      screen.getByRole("button", { name: "Insert uploaded path" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Insert image path" }),
      ).not.toBeInTheDocument(),
    );
    expect(onUploadImage).toHaveBeenCalledOnce();
    expect(
      recoveredSocket.sent
        .map((value) => JSON.parse(value))
        .filter(({ type }) => type === "terminal.input"),
    ).toEqual([
      {
        data: ` '/repo/it'"'"'works.png' `,
        type: "terminal.input",
      },
    ]);
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

  test("offers read-only observation without capturing images in observe mode", async () => {
    const { socket } = await renderTerminal();
    socket.message({
      reason: "terminal is already controlled by another client",
      type: "terminal.closed",
    });

    expect(
      (await screen.findAllByText("Control is held elsewhere"))[0],
    ).toBeVisible();
    const watch = screen.getByRole("button", { name: "Watch read-only" });
    expect(watch).toBeVisible();
    expect(screen.getByRole("button", { name: "Take control" })).toBeVisible();

    await userEvent.setup().click(watch);
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(3));
    const observeSocket = FakeWebSocket.instances[2];
    if (!observeSocket) throw new Error("Missing observe socket");
    observeSocket.message(frame());
    expect(await screen.findByText("Watching")).toBeVisible();

    const terminal = screen.getByRole("region", {
      name: "reviewer interactive terminal",
    });
    const xtermInput = document.createElement("textarea");
    const xtermPaste = vi.fn();
    xtermInput.addEventListener("paste", xtermPaste);
    terminal.append(xtermInput);
    xtermInput.focus();
    fireEvent.keyDown(xtermInput, { key: "v", metaKey: true });
    expect(xtermInput).toHaveFocus();

    const file = new File(["png"], "observe-paste.png", {
      type: "image/png",
    });
    expect(
      fireEvent.paste(xtermInput, {
        clipboardData: { files: [file], items: [] },
      }),
    ).toBe(true);
    expect(xtermPaste).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("dialog", { name: "Insert image path" }),
    ).not.toBeInTheDocument();
  });
});
