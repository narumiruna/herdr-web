import {
  DesktopIcon,
  DotsHorizontalIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tabs from "@radix-ui/react-tabs";
import { DropdownMenu, IconButton } from "@radix-ui/themes";
import { type ReactNode, useEffect, useRef } from "react";
import type { Agent } from "../state";
import { StatusPill } from "./StatusPill";

interface SessionTabsProps {
  canCreateSession: boolean;
  children: ReactNode;
  onAgentLifecycle?: (
    session: Agent,
    action: "archive" | "clear" | "restart" | "stop",
  ) => void;
  onCloseSession?: (session: Agent) => void;
  onMoveSession?: (session: Agent, direction: "left" | "right") => void;
  onNewSession: (returnFocus: HTMLElement) => void;
  onNewTerminal?: (returnFocus: HTMLElement) => void;
  onRenameSession?: (session: Agent) => void;
  onSelect: (sessionId: string) => void;
  selectedId: string;
  sessions: Agent[];
  workspaceName: string;
}

export function SessionTabs({
  canCreateSession,
  children,
  onAgentLifecycle,
  onCloseSession,
  onMoveSession,
  onNewSession,
  onNewTerminal,
  onRenameSession,
  onSelect,
  selectedId,
  sessions,
  workspaceName,
}: SessionTabsProps) {
  const selectedTab = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedTab.current?.scrollIntoView?.({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });

  if (sessions.length === 0) return null;
  const selectedSession = sessions.find(({ id }) => id === selectedId);

  return (
    <Tabs.Root
      className="session-tabs-layout"
      value={selectedId}
      onValueChange={onSelect}
    >
      <div className="session-tabs">
        <ScrollArea.Root className="session-tabs-scroll">
          <ScrollArea.Viewport className="session-tabs-viewport">
            <Tabs.List
              className="session-tabs-list"
              aria-label={`${workspaceName} tabs`}
            >
              {sessions.map((session) => {
                const isTerminal = session.kind === "terminal";
                return (
                  <Tabs.Trigger
                    ref={session.id === selectedId ? selectedTab : undefined}
                    className="session-tab"
                    key={session.id}
                    title={session.label}
                    value={session.id}
                  >
                    {isTerminal && (
                      <span className="session-tab-icon" aria-hidden="true">
                        <DesktopIcon />
                      </span>
                    )}
                    {isTerminal && <span className="sr-only">Terminal</span>}
                    <span className="session-tab-label">{session.label}</span>
                    {!isTerminal && (
                      <span className="session-tab-status">
                        <StatusPill status={session.status} />
                      </span>
                    )}
                  </Tabs.Trigger>
                );
              })}
            </Tabs.List>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            className="session-tabs-scrollbar"
            orientation="horizontal"
          >
            <ScrollArea.Thumb className="session-tabs-scrollbar-thumb" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
        <IconButton
          type="button"
          className="session-tabs-new"
          variant="ghost"
          color="gray"
          disabled={!canCreateSession}
          aria-label={`New Agent in ${workspaceName}`}
          title={`New Agent in ${workspaceName}`}
          onClick={(event) => onNewSession(event.currentTarget)}
        >
          <PlusIcon aria-hidden="true" />
        </IconButton>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <IconButton
              type="button"
              className="session-tabs-new"
              variant="ghost"
              color="gray"
              disabled={!selectedSession}
              aria-label="Session lifecycle actions"
            >
              <DotsHorizontalIcon aria-hidden="true" />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" sideOffset={6} size="1">
            <DropdownMenu.Item
              disabled={!canCreateSession || !onNewTerminal}
              onSelect={(event) => {
                const target = event.currentTarget as HTMLElement;
                onNewTerminal?.(target);
              }}
            >
              New Terminal
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={!selectedSession || !onRenameSession}
              onSelect={() =>
                selectedSession && onRenameSession?.(selectedSession)
              }
            >
              Rename tab
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={!selectedSession || !onMoveSession}
              onSelect={() =>
                selectedSession && onMoveSession?.(selectedSession, "left")
              }
            >
              Move tab left
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={!selectedSession || !onMoveSession}
              onSelect={() =>
                selectedSession && onMoveSession?.(selectedSession, "right")
              }
            >
              Move tab right
            </DropdownMenu.Item>
            {selectedSession?.kind === "agent" && (
              <>
                <DropdownMenu.Separator />
                {(["restart", "stop", "archive", "clear"] as const).map(
                  (action) => (
                    <DropdownMenu.Item
                      key={action}
                      disabled={!onAgentLifecycle}
                      color={
                        action === "archive" || action === "clear"
                          ? "red"
                          : undefined
                      }
                      onSelect={() =>
                        selectedSession &&
                        onAgentLifecycle?.(selectedSession, action)
                      }
                    >
                      {action[0]?.toUpperCase()}
                      {action.slice(1)} Agent
                    </DropdownMenu.Item>
                  ),
                )}
              </>
            )}
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              color="red"
              disabled={!selectedSession || !onCloseSession}
              onSelect={() =>
                selectedSession && onCloseSession?.(selectedSession)
              }
            >
              Close tab
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
      <Tabs.Content
        className="session-tab-content"
        forceMount
        key="active-tab-content"
        value={selectedId}
      >
        {children}
      </Tabs.Content>
      {sessions
        .filter(({ id }) => id !== selectedId)
        .map((session) => (
          <Tabs.Content
            className="session-tab-content"
            forceMount
            key={session.id}
            value={session.id}
          />
        ))}
    </Tabs.Root>
  );
}
