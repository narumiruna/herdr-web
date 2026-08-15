import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type {
  TerminalBackend,
  TerminalServerMessage,
} from "./terminal-session.js";
import { TerminalSession } from "./terminal-session.js";
import type {
  TerminalTicket,
  TerminalTicketStore,
} from "./terminal-tickets.js";

const MAX_BROWSER_MESSAGE_BYTES = 70 * 1024;
const MAX_BUFFERED_OUTPUT_BYTES = 4 * 1024 * 1024;

interface TerminalWebSocketOptions {
  backend: TerminalBackend;
  maxSessions?: number;
  server: Server;
  tickets: TerminalTicketStore;
}

function rejectUpgrade(
  socket: NodeJS.WritableStream,
  status: number,
  message: string,
): void {
  const body = `${message}\n`;
  socket.write(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
  if ("destroy" in socket && typeof socket.destroy === "function")
    socket.destroy();
}

function sameOrigin(request: import("node:http").IncomingMessage): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function attachTerminalWebSocket({
  backend,
  maxSessions = 16,
  server,
  tickets,
}: TerminalWebSocketOptions): {
  close: () => void;
  sessionCount: () => number;
} {
  const webSockets = new WebSocketServer({
    maxPayload: MAX_BROWSER_MESSAGE_BYTES,
    noServer: true,
    perMessageDeflate: false,
  });
  const sessions = new Set<TerminalSession>();

  const openTerminal = (webSocket: WebSocket, ticket: TerminalTicket) => {
    const session = new TerminalSession(
      backend.open(ticket),
      ticket.mode === "control",
    );
    sessions.add(session);

    const send = (message: TerminalServerMessage) => {
      if (webSocket.readyState !== WebSocket.OPEN) return;
      if (webSocket.bufferedAmount > MAX_BUFFERED_OUTPUT_BYTES) {
        webSocket.close(1013, "terminal output backpressure");
        session.close();
        return;
      }
      webSocket.send(JSON.stringify(message));
    };

    session.on("message", send);
    session.once("closed", () => {
      sessions.delete(session);
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.close(1000, "terminal released");
      }
    });
    webSocket.on("message", (data, isBinary) => {
      if (isBinary) {
        send({
          code: "binary_message_unsupported",
          message: "Terminal commands must use JSON text frames",
          recoverable: true,
          type: "terminal.error",
        });
        return;
      }
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        send({
          code: "invalid_terminal_json",
          message: "Terminal command is not valid JSON",
          recoverable: true,
          type: "terminal.error",
        });
        return;
      }
      session.accept(message);
    });
    webSocket.once("close", () => {
      sessions.delete(session);
      session.close();
    });
    webSocket.once("error", () => session.close());
  };

  const upgrade = (
    request: import("node:http").IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ) => {
    const url = new URL(request.url ?? "/", "http://herdr-web.local");
    if (url.pathname !== "/api/herdr/terminal") {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    if (!sameOrigin(request)) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    if (sessions.size >= maxSessions) {
      rejectUpgrade(socket, 503, "Terminal capacity reached");
      return;
    }
    const token = url.searchParams.get("ticket") ?? "";
    const ticket = tickets.consume(token);
    if (!ticket) {
      rejectUpgrade(socket, 401, "Invalid or expired terminal ticket");
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      openTerminal(webSocket, ticket);
    });
  };

  server.on("upgrade", upgrade);

  return {
    close: () => {
      server.off("upgrade", upgrade);
      for (const session of sessions) session.close();
      sessions.clear();
      for (const client of webSockets.clients) client.terminate();
      webSockets.close();
    },
    sessionCount: () => sessions.size,
  };
}
