import {
  ActivityLogIcon,
  Cross2Icon,
  HamburgerMenuIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import { IconButton, Theme } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { ActivityRail } from "./components/ActivityRail";
import { CommandPalette, NewSessionDialog } from "./components/AppDialogs";
import { ConnectionScreen } from "./components/ConnectionScreen";
import { FlockRail } from "./components/FlockRail";
import { HerdrLogo } from "./components/HerdrLogo";
import { IconTooltip } from "./components/IconTooltip";
import { RadixDialog } from "./components/RadixDialog";
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
  const [mobileActivityOpen, setMobileActivityOpen] = useState(false);
  const workspace =
    state.workspaces.find(({ id }) => id === state.selectedWorkspaceId) ??
    state.workspaces[0];
  const agent =
    state.agents.find(({ id }) => id === state.selectedAgentId) ??
    state.agents[0];

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

  if (!workspace || !agent) {
    return (
      <Theme
        appearance={appearance}
        accentColor="amber"
        grayColor="sand"
        radius="medium"
        className="herdr-theme"
      >
        <main className="connection-screen">
          <section className="connection-card">
            <HerdrLogo />
            <span className="connection-eyebrow">herdr live bridge</span>
            <h1>No terminal sessions</h1>
            <p>Open a workspace in herdr, then refresh this page.</p>
          </section>
        </main>
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
    await runtime.createSession({
      workspaceId: workspace.id,
      ...details,
    });
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
              <div className="mobile-brand">
                <IconButton
                  variant="ghost"
                  color="gray"
                  aria-label="Open navigation"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <HamburgerMenuIcon />
                </IconButton>
                <HerdrLogo compact />
                <strong>herdr</strong>
              </div>
              <div className="runtime-stamp">
                <span>runtime {live ? "live" : "demo"}</span>
                <strong>local / persistent</strong>
              </div>
              <FlockRail agents={state.agents} onSelect={selectAgent} />
              <div className="topbar-actions">
                <button
                  type="button"
                  className="command-button"
                  aria-label="Open command palette"
                  onClick={() => setCommandOpen(true)}
                >
                  <MagnifyingGlassIcon />
                  <span>Jump anywhere</span>
                  <kbd>⌘ K</kbd>
                </button>
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
                <IconButton
                  type="button"
                  variant="soft"
                  color="gray"
                  className="mobile-activity-top"
                  aria-label="Open activity"
                  onClick={() => setMobileActivityOpen(true)}
                >
                  <ActivityLogIcon />
                </IconButton>
                <span className="connection-state">
                  <i /> connected
                </span>
              </div>
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

            <div className="workspace-grid">
              <TerminalWorkspace
                agent={agent}
                workspace={workspace}
                onMessage={(message) => runtime.promptAgent(agent.id, message)}
                onNewSession={() => setSessionOpen(true)}
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
                onShowActivity={() => setMobileActivityOpen(true)}
              />
              <div className="desktop-activity">
                <ActivityRail
                  state={state}
                  workspace={workspace}
                  agent={agent}
                  onSelectAgent={selectAgent}
                />
              </div>
            </div>
          </div>
        </div>

        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          state={state}
          onSelectWorkspace={selectWorkspace}
          onSelectAgent={selectAgent}
        />
        <NewSessionDialog
          open={sessionOpen}
          onOpenChange={setSessionOpen}
          workspace={workspace}
          onCreate={createSession}
        />
        <RadixDialog
          open={mobileNavOpen}
          onOpenChange={setMobileNavOpen}
          title="Switch workspace"
          description="Choose a space or agent to focus."
          className="mobile-panel-dialog mobile-navigation-dialog"
        >
          <Sidebar
            state={state}
            onSelectWorkspace={selectWorkspace}
            onSelectAgent={selectAgent}
            onDismiss={() => setMobileNavOpen(false)}
          />
        </RadixDialog>
        <RadixDialog
          open={mobileActivityOpen}
          onOpenChange={setMobileActivityOpen}
          title="Runtime activity"
          description="Live status and recent events across the current space."
          className="mobile-panel-dialog mobile-activity-dialog"
        >
          <ActivityRail
            state={state}
            workspace={workspace}
            agent={agent}
            onSelectAgent={(agentId) => {
              selectAgent(agentId);
              setMobileActivityOpen(false);
            }}
            mobile
          />
        </RadixDialog>
      </Tooltip.Provider>
    </Theme>
  );
}
