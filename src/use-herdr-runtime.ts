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
  HerdrBridgeError,
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
export type MutationOutcome = "rejected" | "unknown";

export class HerdrMutationError extends Error {
  readonly outcome: MutationOutcome;
  readonly stage: "action" | "prompt" | "upload";
  readonly uploadedPath?: string;

  constructor(
    message: string,
    outcome: MutationOutcome,
    uploadedPath?: string,
    stage: "action" | "prompt" | "upload" = "action",
  ) {
    super(message);
    this.name = "HerdrMutationError";
    this.outcome = outcome;
    this.stage = stage;
    this.uploadedPath = uploadedPath;
  }
}

interface PromptResult {
  uploadedPath?: string;
}

interface HerdrRuntime {
  actionError: string;
  clearActionError: () => void;
  closePane: (agentId: string, paneId: string) => Promise<void>;
  connection: RuntimeConnection;
  createSession: (input: NewLiveSession) => Promise<void>;
  dispatch: (action: HerdrAction) => void;
  error: string;
  lastUpdatedAt: number;
  promptAgent: (
    agentId: string,
    message: string,
    image?: File,
    uploadedPath?: string,
    uploadPaneId?: string,
  ) => Promise<PromptResult>;
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

export function useHerdrRuntime(
  live: boolean,
  initialState?: HerdrState,
): HerdrRuntime {
  const [state, dispatch] = useReducer(
    appReducer,
    initialState,
    (provided) => provided ?? createDemoState(),
  );
  const [token, setToken] = useState(() => (live ? browserAccessToken() : ""));
  const [status, setStatus] = useState<ConnectionStatus>(
    live ? (token ? "loading" : "auth") : "ready",
  );
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [connection, setConnection] = useState<RuntimeConnection>("connected");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());
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
      setLastUpdatedAt(Date.now());
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
    async <T>(
      action: (api: HerdrApiClient) => Promise<T>,
      uploadedPath?: () => string | undefined,
      stage?: () => "action" | "prompt" | "upload",
    ): Promise<T | undefined> => {
      if (!live || !client) return undefined;
      setActionError("");
      try {
        const result = await action(client);
        await refresh();
        return result;
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Herdr action failed";
        const error = new HerdrMutationError(
          message,
          requestError instanceof HerdrBridgeError ? "rejected" : "unknown",
          uploadedPath?.(),
          stage?.(),
        );
        setActionError(
          error.outcome === "unknown"
            ? "The result could not be confirmed. Check Herdr before trying again."
            : error.message,
        );
        throw error;
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
    lastUpdatedAt,
    promptAgent: async (
      agentId,
      message,
      image,
      existingUploadedPath,
      uploadPaneId,
    ) => {
      if (!live) {
        dispatch({
          type: "agent.replied",
          agentId,
          message: image ? promptWithImage(message, image.name) : message,
        });
        return {};
      }
      let uploadedPath = existingUploadedPath;
      let stage: "prompt" | "upload" =
        image && !uploadedPath ? "upload" : "prompt";
      await mutate(
        async (api) => {
          if (image && !uploadedPath) {
            uploadedPath = (
              await api.uploadImage(uploadPaneId ?? agentId, image)
            ).path;
            stage = "prompt";
          }
          const prompt = uploadedPath
            ? promptWithImage(message, uploadedPath)
            : message;
          return api.promptAgent(agentId, prompt);
        },
        () => uploadedPath,
        () => stage,
      );
      return { uploadedPath };
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
