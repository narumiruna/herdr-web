import {
  ActivityLogIcon,
  HamburgerMenuIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import { IconButton, Theme } from "@radix-ui/themes";
import { useEffect, useReducer, useRef, useState } from "react";
import { ActivityRail } from "./components/ActivityRail";
import { CommandPalette, NewSessionDialog } from "./components/AppDialogs";
import { FlockRail } from "./components/FlockRail";
import { HerdrLogo } from "./components/HerdrLogo";
import { IconTooltip } from "./components/IconTooltip";
import { RadixDialog } from "./components/RadixDialog";
import { Sidebar } from "./components/Sidebar";
import { TerminalWorkspace } from "./components/TerminalWorkspace";
import {
  appReducer,
  createDemoState,
  type RuntimeName,
  selectedAgent,
  selectedWorkspace,
} from "./state";

export function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, createDemoState);
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [commandOpen, setCommandOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileActivityOpen, setMobileActivityOpen] = useState(false);
  const sessionCounter = useRef(1);
  const paneCounter = useRef(1);
  const workspace = selectedWorkspace(state);
  const agent = selectedAgent(state);

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

  const selectWorkspace = (workspaceId: string) => {
    dispatch({ type: "workspace.selected", workspaceId });
  };
  const selectAgent = (agentId: string) => {
    dispatch({ type: "agent.selected", agentId });
  };
  const createSession = (details: {
    label: string;
    runtime: RuntimeName;
    command: string;
  }) => {
    dispatch({
      type: "session.created",
      id: `agent-web-${sessionCounter.current++}`,
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
                <span>runtime 01</span>
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

            <div className="workspace-grid">
              <TerminalWorkspace
                agent={agent}
                workspace={workspace}
                onMessage={(message) =>
                  dispatch({
                    type: "agent.replied",
                    agentId: agent.id,
                    message,
                  })
                }
                onNewSession={() => setSessionOpen(true)}
                onSplitPane={() =>
                  dispatch({
                    type: "pane.split",
                    agentId: agent.id,
                    paneId: `pane-web-${paneCounter.current++}`,
                  })
                }
                onSelectPane={(paneId) =>
                  dispatch({ type: "pane.selected", agentId: agent.id, paneId })
                }
                onClosePane={(paneId) =>
                  dispatch({ type: "pane.closed", agentId: agent.id, paneId })
                }
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
