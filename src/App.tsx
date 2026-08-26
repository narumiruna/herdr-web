import {
  BellIcon,
  CheckCircledIcon,
  Cross2Icon,
  DotsHorizontalIcon,
  HamburgerMenuIcon,
  InfoCircledIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PlusIcon,
  ReloadIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Button, IconButton, Theme } from "@radix-ui/themes";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CommandPalette,
  KeybindingsDialog,
  NewSessionDialog,
  NewSpaceDialog,
  SettingsDialog,
} from "./components/AppDialogs";
import { ConnectionScreen } from "./components/ConnectionScreen";
import { HerdrWebLogo } from "./components/HerdrWebLogo";
import { IconTooltip } from "./components/IconTooltip";
import { RadixDialog } from "./components/RadixDialog";
import { RuntimeManagementDialog } from "./components/RuntimeManagementDialog";
import { SessionDetails } from "./components/SessionDetails";
import { SessionTabs } from "./components/SessionTabs";
import { type AgentSortMode, Sidebar } from "./components/Sidebar";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  SidebarResizeHandle,
} from "./components/SidebarResizeHandle";
import {
  type ComposerDraft,
  EMPTY_COMPOSER_DRAFT,
  TerminalWorkspace,
} from "./components/TerminalWorkspace";
import { readProductStorage, writeProductStorage } from "./product-storage";
import { type HerdrState, type RuntimeName, tabsForWorkspace } from "./state";
import { parseTerminalFontSize } from "./terminal-preferences";
import {
  themeAppearance,
  themeBrowserColor,
  themeFromSavedPreferences,
  themeStyle,
  toggleThemeAppearance,
  type WorkbenchTheme,
} from "./theme-preferences";
import { useHerdrRuntime } from "./use-herdr-runtime";

// This composition root intentionally keeps shared workbench selection, draft,
// dialog-focus restoration, and mutation recovery in one owner; feature-heavy
// dialog and terminal implementations remain split into dedicated components.
interface AppProps {
  initialState?: HerdrState;
  live?: boolean;
}

interface PendingLaunch {
  agentId?: string;
  command: string;
  error?: string;
  existingAgentIds: string[];
  label: string;
  originAgentId: string;
  runtime: RuntimeName;
  status: "error" | "ready" | "starting";
  workspaceId: string;
}

