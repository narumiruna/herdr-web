import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
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

export type RuntimeConnection = "connected" | "reconnecting";

interface HerdrRuntime {
  actionError: string;
  clearActionError: () => void;
  closePane: (agentId: string, paneId: string) => Promise<void>;
  connection: RuntimeConnection;
  createSession: (input: NewLiveSession) => Promise<void>;
  dispatch: (action: HerdrAction) => void;
  error: string;
  promptAgent: (
    agentId: string,
    message: string,
    image?: File,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  setAccessToken: (token: string) => void;
  splitPane: (agentId: string, paneId: string) => Promise<void>;
  state: HerdrState;
  status: ConnectionStatus;
}

export function promptWithImage(message: string, path: string): string {
  const instruction = message.trim() || "Please inspect the attached image.";
  return `${instruction}\n\nAttached image: \`${path.replaceAll("`", "\\`")}\``;
}

export function useHerdrRuntime(live: boolean): HerdrRuntime {
  const [state, dispatch] = useReducer(appReducer, undefined, createDemoState);
  const [token, setToken] = useState(() => (live ? browserAccessToken() : ""));
  const [status, setStatus] = useState<ConnectionStatus>(
    live ? (token ? "loading" : "auth") : "ready",
  );
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [connection, setConnection] = useState<RuntimeConnection>("connected");
  const hasSnapshot = useRef(!live);
  const client = useMemo(
    () => (token ? new HerdrApiClient(token) : null),
    [token],
  );

  const refresh = useCallback(async () => {
    if (!live || !client) return;
    try {
      const payload = await client.state();
      dispatch({ type: "runtime.synced", state: mapLiveSnapshot(payload) });
      hasSnapshot.current = true;
      setConnection("connected");
      setError("");
      setStatus("ready");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Cannot reach herdr";
      setError(message);
      const unauthorized =
        typeof requestError === "object" &&
        requestError !== null &&
        "status" in requestError &&
        requestError.status === 401;
      if (unauthorized) {
        hasSnapshot.current = false;
        setStatus("auth");
      } else if (hasSnapshot.current) {
        setConnection("reconnecting");
        setStatus("ready");
      } else {
        setStatus("error");
      }
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
    connection,
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
    promptAgent: async (agentId, message, image) => {
      if (!live) {
        dispatch({
          type: "agent.replied",
          agentId,
          message: image ? promptWithImage(message, image.name) : message,
        });
        return;
      }
      await mutate(async (api) => {
        const prompt = image
          ? promptWithImage(
              message,
              (await api.uploadImage(agentId, image)).path,
            )
          : message;
        return api.promptAgent(agentId, prompt);
      });
    },
    refresh,
    setAccessToken: (value) => {
      const next = value.trim();
      if (!next) return;
      rememberAccessToken(next);
      hasSnapshot.current = false;
      setConnection("connected");
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
