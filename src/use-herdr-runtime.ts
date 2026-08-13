import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  browserAccessToken,
  HerdrApiClient,
  type NewLiveSession,
  rememberAccessToken,
} from "./herdr-api";
import { mapLiveSnapshot } from "./live-state";
import {
  appReducer,
  createDemoState,
  type HerdrAction,
  type HerdrState,
} from "./state";

export type ConnectionStatus = "auth" | "error" | "loading" | "ready";

interface HerdrRuntime {
  actionError: string;
  clearActionError: () => void;
  closePane: (agentId: string, paneId: string) => Promise<void>;
  createSession: (input: NewLiveSession) => Promise<void>;
  dispatch: (action: HerdrAction) => void;
  error: string;
  promptAgent: (agentId: string, message: string) => Promise<void>;
  refresh: () => Promise<void>;
  setAccessToken: (token: string) => void;
  splitPane: (agentId: string, paneId: string) => Promise<void>;
  state: HerdrState;
  status: ConnectionStatus;
}

export function useHerdrRuntime(live: boolean): HerdrRuntime {
  const [state, dispatch] = useReducer(appReducer, undefined, createDemoState);
  const [token, setToken] = useState(() => (live ? browserAccessToken() : ""));
  const [status, setStatus] = useState<ConnectionStatus>(
    live ? (token ? "loading" : "auth") : "ready",
  );
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const client = useMemo(
    () => (token ? new HerdrApiClient(token) : null),
    [token],
  );

  const refresh = useCallback(async () => {
    if (!live || !client) return;
    try {
      const payload = await client.state();
      dispatch({ type: "runtime.synced", state: mapLiveSnapshot(payload) });
      setError("");
      setStatus("ready");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Cannot reach herdr";
      setError(message);
      setStatus(
        typeof requestError === "object" &&
          requestError !== null &&
          "status" in requestError &&
          requestError.status === 401
          ? "auth"
          : "error",
      );
    }
  }, [client, live]);

  useEffect(() => {
    if (!live || !client) return;
    let stopped = false;
    let running = false;
    const update = async () => {
      if (stopped || running) return;
      running = true;
      await refresh();
      running = false;
    };
    void update();
    const timer = window.setInterval(() => void update(), 1_500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [client, live, refresh]);

  const mutate = useCallback(
    async (action: (api: HerdrApiClient) => Promise<unknown>) => {
      if (!live || !client) return;
      setActionError("");
      try {
        await action(client);
        await refresh();
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Herdr action failed";
        setActionError(message);
        throw requestError;
      }
    },
    [client, live, refresh],
  );

  return {
    actionError,
    clearActionError: () => setActionError(""),
    closePane: async (agentId, paneId) => {
      if (!live) {
        dispatch({ type: "pane.closed", agentId, paneId });
        return;
      }
      await mutate((api) => api.closePane(paneId));
    },
    createSession: async (input) => {
      if (!live) {
        dispatch({
          type: "session.created",
          id: `agent-web-${Date.now()}`,
          ...input,
        });
        return;
      }
      await mutate((api) => api.createSession(input));
    },
    dispatch,
    error,
    promptAgent: async (agentId, message) => {
      if (!live) {
        dispatch({ type: "agent.replied", agentId, message });
        return;
      }
      await mutate((api) => api.promptAgent(agentId, message));
    },
    refresh,
    setAccessToken: (value) => {
      const next = value.trim();
      if (!next) return;
      rememberAccessToken(next);
      setToken(next);
      setError("");
      setStatus("loading");
    },
    splitPane: async (agentId, paneId) => {
      if (!live) {
        dispatch({
          type: "pane.split",
          agentId,
          paneId: `pane-web-${Date.now()}`,
        });
        return;
      }
      await mutate((api) => api.splitPane(paneId));
    },
    state,
    status,
  };
}
