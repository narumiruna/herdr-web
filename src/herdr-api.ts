import type { LiveSnapshotPayload } from "./live-state";
import type { RuntimeName } from "./state";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class HerdrBridgeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HerdrBridgeError";
    this.code = code;
    this.status = status;
  }
}

export interface NewLiveSession {
  command: string;
  label: string;
  runtime: RuntimeName;
  workspaceId: string;
}

export interface TerminalTicket {
  expiresAt: number;
  path: string;
  ticket: string;
  type: "terminal_ticket";
}

export interface TerminalTicketInput {
  cols: number;
  mode: "control" | "observe";
  rows: number;
  takeover?: boolean;
}

export interface UploadedImage {
  mediaType: string;
  path: string;
  size: number;
  type: "image_uploaded";
}

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_PROMPT_CHARACTERS = 20_000;
export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export class HerdrApiClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const suppliedHeaders = Object.fromEntries(new Headers(init.headers));
    const hasContentType = Object.keys(suppliedHeaders).some(
      (name) => name.toLowerCase() === "content-type",
    );
    const response = await fetch(path, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: {
        ...(init.body && !hasContentType
          ? { "content-type": "application/json" }
          : {}),
        ...suppliedHeaders,
        authorization: `Bearer ${this.token}`,
      },
    });
    if (!response.ok) {
      let body: ApiErrorBody = {};
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        // The status remains useful when an intermediary returns a non-JSON error.
      }
      throw new HerdrBridgeError(
        response.status,
        body.error?.code ?? "request_failed",
        body.error?.message ?? `Request failed with status ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }

  state(): Promise<LiveSnapshotPayload> {
    return this.request("/api/herdr/state");
  }

  async events(
    signal: AbortSignal,
    onEvent: (event: unknown) => void,
    onReady?: () => void,
  ): Promise<void> {
    const response = await fetch("/api/herdr/events", {
      headers: { authorization: `Bearer ${this.token}` },
      signal,
    });
    if (!response.ok) {
      throw new HerdrBridgeError(
        response.status,
        "event_stream_failed",
        `Event stream failed with status ${response.status}`,
      );
    }
    if (
      !response.headers.get("content-type")?.includes("application/x-ndjson") ||
      !response.body
    ) {
      throw new HerdrBridgeError(
        502,
        "invalid_event_stream",
        "The bridge did not return a Herdr event stream",
      );
    }
    onReady?.();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1024 * 1024) {
        throw new Error("Herdr event stream exceeded its buffer limit");
      }
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line) continue;
        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch {
          throw new Error("Herdr event stream returned invalid JSON");
        }
        onEvent(event);
      }
    }
    if (!signal.aborted) throw new Error("Herdr event stream disconnected");
  }

  promptAgent(paneId: string, message: string): Promise<unknown> {
    return this.request(
      `/api/herdr/agents/${encodeURIComponent(paneId)}/prompt`,
      { body: JSON.stringify({ message }), method: "POST" },
    );
  }

  terminalTicket(
    paneId: string,
    input: TerminalTicketInput,
  ): Promise<TerminalTicket> {
    return this.request(
      `/api/herdr/panes/${encodeURIComponent(paneId)}/terminal-ticket`,
      { body: JSON.stringify(input), method: "POST" },
    );
  }

  uploadImage(paneId: string, image: File): Promise<UploadedImage> {
    return this.request(
      `/api/herdr/agents/${encodeURIComponent(paneId)}/images`,
      {
        body: image,
        headers: { "content-type": image.type },
        method: "POST",
      },
    );
  }

  splitPane(paneId: string): Promise<unknown> {
    return this.request(
      `/api/herdr/panes/${encodeURIComponent(paneId)}/split`,
      { method: "POST" },
    );
  }

  closePane(paneId: string): Promise<unknown> {
    return this.request(`/api/herdr/panes/${encodeURIComponent(paneId)}`, {
      method: "DELETE",
    });
  }

  createSession(input: NewLiveSession): Promise<unknown> {
    return this.request("/api/herdr/sessions", {
      body: JSON.stringify(input),
      method: "POST",
    });
  }
}

const TOKEN_KEY = "hedr-token";

export function browserAccessToken(): string {
  const url = new URL(window.location.href);
  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken) {
    window.sessionStorage.setItem(TOKEN_KEY, queryToken);
    url.searchParams.delete("token");
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    return queryToken;
  }
  return window.sessionStorage.getItem(TOKEN_KEY)?.trim() ?? "";
}

export function rememberAccessToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token.trim());
}
