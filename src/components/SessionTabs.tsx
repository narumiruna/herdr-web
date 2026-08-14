import { DesktopIcon } from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tabs from "@radix-ui/react-tabs";
import { type ReactNode, useEffect, useRef } from "react";
import type { Agent } from "../state";
import { StatusPill } from "./StatusPill";

interface SessionTabsProps {
  children: ReactNode;
  onSelect: (sessionId: string) => void;
  selectedId: string;
  sessions: Agent[];
  workspaceName: string;
}

export function SessionTabs({
  children,
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
