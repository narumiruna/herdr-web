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

export class HerdrApiClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${this.token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
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

  promptAgent(paneId: string, message: string): Promise<unknown> {
    return this.request(
      `/api/herdr/agents/${encodeURIComponent(paneId)}/prompt`,
      { body: JSON.stringify({ message }), method: "POST" },
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

const TOKEN_KEY = "herdr-web-token";

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
