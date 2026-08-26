import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  type AgentLifecycleAction,
  browserAccessToken,
  HerdrApiClient,
  HerdrBridgeError,
  type IntegrationAction,
  type IntegrationTarget,
  type NewLiveSession,
  type NewLiveTerminal,
  type NewLiveWorkspace,
  normalizeWorkspacePath,
  type PluginActionInfo,
  type PluginInfo,
  type PluginLogInfo,
  rememberAccessToken,
  type TerminalTicket,
  type TerminalTicketInput,
  type UploadedFile,
  type UploadedImage,
  workspaceLabelFromPath,
} from "./herdr-api";
import { mapLiveSnapshot } from "./live-state";
import {
  appReducer,
  createDemoState,
  type HerdrAction,
  type HerdrState,
  type PaneSplitDirection,
} from "./state";

export type ConnectionStatus = "auth" | "error" | "loading" | "ready";

export type RuntimeConnection = "connected" | "reconnecting";
export type AccessRole = "controller" | "viewer";
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

export interface RuntimeManagementState {
  actions: PluginActionInfo[];
  logs: PluginLogInfo[];
  plugins: PluginInfo[];
}

interface HerdrRuntime {
  accessRole: AccessRole;
  actionError: string;
  clearActionError: () => void;
  agentLifecycle: (
    agentId: string,
    action: AgentLifecycleAction,
  ) => Promise<void>;
  closePane: (agentId: string, paneId: string) => Promise<void>;
  closeTab: (agentId: string, tabId: string) => Promise<void>;
  connection: RuntimeConnection;
  createSession: (input: NewLiveSession) => Promise<void>;
  createTerminal: (input: NewLiveTerminal) => Promise<void>;
  createWorkspace: (input: NewLiveWorkspace) => Promise<void>;
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
  invokePluginAction: (actionId: string) => Promise<void>;
  loadRuntimeManagement: () => Promise<RuntimeManagementState>;
  manageIntegration: (
    target: IntegrationTarget,
    action: IntegrationAction,
  ) => Promise<void>;
  moveTab: (
    agentId: string,
    tabId: string,
    direction: "left" | "right",
  ) => Promise<void>;
  renameTab: (agentId: string, tabId: string, label: string) => Promise<void>;
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
  resizePanes: (agentId: string, tabId: string, ratio: number) => Promise<void>;
  setAccessToken: (token: string) => void;
  splitPane: (
    agentId: string,
    paneId: string,
    direction: PaneSplitDirection,
  ) => Promise<void>;
  state: HerdrState;
  status: ConnectionStatus;
  terminalTicket: (
    paneId: string,
    input: TerminalTicketInput,
  ) => Promise<TerminalTicket>;
  uploadFile: (paneId: string, file: File) => Promise<UploadedFile>;
  uploadImage: (paneId: string, image: File) => Promise<UploadedImage>;
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
  const [accessRole, setAccessRole] = useState<AccessRole>("controller");
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
      setAccessRole(
        payload.access?.role === "viewer" ? "viewer" : "controller",
      );
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
    let pending = false;
    let eventRetry = 0;
    let eventRefresh = 0;
    let fallbackPoll = 0;
    const controller = new AbortController();
    const update = async () => {
      if (stopped) return;
      if (running) {
        pending = true;
        return;
      }
      running = true;
      await refresh();
      running = false;
      if (pending) {
        pending = false;
        void update();
      }
    };
    const startFallbackPolling = () => {
      if (fallbackPoll) return;
      fallbackPoll = window.setInterval(() => void update(), 1_500);
    };
    const subscribe = async () => {
      try {
        await client.events(
          controller.signal,
          () => {
            window.clearTimeout(eventRefresh);
            eventRefresh = window.setTimeout(() => void update(), 75);
          },
          () => {
            window.clearInterval(fallbackPoll);
            fallbackPoll = 0;
          },
        );
      } catch {
        if (stopped) return;
        startFallbackPolling();
      }
      if (!stopped) {
        eventRetry = window.setTimeout(() => void subscribe(), 2_000);
      }
    };
    void update();
    void subscribe();
    const safetyRefresh = window.setInterval(() => void update(), 30_000);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(fallbackPoll);
      window.clearInterval(safetyRefresh);
      window.clearTimeout(eventRefresh);
      window.clearTimeout(eventRetry);
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
      let result: T;
      try {
        result = await action(client);
      } catch (requestError) {
        const message =
          requestError instanceof HerdrBridgeError &&
          requestError.code === "agent_blocked"
            ? "This Agent is waiting for approval or an answer. Respond in the terminal before sending another prompt."
            : requestError instanceof Error
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
      // A confirmed mutation must remain successful when its follow-up snapshot
      // cannot be refreshed. `refresh` records connection failures itself.
      await refresh().catch(() => undefined);
      return result;
    },
    [client, live, refresh],
  );

  return {
    accessRole,
    actionError,
    clearActionError: () => setActionError(""),
    connection,
    agentLifecycle: async (agentId, action) => {
      if (!live) return;
      await mutate((api) => api.agentLifecycle(agentId, action));
    },
    closePane: async (agentId, paneId) => {
      if (!live) {
        dispatch({ type: "pane.closed", agentId, paneId });
        return;
      }
      await mutate((api) => api.closePane(paneId));
    },
    closeTab: async (agentId, tabId) => {
      if (!live) {
        dispatch({ type: "session.closed", agentId });
        return;
      }
      await mutate((api) => api.closeTab(tabId));
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
    createTerminal: async (input) => {
      if (!live) {
        dispatch({
          type: "terminal.created",
          id: `terminal-web-${Date.now()}`,
          ...input,
        });
        return;
      }
      await mutate((api) => api.createTerminal(input));
    },
    createWorkspace: async (input) => {
      if (!live) {
        const path = normalizeWorkspacePath(input.cwd);
        const fallbackLabel = workspaceLabelFromPath(path) || "space";
        dispatch({
          type: "workspace.created",
          id: `space-web-${Date.now()}`,
          label: input.label?.trim() || fallbackLabel,
          path,
        });
        return;
      }
      const created = await mutate((api) => api.createWorkspace(input));
      const workspaceId = created?.workspace?.workspace_id;
      if (!workspaceId) {
        const error = new HerdrMutationError(
          "Herdr did not return the new Space.",
          "unknown",
        );
        setActionError(error.message);
        throw error;
      }
      dispatch({ type: "workspace.selected", workspaceId });
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
    invokePluginAction: async (actionId) => {
      if (!live) return;
      await mutate((api) => api.invokePluginAction(actionId));
    },
    loadRuntimeManagement: async () => {
      if (!live || !client) return { actions: [], logs: [], plugins: [] };
      const [plugins, actions, logs] = await Promise.all([
        client.plugins(),
        client.pluginActions(),
        client.pluginLogs(),
      ]);
      return {
        actions: actions.actions,
        logs: logs.logs,
        plugins: plugins.plugins,
      };
    },
    manageIntegration: async (target, action) => {
      if (!live) return;
      await mutate((api) => api.manageIntegration(target, action));
    },
    moveTab: async (agentId, tabId, direction) => {
      if (!live) {
        dispatch({ type: "tab.moved", agentId, direction });
        return;
      }
      await mutate((api) => api.moveTab(tabId, direction));
    },
    renameTab: async (agentId, tabId, label) => {
      if (!live) {
        dispatch({ type: "session.renamed", agentId, label });
        return;
      }
      await mutate((api) => api.renameTab(tabId, label));
    },
    setPluginEnabled: async (pluginId, enabled) => {
      if (!live) return;
      await mutate((api) => api.setPluginEnabled(pluginId, enabled));
    },
    resizePanes: async (agentId, tabId, ratio) => {
      if (!live) {
        dispatch({ type: "pane.resized", agentId, ratio });
        return;
      }
      if (!tabId) {
        const error = new HerdrMutationError(
          "This session has no Herdr tab to resize.",
          "rejected",
        );
        setActionError(error.message);
        throw error;
      }
      await mutate((api) => api.setSplitRatio(tabId, [], ratio));
    },
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
    splitPane: async (agentId, paneId, direction) => {
      if (!live) {
        dispatch({
          type: "pane.split",
          agentId,
          paneId: `pane-web-${Date.now()}`,
          direction,
        });
        return;
      }
      await mutate((api) => api.splitPane(paneId, direction));
    },
    state,
    status,
    terminalTicket: async (paneId, input) => {
      if (!client) throw new Error("A live Herdr connection is required");
      return client.terminalTicket(paneId, input);
    },
    uploadFile: async (paneId, file) => {
      if (!client) throw new Error("A live Herdr connection is required");
      return client.uploadFile(paneId, file);
    },
    uploadImage: async (paneId, image) => {
      if (!client) throw new Error("A live Herdr connection is required");
      return client.uploadImage(paneId, image);
    },
  };
}
