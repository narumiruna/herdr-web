import {
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
import { HedrLogo } from "./components/HedrLogo";
import { IconTooltip } from "./components/IconTooltip";
import { RadixDialog } from "./components/RadixDialog";
import { SessionDetails } from "./components/SessionDetails";
import { SessionTabs } from "./components/SessionTabs";
import { type AgentSortMode, Sidebar } from "./components/Sidebar";
import {
  type ComposerDraft,
  EMPTY_COMPOSER_DRAFT,
  TerminalWorkspace,
} from "./components/TerminalWorkspace";
import { type HerdrState, type RuntimeName, tabsForWorkspace } from "./state";
import { useHerdrRuntime } from "./use-herdr-runtime";

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
  const [appearance, setAppearance] = useState<"light" | "dark">(() => {
    const saved =
      typeof window.localStorage?.getItem === "function"
        ? window.localStorage.getItem("hedr-appearance")
        : null;
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  });
  const [agentSort, setAgentSort] = useState<AgentSortMode>(() => {
    const saved =
      typeof window.localStorage?.getItem === "function"
        ? window.localStorage.getItem("hedr-agent-sort")
        : null;
    return saved === "priority" ? "priority" : "grouped";
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keybindingsOpen, setKeybindingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ComposerDraft>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [clock, setClock] = useState(() => Date.now());
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch>();
  const commandTrigger = useRef<HTMLButtonElement>(null);
  const mobileNavTrigger = useRef<HTMLButtonElement>(null);
  const mobileMoreTrigger = useRef<HTMLButtonElement>(null);
  const sessionReturnFocus = useRef<HTMLElement>(null);
  const newSpaceReturnFocus = useRef<HTMLElement>(null);
  const settingsReturnFocus = useRef<HTMLElement>(null);
  const keybindingsReturnFocus = useRef<HTMLElement>(null);
  const detailsReturnFocus = useRef<HTMLElement>(null);
  const commandWasOpen = useRef(false);
  const mobileNavWasOpen = useRef(false);
  const mobileActionsWereOpen = useRef(false);
  const sessionWasOpen = useRef(false);
  const newSpaceWasOpen = useRef(false);
  const settingsWasOpen = useRef(false);
  const keybindingsWereOpen = useRef(false);
  const detailsWereOpen = useRef(false);
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
      window.localStorage.setItem("hedr-agent-sort", agentSort);
    }
  }, [agentSort]);

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem("hedr-appearance", appearance);
    }
    document.documentElement.classList.toggle("dark", appearance === "dark");
    document.documentElement.classList.toggle("light", appearance === "light");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", appearance === "dark" ? "#11110f" : "#f6f3ed");
  }, [appearance]);

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
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (runtime.status !== "ready") {
    return (
      <Theme
        appearance={appearance}
        accentColor="amber"
        grayColor="sand"
        radius="medium"
        className="hedr-theme"
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
  const openKeybindingsDialog = (returnFocus?: HTMLElement | null) => {
    keybindingsReturnFocus.current =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    setKeybindingsOpen(true);
  };
  const selectWorkspace = (workspaceId: string) => {
    runtime.dispatch({ type: "workspace.selected", workspaceId });
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

  return (
    <Theme
      appearance={appearance}
      accentColor="amber"
      grayColor="sand"
      radius="medium"
      scaling="100%"
      className="hedr-theme"
    >
      <Tooltip.Provider>
        <div className="app-shell">
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
              onRefresh={runtime.refresh}
            />
          </div>

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
                  <HedrLogo compact />
                </span>
                <strong>{workspace?.name ?? "Hedr"}</strong>
              </div>

              <div className="topbar-actions">
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
                      setAppearance((current) =>
                        current === "light" ? "dark" : "light",
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
                onSelect={selectAgent}
              >
                <TerminalWorkspace
                  actionsEnabled={
                    runtime.connection === "connected" &&
                    runtime.accessRole === "controller"
                  }
                  agent={agent}
                  createTerminalTicket={runtime.terminalTicket}
                  draft={drafts[agent.id] ?? EMPTY_COMPOSER_DRAFT}
                  isSending={sending[agent.id] === true}
                  workspace={workspace}
                  onClearDraft={(agentId) =>
                    setDrafts((current) => ({
                      ...current,
                      [agentId]: EMPTY_COMPOSER_DRAFT,
                    }))
                  }
                  onDraftChange={updateDraft}
                  onMessage={(message, image, uploadedPath) =>
                    runtime.promptAgent(
                      agent.id,
                      message,
                      image,
                      uploadedPath,
                      agent.activePaneId,
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
                  onSplitPane={() =>
                    runtime.splitPane(agent.id, agent.activePaneId)
                  }
                  onUploadImage={runtime.uploadImage}
                  onSelectPane={(paneId) =>
                    runtime.dispatch({
                      type: "pane.selected",
                      agentId: agent.id,
                      paneId,
                    })
                  }
                  onClosePane={async (paneId) => {
                    try {
                      await runtime.closePane(agent.id, paneId);
                    } catch (error) {
                      runtime.clearActionError();
                      throw error;
                    }
                  }}
                  terminalControlEnabled={runtime.accessRole === "controller"}
                  terminalEnabled={runtime.status === "ready"}
                  terminalReason={state.capabilities.terminalReason}
                  terminalStreaming={state.capabilities.terminalStreaming}
                />
              </SessionTabs>
            ) : (
              <main className="empty-workbench">
                <div className="empty-workbench-mark">
                  <HedrLogo compact />
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
          state={state}
          onSelectWorkspace={selectWorkspace}
          onSelectAgent={selectAgent}
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
          appearance={appearance}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onApply={setAppearance}
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
                setAppearance((current) =>
                  current === "light" ? "dark" : "light",
                )
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
