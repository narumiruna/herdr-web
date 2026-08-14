import {
  Cross2Icon,
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
import { useEffect, useRef, useState } from "react";
import { CommandPalette, NewSessionDialog } from "./components/AppDialogs";
import { ConnectionScreen } from "./components/ConnectionScreen";
import { HerdrLogo } from "./components/HerdrLogo";
import { IconTooltip } from "./components/IconTooltip";
import { RadixDialog } from "./components/RadixDialog";
import { SessionDetails } from "./components/SessionDetails";
import { Sidebar } from "./components/Sidebar";
import { TerminalWorkspace } from "./components/TerminalWorkspace";
import type { RuntimeName } from "./state";
import { useHerdrRuntime } from "./use-herdr-runtime";

interface AppProps {
  live?: boolean;
}

export function App({
  live = import.meta.env.VITE_DEMO_MODE !== "true",
}: AppProps) {
  const runtime = useHerdrRuntime(live);
  const { state } = runtime;
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [commandOpen, setCommandOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const commandTrigger = useRef<HTMLButtonElement>(null);
  const commandWasOpen = useRef(false);
  const workspace =
    state.workspaces.find(({ id }) => id === state.selectedWorkspaceId) ??
    state.workspaces[0];
  const workspaceAgentCount = state.agents.filter(
    ({ workspaceId, kind }) =>
      workspaceId === workspace?.id && kind === "agent",
  ).length;
  const agent =
    state.agents.find(
      ({ id, workspaceId }) =>
        id === state.selectedAgentId && workspaceId === workspace?.id,
    ) ??
    state.agents.find(
      ({ workspaceId }) => workspace && workspaceId === workspace.id,
    );

  useEffect(() => {
    if (commandWasOpen.current && !commandOpen) commandTrigger.current?.focus();
    commandWasOpen.current = commandOpen;
  }, [commandOpen]);

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
        className="herdr-theme"
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

  const selectWorkspace = (workspaceId: string) => {
    runtime.dispatch({ type: "workspace.selected", workspaceId });
  };
  const selectAgent = (agentId: string) => {
    runtime.dispatch({ type: "agent.selected", agentId });
  };
  const createSession = async (details: {
    label: string;
    runtime: RuntimeName;
    command: string;
  }) => {
    if (!workspace)
      throw new Error("Open a workspace before starting an Agent.");
    await runtime.createSession({ workspaceId: workspace.id, ...details });
  };

  return (
    <Theme
      appearance={appearance}
      accentColor="amber"
      grayColor="sand"
      radius="medium"
      scaling="100%"
      className="herdr-theme"
    >
      <Tooltip.Provider>
        <div className="app-shell">
          <div className="desktop-sidebar">
            <Sidebar
              state={state}
              onSelectWorkspace={selectWorkspace}
              onSelectAgent={selectAgent}
            />
          </div>

          <div className="app-surface">
            <header className="topbar">
              <div className="topbar-context">
                <IconButton
                  variant="ghost"
                  color="gray"
                  className="mobile-nav-trigger"
                  aria-label="Open navigation"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <HamburgerMenuIcon />
                </IconButton>
                <span className="mobile-brand-mark">
                  <HerdrLogo compact />
                </span>
                <div>
                  <strong>{workspace?.name ?? "herdr"}</strong>
                  <span>
                    {workspace
                      ? `${workspaceAgentCount} ${workspaceAgentCount === 1 ? "Agent" : "Agents"}`
                      : "No workspace open"}
                  </span>
                </div>
              </div>

              <div className="topbar-actions">
                {workspace && (
                  <Button
                    type="button"
                    color="amber"
                    onClick={() => setSessionOpen(true)}
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
                      aria-label="Open details"
                      onClick={() => setDetailsOpen(true)}
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
                    className="theme-toggle"
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
                <span
                  className="connection-state"
                  data-state={runtime.connection}
                >
                  <i aria-hidden="true" />
                  {runtime.connection === "connected"
                    ? "Connected"
                    : "Reconnecting"}
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
                  Showing the last update while Herdr reconnects.
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

            {workspace && agent ? (
              <TerminalWorkspace
                agent={agent}
                workspace={workspace}
                onMessage={(message, image) =>
                  runtime.promptAgent(agent.id, message, image)
                }
                onMessageFailure={runtime.clearActionError}
                onSplitPane={() =>
                  runtime.splitPane(agent.id, agent.activePaneId)
                }
                onSelectPane={(paneId) =>
                  runtime.dispatch({
                    type: "pane.selected",
                    agentId: agent.id,
                    paneId,
                  })
                }
                onClosePane={(paneId) => runtime.closePane(agent.id, paneId)}
              />
            ) : (
              <main className="empty-workbench">
                <div className="empty-workbench-mark">
                  <HerdrLogo compact />
                </div>
                <span>{workspace ? "Empty workspace" : "No workspaces"}</span>
                <h1>
                  {workspace
                    ? "Start your first Agent"
                    : "Open a workspace in Herdr"}
                </h1>
                <p>
                  {workspace
                    ? "This workspace has no Agent or Terminal sessions yet."
                    : "Create or focus a Herdr workspace, then refresh this workbench."}
                </p>
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
        <RadixDialog
          open={mobileNavOpen}
          onOpenChange={setMobileNavOpen}
          title="Navigate workbench"
          description="Choose work that needs attention, a workspace, an Agent, or a Terminal."
          className="mobile-navigation-dialog"
        >
          <Sidebar
            state={state}
            onSelectWorkspace={selectWorkspace}
            onSelectAgent={selectAgent}
            onDismiss={() => setMobileNavOpen(false)}
          />
        </RadixDialog>
        {workspace && agent && (
          <RadixDialog
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            title="Session details"
            description="Real runtime and workspace information for the focused session."
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