export function App({
  initialState,
  live = import.meta.env.VITE_DEMO_MODE !== "true",
}: AppProps) {
  const runtime = useHerdrRuntime(live, initialState);
  const { state } = runtime;
  const [workbenchTheme, setWorkbenchTheme] = useState<WorkbenchTheme>(() => {
    if (typeof window.localStorage?.getItem !== "function") {
      return "editorial-dark";
    }
    return themeFromSavedPreferences(
      readProductStorage(window.localStorage, "theme"),
      readProductStorage(window.localStorage, "appearance"),
    );
  });
  const appearance = themeAppearance(workbenchTheme);
  const style = themeStyle(workbenchTheme);
  const [pinnedWorkspaceIds, setPinnedWorkspaceIds] = useState<string[]>(() => {
    const saved =
      typeof window.localStorage?.getItem === "function"
        ? readProductStorage(window.localStorage, "pinned-workspaces")
        : null;
    try {
      const parsed = JSON.parse(saved ?? "[]") as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [recentWorkspaceIds, setRecentWorkspaceIds] = useState<string[]>(() => {
    const saved =
      typeof window.localStorage?.getItem === "function"
        ? readProductStorage(window.localStorage, "recent-workspaces")
        : null;
    try {
      const parsed = JSON.parse(saved ?? "[]") as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [agentSort, setAgentSort] = useState<AgentSortMode>(() => {
    const saved =
      typeof window.localStorage?.getItem === "function"
        ? readProductStorage(window.localStorage, "agent-sort")
        : null;
    return saved === "priority" ? "priority" : "grouped";
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored =
      typeof window.localStorage?.getItem === "function"
        ? readProductStorage(window.localStorage, "sidebar-width")
        : null;
    const saved = stored === null ? Number.NaN : Number(stored);
    return Number.isFinite(saved)
      ? clampSidebarWidth(saved)
      : DEFAULT_SIDEBAR_WIDTH;
  });
  const [terminalFontSize, setTerminalFontSize] = useState(() =>
    parseTerminalFontSize(
      typeof window.localStorage?.getItem === "function"
        ? readProductStorage(window.localStorage, "terminal-font-size")
        : null,
    ),
  );
  const [commandOpen, setCommandOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const [keybindingsOpen, setKeybindingsOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () =>
      typeof window.Notification === "function" &&
      Notification.permission === "granted",
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ComposerDraft>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [clock, setClock] = useState(() => Date.now());
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch>();
  const [detachedPane, setDetachedPane] = useState<{
    paneId: string;
    sessionId: string;
  } | null>(null);
  const commandTrigger = useRef<HTMLButtonElement>(null);
  const mobileNavTrigger = useRef<HTMLButtonElement>(null);
  const mobileMoreTrigger = useRef<HTMLButtonElement>(null);
  const sessionReturnFocus = useRef<HTMLElement>(null);
  const newSpaceReturnFocus = useRef<HTMLElement>(null);
  const settingsReturnFocus = useRef<HTMLElement>(null);
  const runtimeReturnFocus = useRef<HTMLElement>(null);
  const keybindingsReturnFocus = useRef<HTMLElement>(null);
  const detailsReturnFocus = useRef<HTMLElement>(null);
  const commandWasOpen = useRef(false);
  const mobileNavWasOpen = useRef(false);
  const mobileActionsWereOpen = useRef(false);
  const sessionWasOpen = useRef(false);
  const newSpaceWasOpen = useRef(false);
  const settingsWasOpen = useRef(false);
  const runtimeWasOpen = useRef(false);
  const keybindingsWereOpen = useRef(false);
  const detailsWereOpen = useRef(false);
  const notifiedAgentState = useRef<Record<string, string>>({});
  const workspace =
    state.workspaces.find(({ id }) => id === state.selectedWorkspaceId) ??
    state.workspaces[0];
  const agent =
    state.agents.find(
      ({ id, workspaceId }) =>
        id === state.selectedAgentId && workspaceId === workspace?.id,
    ) ??
    state.agents.find(
      ({ workspaceId }) => workspace && workspaceId === workspace.id,
    );
  const workspaceTabs = workspace ? tabsForWorkspace(state, workspace.id) : [];
  const canCreateSpace =
    runtime.connection === "connected" && runtime.accessRole === "controller";
  const canStartAgent = canCreateSpace && pendingLaunch?.status !== "starting";
  const statusCounts = state.agents.reduce(
    (counts, session) => {
      if (session.kind !== "agent") return counts;
      if (session.status === "blocked") counts.needsInput += 1;
      else if (session.status === "done") counts.completed += 1;
      else if (session.status === "working") counts.working += 1;
      else counts.unknown += 1;
      return counts;
    },
    { completed: 0, needsInput: 0, unknown: 0, working: 0 },
  );

  useEffect(() => {
    const previousTitle = document.title;
    if (runtime.status !== "ready") {
      document.title = "herdr-web — agent workbench";
    } else {
      const context = [agent?.label, workspace?.name]
        .filter(Boolean)
        .join(" · ");
      document.title = `${statusCounts.needsInput ? `(${statusCounts.needsInput}) ` : ""}${context || "Workbench"} — herdr-web`;
    }
    return () => {
      document.title = previousTitle;
    };
  }, [agent?.label, runtime.status, statusCounts.needsInput, workspace?.name]);

  const updateDraft = useCallback(
    (agentId: string, update: Partial<ComposerDraft>) => {
      setDrafts((current) => ({
        ...current,
        [agentId]: {
          ...(current[agentId] ?? EMPTY_COMPOSER_DRAFT),
          ...update,
        },
      }));
    },
    [],
  );

  const rememberWorkspace = useCallback((workspaceId: string) => {
    setRecentWorkspaceIds((current) =>
      [workspaceId, ...current.filter((id) => id !== workspaceId)].slice(0, 9),
    );
  }, []);

  useEffect(() => {
    if (commandWasOpen.current && !commandOpen) commandTrigger.current?.focus();
    commandWasOpen.current = commandOpen;
  }, [commandOpen]);

  useEffect(() => {
    if (mobileNavWasOpen.current && !mobileNavOpen) {
      mobileNavTrigger.current?.focus();
    }
    mobileNavWasOpen.current = mobileNavOpen;
  }, [mobileNavOpen]);

  useEffect(() => {
    if (mobileActionsWereOpen.current && !mobileActionsOpen) {
      mobileMoreTrigger.current?.focus();
    }
    mobileActionsWereOpen.current = mobileActionsOpen;
  }, [mobileActionsOpen]);

  useEffect(() => {
    if (sessionWasOpen.current && !sessionOpen)
      sessionReturnFocus.current?.focus();
    sessionWasOpen.current = sessionOpen;
  }, [sessionOpen]);

  useEffect(() => {
    if (newSpaceWasOpen.current && !newSpaceOpen) {
      (newSpaceReturnFocus.current?.isConnected
        ? newSpaceReturnFocus.current
        : mobileNavTrigger.current
      )?.focus();
    }
    newSpaceWasOpen.current = newSpaceOpen;
  }, [newSpaceOpen]);

  useEffect(() => {
    if (settingsWasOpen.current && !settingsOpen) {
      (settingsReturnFocus.current?.isConnected
        ? settingsReturnFocus.current
        : mobileNavTrigger.current
      )?.focus();
    }
    settingsWasOpen.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    if (runtimeWasOpen.current && !runtimeOpen) {
      (runtimeReturnFocus.current?.isConnected
        ? runtimeReturnFocus.current
        : mobileNavTrigger.current
      )?.focus();
    }
    runtimeWasOpen.current = runtimeOpen;
  }, [runtimeOpen]);

  useEffect(() => {
    if (keybindingsWereOpen.current && !keybindingsOpen) {
      (keybindingsReturnFocus.current?.isConnected
        ? keybindingsReturnFocus.current
        : mobileNavTrigger.current
      )?.focus();
    }
    keybindingsWereOpen.current = keybindingsOpen;
  }, [keybindingsOpen]);

  useEffect(() => {
    if (detailsWereOpen.current && !detailsOpen)
      detailsReturnFocus.current?.focus();
    detailsWereOpen.current = detailsOpen;
  }, [detailsOpen]);

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      writeProductStorage(window.localStorage, "agent-sort", agentSort);
    }
  }, [agentSort]);

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      writeProductStorage(
        window.localStorage,
        "pinned-workspaces",
        JSON.stringify(pinnedWorkspaceIds),
      );
    }
  }, [pinnedWorkspaceIds]);

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      writeProductStorage(
        window.localStorage,
        "recent-workspaces",
        JSON.stringify(recentWorkspaceIds),
      );
    }
  }, [recentWorkspaceIds]);

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      writeProductStorage(
        window.localStorage,
        "sidebar-width",
        String(sidebarWidth),
      );
    }
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      writeProductStorage(
        window.localStorage,
        "terminal-font-size",
        String(terminalFontSize),
      );
    }
  }, [terminalFontSize]);

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      writeProductStorage(window.localStorage, "theme", workbenchTheme);
      writeProductStorage(window.localStorage, "appearance", appearance);
    }
    document.documentElement.classList.toggle("dark", appearance === "dark");
    document.documentElement.classList.toggle("light", appearance === "light");
    document.documentElement.classList.toggle(
      "theme-editorial",
      style === "editorial",
    );
    document.documentElement.classList.toggle(
      "theme-classic",
      style === "classic",
    );
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeBrowserColor(workbenchTheme));
  }, [appearance, style, workbenchTheme]);

  useEffect(() => {
    if (runtime.connection !== "reconnecting") return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [runtime.connection]);

  useEffect(() => {
    if (pendingLaunch?.status !== "ready") return;
    const created = state.agents.find(
      ({ id, label, workspaceId }) =>
        workspaceId === pendingLaunch.workspaceId &&
        label === pendingLaunch.label &&
        !pendingLaunch.existingAgentIds.includes(id),
    );
    if (!created || pendingLaunch.agentId === created.id) return;
    setPendingLaunch((current) =>
      current ? { ...current, agentId: created.id } : current,
    );
    if (
      state.selectedWorkspaceId === pendingLaunch.workspaceId &&
      state.selectedAgentId === pendingLaunch.originAgentId
    ) {
      runtime.dispatch({ type: "agent.selected", agentId: created.id });
    }
  }, [
    pendingLaunch,
    runtime,
    state.agents,
    state.selectedAgentId,
    state.selectedWorkspaceId,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if (event.altKey && /^[1-9]$/.test(event.key)) {
        const workspaceId = state.workspaces[Number(event.key) - 1]?.id;
        if (workspaceId) {
          event.preventDefault();
          rememberWorkspace(workspaceId);
          runtime.dispatch({ type: "workspace.selected", workspaceId });
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rememberWorkspace, runtime, state.workspaces]);

  useEffect(() => {
    if (runtime.status !== "ready") return;
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("session")?.trim();
    const workspaceId = url.searchParams.get("workspace")?.trim();
    const paneId = url.searchParams.get("pane")?.trim();
    const detached = url.searchParams.get("detached") === "1";
    const linkedSession = state.agents.find(({ id }) => id === sessionId);
    const linkedPane = linkedSession?.panes.find(({ id }) => id === paneId);
    if (sessionId && linkedSession) {
      runtime.dispatch({ type: "agent.selected", agentId: sessionId });
      if (linkedPane) {
        runtime.dispatch({
          type: "pane.selected",
          agentId: sessionId,
          paneId: linkedPane.id,
        });
      }
      if (detached) {
        setDetachedPane({
          paneId: linkedPane?.id ?? linkedSession.activePaneId,
          sessionId,
        });
      }
      url.searchParams.delete("session");
      url.searchParams.delete("workspace");
      url.searchParams.delete("pane");
      url.searchParams.delete("detached");
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    } else if (
      workspaceId &&
      state.workspaces.some(({ id }) => id === workspaceId)
    ) {
      runtime.dispatch({ type: "workspace.selected", workspaceId });
      url.searchParams.delete("workspace");
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [runtime, state.agents, state.workspaces]);

  useEffect(() => {
    if (!notificationsEnabled || typeof window.Notification !== "function")
      return;
    if (Notification.permission !== "granted") return;
    for (const session of state.agents) {
      if (session.kind !== "agent") continue;
      const previous = notifiedAgentState.current[session.id];
      notifiedAgentState.current[session.id] = session.status;
      if (previous === undefined || previous === session.status) continue;
      if (session.status !== "blocked" && session.status !== "done") continue;
      const target = state.workspaces.find(
        ({ id }) => id === session.workspaceId,
      );
      const url = new URL(window.location.href);
      url.searchParams.set("workspace", session.workspaceId);
      url.searchParams.set("session", session.id);
      const notification = new Notification(
        session.status === "blocked"
          ? `${session.label} needs input`
          : `${session.label} completed`,
        {
          body: `${target?.name ?? "Herdr"} · ${session.currentStep || session.summary}`,
          tag: `herdr-web-${session.id}-${session.status}`,
        },
      );
      notification.onclick = () => {
        window.focus();
        window.history.pushState(
          {},
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
        runtime.dispatch({ type: "agent.selected", agentId: session.id });
        notification.close();
      };
    }
  }, [notificationsEnabled, runtime, state.agents, state.workspaces]);

  const requestNotifications = async () => {
    if (typeof window.Notification !== "function") return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
  };

  if (runtime.status !== "ready") {
    return (
      <Theme
        appearance={appearance}
        accentColor="amber"
        grayColor="sand"
        radius="medium"
        className={`herdr-web-theme theme-${style}`}
      >
        <ConnectionScreen
          error={runtime.error}
          status={runtime.status}
          onRetry={() => void runtime.refresh()}
          onToken={runtime.setAccessToken}
        />
      </Theme>
    );
  }

  const openSessionDialog = (returnFocus?: HTMLElement | null) => {
    sessionReturnFocus.current =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    setSessionOpen(true);
  };
  const openDetailsDialog = (returnFocus?: HTMLElement | null) => {
    detailsReturnFocus.current =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    setDetailsOpen(true);
  };
  const openNewSpaceDialog = (returnFocus?: HTMLElement | null) => {
    newSpaceReturnFocus.current =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    setNewSpaceOpen(true);
  };
  const openSettingsDialog = (returnFocus?: HTMLElement | null) => {
    settingsReturnFocus.current =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    setSettingsOpen(true);
  };
  const openRuntimeDialog = (returnFocus?: HTMLElement | null) => {
    if (runtime.accessRole !== "controller") return;
    runtimeReturnFocus.current =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    setRuntimeOpen(true);
  };
  const openKeybindingsDialog = (returnFocus?: HTMLElement | null) => {
    keybindingsReturnFocus.current =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    setKeybindingsOpen(true);
  };
  const selectWorkspace = (workspaceId: string) => {
    rememberWorkspace(workspaceId);
    runtime.dispatch({ type: "workspace.selected", workspaceId });
  };
  const togglePinnedWorkspace = (workspaceId: string) => {
    setPinnedWorkspaceIds((current) =>
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [workspaceId, ...current].slice(0, 9),
    );
  };
  const selectAgent = (agentId: string) => {
    runtime.dispatch({ type: "agent.selected", agentId });
  };
  const createWorkspace = async (input: { cwd: string; label?: string }) => {
    if (!canCreateSpace) {
      throw new Error("A connected controller is required to create a Space.");
    }
    try {
      await runtime.createWorkspace(input);
    } catch (error) {
      runtime.clearActionError();
      throw error;
    }
  };
  const createTerminal = async (returnFocus?: HTMLElement | null) => {
    if (!workspace?.id || !canStartAgent) return;
    const label = window.prompt("Terminal tab name", "Terminal")?.trim();
    returnFocus?.focus();
    if (!label) return;
    try {
      await runtime.createTerminal({ label, workspaceId: workspace.id });
    } catch {
      // `mutate` already records rejected or unknown outcomes in actionError.
    }
  };

  const renameSession = async (session: typeof agent) => {
    if (!session?.tabId) return;
    const label = window.prompt("Rename tab", session.label)?.trim();
    if (!label || label === session.label) return;
    try {
      await runtime.renameTab(session.id, session.tabId, label);
    } catch {
      // `mutate` already records rejected or unknown outcomes in actionError.
    }
  };

  const closeSession = async (session: typeof agent) => {
    if (!session?.tabId) return;
    if (!window.confirm(`Close ${session.label} tab for every Herdr client?`))
      return;
    try {
      await runtime.closeTab(session.id, session.tabId);
    } catch {
      // `mutate` already records rejected or unknown outcomes in actionError.
    }
  };

  const moveSession = async (
    session: NonNullable<typeof agent>,
    direction: "left" | "right",
  ) => {
    if (!session.tabId) return;
    try {
      await runtime.moveTab(session.id, session.tabId, direction);
    } catch {
      // `mutate` already records rejected or unknown outcomes in actionError.
    }
  };

  const runAgentLifecycle = async (
    session: NonNullable<typeof agent>,
    action: "archive" | "clear" | "restart" | "stop",
  ) => {
    const destructive =
      action === "archive" || action === "clear" || action === "stop";
    if (
      destructive &&
      !window.confirm(`${action} ${session.label} for every Herdr client?`)
    )
      return;
    try {
      await runtime.agentLifecycle(session.id, action);
    } catch {
      // `mutate` already records rejected or unknown outcomes in actionError.
    }
  };

  const createSession = (
    details: {
      label: string;
      runtime: RuntimeName;
      command: string;
    },
    targetWorkspaceId = workspace?.id,
  ) => {
    if (!targetWorkspaceId || !canStartAgent) return;
    const launch: PendingLaunch = {
      ...details,
      existingAgentIds: state.agents.map(({ id }) => id),
      originAgentId: state.selectedAgentId,
      status: "starting",
      workspaceId: targetWorkspaceId,
    };
    setPendingLaunch(launch);
    void runtime
      .createSession({ workspaceId: targetWorkspaceId, ...details })
      .then(() =>
        setPendingLaunch((current) =>
          current ? { ...current, status: "ready" } : current,
        ),
      )
      .catch((error) => {
        runtime.clearActionError();
        setPendingLaunch((current) =>
          current
            ? {
                ...current,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not start the Agent.",
                status: "error",
              }
            : current,
        );
      });
  };

  const detachedSession = detachedPane
    ? state.agents.find(({ id }) => id === detachedPane.sessionId)
    : undefined;
  const detachedSelectedPane = detachedSession?.panes.find(
    ({ id }) => id === detachedPane?.paneId,
  );
  const detachedAgent =
    detachedSession && detachedSelectedPane
      ? {
          ...detachedSession,
          activePaneId: detachedSelectedPane.id,
          paneSplit: undefined,
          panes: [detachedSelectedPane],
        }
      : undefined;

  const terminalWorkspace = (session: NonNullable<typeof agent>) => (
    <TerminalWorkspace
      actionsEnabled={
        runtime.connection === "connected" &&
        runtime.accessRole === "controller"
      }
      agent={session}
      createTerminalTicket={runtime.terminalTicket}
      draft={drafts[session.id] ?? EMPTY_COMPOSER_DRAFT}
      isSending={sending[session.id] === true}
      workspace={
        state.workspaces.find(({ id }) => id === session.workspaceId) ??
        workspace ??
        state.workspaces[0]
      }
      onClearDraft={(agentId) =>
        setDrafts((current) => ({
          ...current,
          [agentId]: EMPTY_COMPOSER_DRAFT,
        }))
      }
      onDraftChange={updateDraft}
      onMessage={(message, image, uploadedPath) =>
        runtime.promptAgent(
          session.id,
          message,
          image,
          uploadedPath,
          session.activePaneId,
        )
      }
      onMessageFailure={runtime.clearActionError}
      onRetryOutput={runtime.refresh}
      onSendingChange={(agentId, value) =>
        setSending((current) => ({
          ...current,
          [agentId]: value,
        }))
      }
      onSplitPane={(direction) =>
        runtime.splitPane(session.id, session.activePaneId, direction)
      }
      onResizePanes={(ratio) =>
        runtime.resizePanes(session.id, session.tabId ?? "", ratio)
      }
      onUploadFile={runtime.uploadFile}
      onUploadImage={runtime.uploadImage}
      onSelectPane={(paneId) =>
        runtime.dispatch({
          type: "pane.selected",
          agentId: session.id,
          paneId,
        })
      }
      onClosePane={async (paneId) => {
        try {
          await runtime.closePane(session.id, paneId);
        } catch (error) {
          runtime.clearActionError();
          throw error;
        }
      }}
      terminalControlEnabled={runtime.accessRole === "controller"}
      terminalEnabled={runtime.status === "ready"}
      terminalFontSize={terminalFontSize}
      terminalReason={state.capabilities.terminalReason}
      onTerminalFontSizeChange={setTerminalFontSize}
      terminalStreaming={state.capabilities.terminalStreaming}
    />
  );

  if (detachedAgent) {
    return (
      <Theme
        appearance={appearance}
        accentColor="amber"
        grayColor="sand"
        radius="medium"
        scaling="100%"
        className={`herdr-web-theme theme-${style}`}
      >
        <Tooltip.Provider>
          <main
            className="detached-pane-shell"
            aria-label={`Detached pane ${detachedSelectedPane?.title ?? detachedSelectedPane?.id}`}
          >
            <header className="detached-pane-header">
              <span className="mobile-brand-mark">
                <HerdrWebLogo compact />
              </span>
              <div>
                <strong>{detachedSession?.label}</strong>
                <span>{detachedSelectedPane?.title}</span>
              </div>
              <span
                className="connection-state"
                data-state={runtime.connection}
                title={
                  runtime.connection === "connected"
                    ? "Connected"
                    : "Reconnecting"
                }
              >
                <i aria-hidden="true" />
                <span className="sr-only">
                  {runtime.connection === "connected"
                    ? "Connected"
                    : "Reconnecting"}
                </span>
              </span>
            </header>
            {runtime.actionError && (
              <div className="runtime-error" role="alert">
                <span>{runtime.actionError}</span>
                <button
                  type="button"
                  aria-label="Dismiss action error"
                  onClick={runtime.clearActionError}
                >
                  <Cross2Icon />
                </button>
              </div>
            )}
            {terminalWorkspace(detachedAgent)}
          </main>
        </Tooltip.Provider>
      </Theme>
    );
  }

  return (
    <Theme
      appearance={appearance}
      accentColor="amber"
      grayColor="sand"
      radius="medium"
      scaling="100%"
      className={`herdr-web-theme theme-${style}`}
    >
      <Tooltip.Provider>
        <div
          className="app-shell"
          style={{
            gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr)`,
          }}
        >
          <div className="desktop-sidebar">
            <Sidebar
              state={state}
              agentSort={agentSort}
              canCreateSpace={canCreateSpace}
              onAgentSortChange={setAgentSort}
              onSelectWorkspace={selectWorkspace}
              onSelectAgent={selectAgent}
              onNewSpace={openNewSpaceDialog}
              onOpenSettings={openSettingsDialog}
              onOpenKeybindings={openKeybindingsDialog}
              onOpenRuntime={openRuntimeDialog}
              onRefresh={runtime.refresh}
            />
          </div>
          <SidebarResizeHandle
            width={sidebarWidth}
            onResize={setSidebarWidth}
          />

          <div className="app-surface">
            <header className="topbar">
              <div className="topbar-context">
                <IconButton
                  ref={mobileNavTrigger}
                  variant="ghost"
                  color="gray"
                  className="mobile-nav-trigger"
                  aria-label="Open navigation"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <HamburgerMenuIcon />
                </IconButton>
                <span className="mobile-brand-mark">
                  <HerdrWebLogo compact />
                </span>
                <strong>{workspace?.name ?? "herdr-web"}</strong>
              </div>

              <div className="topbar-actions">
                <div
                  className="work-status-summary"
                  role="status"
                  aria-label={`${statusCounts.needsInput} Agents need input, ${statusCounts.working} working, ${statusCounts.completed} completed, ${statusCounts.unknown} unknown`}
                >
                  <span data-kind="needs-input">
                    {statusCounts.needsInput} needs input
                  </span>
                  <span data-kind="working">
                    {statusCounts.working} working
                  </span>
                  <span data-kind="completed">
                    {statusCounts.completed} done
                  </span>
                  {statusCounts.unknown > 0 && (
                    <span data-kind="unknown">
                      {statusCounts.unknown} unknown
                    </span>
                  )}
                </div>
                {typeof window.Notification === "function" &&
                  Notification.permission !== "granted" && (
                    <IconTooltip label="Enable browser notifications">
                      <IconButton
                        type="button"
                        variant="soft"
                        color="gray"
                        className="desktop-notifications"
                        aria-label="Enable browser notifications"
                        onClick={() => void requestNotifications()}
                      >
                        <BellIcon />
                      </IconButton>
                    </IconTooltip>
                  )}
                {workspace && (
                  <Button
                    type="button"
                    variant="soft"
                    color="gray"
                    className="desktop-new-agent"
                    disabled={!canStartAgent}
                    onClick={() => openSessionDialog()}
                  >
                    <PlusIcon /> New agent
                  </Button>
                )}
                <button
                  ref={commandTrigger}
                  type="button"
                  className="command-button"
                  aria-label="Open command palette"
                  onClick={() => setCommandOpen(true)}
                >
                  <MagnifyingGlassIcon />
                  <span>Jump</span>
                  <kbd>⌘ K</kbd>
                </button>
                {agent && (
                  <IconTooltip label="Session details">
                    <IconButton
                      type="button"
                      variant="soft"
                      color="gray"
                      className="desktop-details"
                      aria-label="Open details"
                      onClick={() => openDetailsDialog()}
                    >
                      <InfoCircledIcon />
                    </IconButton>
                  </IconTooltip>
                )}
                <IconTooltip
                  label={`Use ${appearance === "light" ? "dark" : "light"} appearance`}
                >
                  <IconButton
                    type="button"
                    variant="soft"
                    color="gray"
                    className="theme-toggle desktop-appearance"
                    aria-label={`Use ${appearance === "light" ? "dark" : "light"} appearance`}
                    onClick={() =>
                      setWorkbenchTheme((current) =>
                        toggleThemeAppearance(current),
                      )
                    }
                  >
                    {appearance === "light" ? <MoonIcon /> : <SunIcon />}
                  </IconButton>
                </IconTooltip>
                <IconButton
                  ref={mobileMoreTrigger}
                  type="button"
                  variant="soft"
                  color="gray"
                  className="mobile-more-trigger"
                  aria-label="Open more actions"
                  onClick={() => setMobileActionsOpen(true)}
                >
                  <DotsHorizontalIcon />
                </IconButton>
                <span
                  className="connection-state"
                  data-state={runtime.connection}
                  title={
                    runtime.connection === "connected"
                      ? "Connected"
                      : "Reconnecting"
                  }
                >
                  <i aria-hidden="true" />
                  <span className="sr-only">
                    {runtime.connection === "connected"
                      ? "Connected"
                      : "Reconnecting"}
                  </span>
                </span>
              </div>
            </header>

            {runtime.connection === "reconnecting" && (
              <div
                className="reconnect-banner"
                role="status"
                aria-label="Connection interrupted"
              >
                <span>
                  <ReloadIcon aria-hidden="true" />
                  <strong>Connection interrupted.</strong>
                  Showing the last update from{" "}
                  {Math.max(
                    0,
                    Math.floor((clock - runtime.lastUpdatedAt) / 1_000),
                  )}
                  s ago while Herdr reconnects.
                </span>
                <Button
                  type="button"
                  size="1"
                  variant="soft"
                  color="amber"
                  onClick={() => void runtime.refresh()}
                >
                  Retry now
                </Button>
              </div>
            )}

            {runtime.actionError && (
              <div className="runtime-error" role="alert">
                <span>{runtime.actionError}</span>
                <button
                  type="button"
                  aria-label="Dismiss action error"
                  onClick={runtime.clearActionError}
                >
                  <Cross2Icon />
                </button>
              </div>
            )}

            {pendingLaunch && (
              <div
                className="launch-notice"
                data-state={pendingLaunch.status}
                role={pendingLaunch.status === "error" ? "alert" : "status"}
              >
                <span>
                  {pendingLaunch.status === "ready" ? (
                    <CheckCircledIcon aria-hidden="true" />
                  ) : (
                    <ReloadIcon aria-hidden="true" />
                  )}
                  <strong>
                    {pendingLaunch.status === "starting"
                      ? `Starting ${pendingLaunch.label}…`
                      : pendingLaunch.status === "ready"
                        ? `${pendingLaunch.label} is ready.`
                        : `${pendingLaunch.label} could not start.`}
                  </strong>
                  {pendingLaunch.error && <small>{pendingLaunch.error}</small>}
                </span>
                <span className="launch-notice-actions">
                  {pendingLaunch.status === "ready" &&
                    pendingLaunch.agentId && (
                      <Button
                        type="button"
                        size="1"
                        variant="soft"
                        onClick={() => {
                          selectAgent(pendingLaunch.agentId ?? "");
                          setPendingLaunch(undefined);
                        }}
                      >
                        Open
                      </Button>
                    )}
                  {pendingLaunch.status === "error" && (
                    <Button
                      type="button"
                      size="1"
                      variant="soft"
                      color="red"
                      onClick={() =>
                        createSession(
                          {
                            command: pendingLaunch.command,
                            label: pendingLaunch.label,
                            runtime: pendingLaunch.runtime,
                          },
                          pendingLaunch.workspaceId,
                        )
                      }
                    >
                      Retry
                    </Button>
                  )}
                  {pendingLaunch.status !== "starting" && (
                    <button
                      type="button"
                      aria-label="Dismiss Agent launch status"
                      onClick={() => setPendingLaunch(undefined)}
                    >
                      <Cross2Icon />
                    </button>
                  )}
                </span>
              </div>
            )}

            {workspace && agent ? (
              <SessionTabs
                workspaceName={workspace.name}
                sessions={workspaceTabs}
                selectedId={agent.id}
                canCreateSession={canStartAgent}
                onAgentLifecycle={runAgentLifecycle}
                onCloseSession={closeSession}
                onMoveSession={moveSession}
                onNewSession={openSessionDialog}
                onNewTerminal={(returnFocus) =>
                  void createTerminal(returnFocus)
                }
                onRenameSession={renameSession}
                onSelect={selectAgent}
              >
                {terminalWorkspace(agent)}
              </SessionTabs>
            ) : (
              <main className="empty-workbench">
                <div className="empty-workbench-mark">
                  <HerdrWebLogo compact />
                </div>
                <span>{workspace ? "Empty Space" : "No Spaces"}</span>
                <h1>
                  {workspace
                    ? "Start your first Agent"
                    : "Open a Space in Herdr"}
                </h1>
                <p>
                  {workspace
                    ? "This Space has no Agent or Terminal sessions yet."
                    : "Create or focus a Herdr Space, then refresh this workbench."}
                </p>
                {workspace ? (
                  <Button
                    type="button"
                    color="amber"
                    disabled={!canStartAgent}
                    onClick={() => openSessionDialog()}
                  >
                    <PlusIcon /> Start Agent
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => void runtime.refresh()}
                  >
                    <ReloadIcon /> Retry
                  </Button>
                )}
              </main>
            )}
          </div>
        </div>

        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          pinnedWorkspaceIds={pinnedWorkspaceIds}
          recentWorkspaceIds={recentWorkspaceIds}
          state={state}
          onSelectWorkspace={selectWorkspace}
          onSelectAgent={selectAgent}
          onTogglePinnedWorkspace={togglePinnedWorkspace}
        />
        {workspace && (
          <NewSessionDialog
            open={sessionOpen}
            onOpenChange={setSessionOpen}
            workspace={workspace}
            onCreate={createSession}
          />
        )}
        <NewSpaceDialog
          open={newSpaceOpen}
          onOpenChange={setNewSpaceOpen}
          onCreate={createWorkspace}
        />
        <SettingsDialog
          theme={workbenchTheme}
          open={settingsOpen}
          terminalFontSize={terminalFontSize}
          onOpenChange={setSettingsOpen}
          onApply={(preferences) => {
            setWorkbenchTheme(preferences.theme);
            setTerminalFontSize(preferences.terminalFontSize);
          }}
        />
        <RuntimeManagementDialog
          open={runtimeOpen}
          onOpenChange={setRuntimeOpen}
          load={runtime.loadRuntimeManagement}
          onInvokePluginAction={runtime.invokePluginAction}
          onManageIntegration={runtime.manageIntegration}
          onSetPluginEnabled={runtime.setPluginEnabled}
        />
        <KeybindingsDialog
          open={keybindingsOpen}
          onOpenChange={setKeybindingsOpen}
        />
        <RadixDialog
          open={mobileNavOpen}
          onOpenChange={setMobileNavOpen}
          title="Navigate workbench"
          description="Choose work that needs input or a Space. Use the tab bar for Agents and Terminals."
          className="mobile-navigation-dialog"
        >
          <Sidebar
            state={state}
            agentSort={agentSort}
            canCreateSpace={canCreateSpace}
            onAgentSortChange={setAgentSort}
            onSelectWorkspace={selectWorkspace}
            onSelectAgent={selectAgent}
            onNewSpace={openNewSpaceDialog}
            onOpenSettings={openSettingsDialog}
            onOpenKeybindings={openKeybindingsDialog}
            onOpenRuntime={openRuntimeDialog}
            onRefresh={runtime.refresh}
            onDismiss={() => setMobileNavOpen(false)}
          />
        </RadixDialog>
        <RadixDialog
          open={mobileActionsOpen}
          onOpenChange={setMobileActionsOpen}
          title="More actions"
          description="Actions for the current Space and session."
          className="mobile-actions-dialog"
        >
          <div className="mobile-action-list">
            {workspace && (
              <button
                type="button"
                disabled={!canStartAgent}
                onClick={() => {
                  setMobileActionsOpen(false);
                  openSessionDialog(mobileMoreTrigger.current);
                }}
              >
                <PlusIcon aria-hidden="true" />
                <span>
                  <strong>Start Agent</strong>
                  <small>Launch an approved runtime in {workspace.name}.</small>
                </span>
              </button>
            )}
            {agent && (
              <button
                type="button"
                onClick={() => {
                  setMobileActionsOpen(false);
                  openDetailsDialog(mobileMoreTrigger.current);
                }}
              >
                <InfoCircledIcon aria-hidden="true" />
                <span>
                  <strong>Session details</strong>
                  <small>Runtime, current directory, and pane details.</small>
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setWorkbenchTheme((current) => toggleThemeAppearance(current))
              }
            >
              {appearance === "light" ? <MoonIcon /> : <SunIcon />}
              <span>
                <strong>
                  Use {appearance === "light" ? "dark" : "light"} appearance
                </strong>
                <small>The preference is saved in this browser.</small>
              </span>
            </button>
          </div>
        </RadixDialog>
        {workspace && agent && (
          <RadixDialog
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            title="Session details"
            description="Real runtime and Space information for the focused session."
            className="details-dialog"
          >
            <SessionDetails
              agent={agent}
              workspace={workspace}
              connection={runtime.connection}
            />
          </RadixDialog>
        )}
      </Tooltip.Provider>
    </Theme>
  );
}
