import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { ViewerShareStore } from "./share-store.js";
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
  shareStore?: ViewerShareStore;
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
  shareStore,
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
  const sharedSessions = new Map<
    TerminalSession,
    { shareId: string; webSocket: WebSocket }
  >();
  const stopRevocationListener = shareStore?.onRevoked((shareId) => {
    tickets.revokeShare(shareId);
    for (const [session, shared] of sharedSessions) {
      if (shared.shareId !== shareId) continue;
      shared.webSocket.close(1008, "viewer share revoked");
      session.close();
      sharedSessions.delete(session);
    }
  });

  const openTerminal = (webSocket: WebSocket, ticket: TerminalTicket) => {
    const session = new TerminalSession(
      backend.open(ticket),
      ticket.mode === "control",
    );
    sessions.add(session);
    if (ticket.shareId) {
      sharedSessions.set(session, { shareId: ticket.shareId, webSocket });
    }
    const shareExpiryTimer = ticket.shareExpiresAt
      ? setTimeout(
          () => {
            webSocket.close(1008, "viewer share expired");
            session.close();
          },
          Math.max(0, ticket.shareExpiresAt - Date.now()),
        )
      : undefined;
    shareExpiryTimer?.unref();

    const send = (message: TerminalServerMessage) => {
      if (webSocket.readyState !== WebSocket.OPEN) return;
      if (webSocket.bufferedAmount > MAX_BUFFERED_OUTPUT_BYTES) {
        webSocket.close(1013, "terminal output backpressure");
        session.close();
        return;
      }
      webSocket.send(
        JSON.stringify(
          message.type === "terminal.frame"
            ? { ...message, serverUnixMs: Date.now() }
            : message,
        ),
      );
    };

    session.on("message", send);
    session.once("closed", () => {
      if (shareExpiryTimer) clearTimeout(shareExpiryTimer);
      sessions.delete(session);
      sharedSessions.delete(session);
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
      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "terminal.ping" &&
        "id" in message &&
        typeof message.id === "string" &&
        message.id.length <= 64
      ) {
        if (webSocket.readyState === WebSocket.OPEN) {
          webSocket.send(
            JSON.stringify({
              id: message.id,
              serverUnixMs: Date.now(),
              type: "terminal.pong",
            }),
          );
        }
        return;
      }
      session.accept(message);
    });
    webSocket.once("close", () => {
      if (shareExpiryTimer) clearTimeout(shareExpiryTimer);
      sessions.delete(session);
      sharedSessions.delete(session);
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
    if (!ticket || (ticket.shareId && !shareStore?.isActive(ticket.shareId))) {
      rejectUpgrade(
        socket,
        401,
        "Invalid, expired, or revoked terminal ticket",
      );
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      if (ticket.shareId && !shareStore?.isActive(ticket.shareId)) {
        webSocket.close(1008, "viewer share expired or revoked");
        return;
      }
      openTerminal(webSocket, ticket);
    });
  };

  server.on("upgrade", upgrade);

  return {
    close: () => {
      server.off("upgrade", upgrade);
      stopRevocationListener?.();
      for (const session of sessions) session.close();
      sessions.clear();
      for (const client of webSockets.clients) client.terminate();
      webSockets.close();
    },
    sessionCount: () => sessions.size,
  };
}
