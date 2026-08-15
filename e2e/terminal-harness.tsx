import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "@radix-ui/themes/styles.css";
import "@radix-ui/colors/amber.css";
import "@radix-ui/colors/amber-dark.css";
import "@radix-ui/colors/grass.css";
import "@radix-ui/colors/grass-dark.css";
import "@radix-ui/colors/red.css";
import "@radix-ui/colors/red-dark.css";
import "@radix-ui/colors/sand.css";
import "@radix-ui/colors/sand-dark.css";
import "@xterm/xterm/css/xterm.css";
import "../src/styles.css";
import "../src/styles-workbench.css";
import "../src/styles-overlays.css";
import { Theme } from "@radix-ui/themes";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { InteractiveTerminal } from "../src/components/InteractiveTerminal";
import { EMPTY_COMPOSER_DRAFT } from "../src/components/TerminalWorkspace";
import { DEFAULT_TERMINAL_FONT_SIZE } from "../src/terminal-preferences";

const RENDERING_FIXTURE = [
  "\u001b[2J\u001b[H",
  `\u001b[35m${"─".repeat(72)}\u001b[0m`,
  "\r\n\u001b[44;97m herdr-web \u001b[34;45m\ue0b0\u001b[97m \ue0a0 main \u001b[35;46m\ue0b0\u001b[30m \uf121 terminal \u001b[0m",
  "\r\n\u001b[30mANSI \u001b[31mred \u001b[32mgreen \u001b[33myellow \u001b[34mblue \u001b[35mmagenta \u001b[36mcyan \u001b[37mwhite\u001b[0m",
  "\r\n\u001b[90mBRIGHT \u001b[91mred \u001b[92mgreen \u001b[93myellow \u001b[94mblue \u001b[95mmagenta \u001b[96mcyan \u001b[97mwhite\u001b[0m",
  "\r\nWIDTH ASCII|界面|e\u0301|🙂|END",
].join("");

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

class HarnessSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readonly sent: string[] = [];
  readonly url: string;
  readyState = HarnessSocket.CONNECTING;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  private sequence = 0;

  constructor(url: string | URL) {
    this.url = String(url);
    window.__terminalSockets.push(this);
    queueMicrotask(() => {
      this.readyState = HarnessSocket.OPEN;
      this.onopen?.();
    });
  }

  send(value: string) {
    this.sent.push(value);
  }

  close(code = 1000) {
    if (this.readyState === HarnessSocket.CLOSED) return;
    this.readyState = HarnessSocket.CLOSED;
    this.onclose?.({ code });
  }

  frame(text = "terminal ready") {
    this.sequence += 1;
    this.onmessage?.({
      data: JSON.stringify({
        bytes: encodeBase64(text),
        encoding: "ansi",
        full: this.sequence === 1,
        height: 24,
        seq: this.sequence,
        type: "terminal.frame",
        width: 80,
      }),
    });
  }

  renderingFixture() {
    this.frame(RENDERING_FIXTURE);
  }
}

declare global {
  interface Window {
    __terminalSockets: HarnessSocket[];
    __terminalUploads: Array<{ image: File; paneId: string }>;
  }
}

window.__terminalSockets = [];
window.__terminalUploads = [];
globalThis.WebSocket = HarnessSocket as unknown as typeof WebSocket;

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");

function HarnessTerminal({
  focused,
  paneId,
}: {
  focused: boolean;
  paneId: string;
}) {
  const [fontSize, setFontSize] = useState(DEFAULT_TERMINAL_FONT_SIZE);

  return (
    <InteractiveTerminal
      actionsEnabled
      agentId={paneId}
      agentLabel={paneId}
      canPrompt={false}
      controlEnabled
      createTicket={async () => ({
        expiresAt: Date.now() + 30_000,
        path: "/api/herdr/terminal",
        ticket: `ticket-${window.__terminalSockets.length + 1}`,
        type: "terminal_ticket",
      })}
      draft={{ ...EMPTY_COMPOSER_DRAFT }}
      focused={focused}
      fontSize={fontSize}
      onDraftChange={() => undefined}
      onFontSizeChange={setFontSize}
      onPrompt={async () => undefined}
      onUploadImage={async (uploadPaneId, image) => {
        window.__terminalUploads.push({ image, paneId: uploadPaneId });
        return {
          mediaType: image.type,
          path: `/repo/${window.__terminalUploads.length}-${image.name}`,
          size: image.size,
          type: "image_uploaded",
        };
      }}
      paneId={paneId}
      structuredActionsEnabled
    />
  );
}

const split = new URL(window.location.href).searchParams.has("split");
createRoot(root).render(
  <Theme appearance="dark" accentColor="amber" grayColor="sand">
    <div style={{ display: "flex", width: "100%", height: "100dvh" }}>
      {split && <HarnessTerminal focused={false} paneId="w5:p1" />}
      <HarnessTerminal focused paneId={split ? "w5:p2" : "w5:p1"} />
    </div>
  </Theme>,
);
