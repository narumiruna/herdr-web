import { Theme } from "@radix-ui/themes";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";
import { Sidebar } from "../src/components/Sidebar";
import {
  type Agent,
  createDemoState,
  type HerdrState,
  type Workspace,
} from "../src/state";

type SidebarProps = ComponentProps<typeof Sidebar>;

function workspace(id: string, options: Partial<Workspace> = {}): Workspace {
  return {
    id,
    name: id,
    path: `/projects/${id}`,
    branch: "main",
    accent: "amber",
    ahead: 0,
    behind: 0,
    ...options,
  };
}

function repository(repoKey: string, isLinked = false) {
  return {
    branch: isLinked ? "feature/linked" : "main",
    checkoutPath: `/projects/${repoKey}`,
    isLinked,
    repoKey,
    repoName: "same-repository-name",
    repoRoot: `/projects/${repoKey}`,
  };
}

function agent(
  id: string,
  workspaceId: string,
  options: Partial<Agent> = {},
): Agent {
  const template = createDemoState().agents[0];
  if (!template) throw new Error("Missing fixture Agent");
  return {
    ...template,
    id,
    kind: "agent",
    workspaceId,
    label: id,
    runtime: "Codex",
    status: "working",
    currentStep: "",
    summary: "",
    tabId: id,
    tabNumber: undefined,
    ...options,
  };
}

function fixture(): HerdrState {
  return {
    ...createDemoState(),
    workspaces: [
      workspace("repository", { worktree: repository("repo-one") }),
      workspace("linked-checkout", {
        branch: "feature/linked",
        worktree: repository("repo-one", true),
      }),
      workspace("other-repository", { worktree: repository("repo-two") }),
      workspace("orphan-checkout", {
        branch: "feature/orphan",
        worktree: repository("missing-repo", true),
      }),
      workspace("empty-space"),
      workspace("terminal-space"),
    ],
    agents: [
      agent("root-second", "repository", { tabNumber: 2 }),
      agent("root-first", "repository", { tabNumber: 1 }),
      agent("linked-agent", "linked-checkout", { status: "blocked" }),
      agent("other-agent", "other-repository", { status: "failed" }),
      agent("orphan-agent", "orphan-checkout"),
      agent("standalone-terminal", "terminal-space", {
        kind: "terminal",
        status: "blocked",
      }),
      agent("unknown-workspace-agent", "missing-space"),
    ],
    selectedWorkspaceId: "repository",
    selectedAgentId: "root-first",
  };
}

function props(state = fixture()): SidebarProps {
  return {
    state,
    agentSort: "grouped",
    spacesRatio: 0.5,
    attentionCount: 2,
    canCreateSpace: true,
    onAgentSortChange: vi.fn(),
    onSpacesRatioChange: vi.fn(),
    onSelectWorkspace: vi.fn(),
    onSelectAgent: vi.fn(),
    onNewSpace: vi.fn(),
    onOpenAttention: vi.fn(),
    onOpenMissionControl: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenShares: vi.fn(),
    onOpenWorkflows: vi.fn(),
    onOpenKeybindings: vi.fn(),
    onOpenRuntime: vi.fn(),
    onRefresh: vi.fn(),
  };
}

function sidebar(input: SidebarProps) {
  return (
    <Theme>
      <Sidebar {...input} />
    </Theme>
  );
}

function detectedAgents() {
  return within(screen.getByRole("navigation", { name: "Detected Agents" }));
}

function agentOrder() {
  return detectedAgents()
    .getAllByRole("button")
    .map(
      (button) =>
        button.getAttribute("aria-label")?.match(/^Open (.+) Agent in /)?.[1],
    );
}

describe("Sidebar panels", () => {
  test("places independent Spaces and Agents around New / Menu and a divider", () => {
    const { container } = render(sidebar(props()));
    const spaces = screen.getByRole("region", { name: "Spaces" });
    const agents = screen.getByRole("region", { name: "Agents" });
    const actions = screen.getByRole("button", {
      name: "Create a new Space",
    }).parentElement;
    if (!actions) throw new Error("Missing Space actions");
    const divider = screen.getByRole("separator", {
      name: "Resize Spaces and Agents panels",
    });
    expect(
      spaces.compareDocumentPosition(actions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      actions.compareDocumentPosition(divider) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      divider.compareDocumentPosition(agents) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      container.querySelectorAll(".sidebar-scroll, .agent-panel-scroll"),
    ).toHaveLength(2);
    expect(
      within(spaces).queryByRole("button", { name: / Agent in / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Open Attention Inbox/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Agent ordering" }),
    ).not.toBeInTheDocument();
    expect(agentOrder()).toEqual([
      "root-first",
      "root-second",
      "linked-agent",
      "other-agent",
      "orphan-agent",
      "unknown-workspace-agent",
    ]);
    expect(
      detectedAgents().getByRole("button", {
        name: "Open unknown-workspace-agent Agent in Unknown Space, Working, Codex",
      }),
    ).toBeVisible();
    expect(
      detectedAgents().queryByRole("button", { name: /standalone-terminal/ }),
    ).not.toBeInTheDocument();
  });

  test("shows Space and runtime, leaves task text in title, and puts status first", () => {
    const state = fixture();
    state.agents[1] = agent("root-first", "repository", {
      tabNumber: 1,
      currentStep: "A detailed task",
      label: "Full Agent identity",
    });
    render(sidebar(props(state)));
    const button = detectedAgents().getByRole("button", {
      name: "Open Full Agent identity Agent in repository, Working, tab 1, Codex",
    });
    expect(within(button).getByText("repository · 1").tagName).toBe("STRONG");
    expect(within(button).getByText("Codex").tagName).toBe("SMALL");
    expect(
      within(button).queryByText("A detailed task"),
    ).not.toBeInTheDocument();
    expect(button).toHaveAttribute(
      "title",
      expect.stringContaining("Full Agent identity — A detailed task"),
    );
    expect(button.firstElementChild).toHaveClass("agent-identity");
    expect(
      button.firstElementChild?.querySelector(".status-working"),
    ).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-current", "page");
  });

  test.each([
    ["single tab", [agent("a", "space", { tabNumber: 1 })], "space"],
    [
      "custom single tab",
      [
        agent("a", "space", {
          tabNumber: 1,
          tabLabel: "Review",
          tabCustomLabel: true,
        }),
      ],
      "space · Review",
    ],
    [
      "multiple Agents on one tab",
      [
        agent("a", "space", { tabId: "shared", tabNumber: 1 }),
        agent("b", "space", { tabId: "shared", tabNumber: 1 }),
      ],
      "space",
    ],
    [
      "standalone Terminal tab",
      [
        agent("a", "space", { tabNumber: 1, tabLabel: "Build" }),
        agent("terminal", "space", { kind: "terminal", tabNumber: 2 }),
      ],
      "space · Build",
    ],
    [
      "fallback IDs",
      [
        agent("a", "space", { tabId: undefined, tabNumber: 1 }),
        agent("b", "space", { tabId: undefined, tabNumber: 2 }),
      ],
      "space · 1",
    ],
    [
      "missing tab metadata",
      [agent("a", "space"), agent("b", "space")],
      "space",
    ],
  ] as const)("uses tab context for %s", (_label, agents, expected) => {
    render(
      sidebar(
        props({
          ...fixture(),
          workspaces: [workspace("space")],
          agents: [...agents],
        }),
      ),
    );
    const row = detectedAgents().getByRole("button", { name: /Open a Agent/ });
    expect(row.querySelector("strong")).toHaveTextContent(expected);
    expect(row.querySelector("strong")?.textContent).toBe(expected);
  });

  test("uses highest detected Agent status for each Space and retains branch details", () => {
    const state = fixture();
    state.agents.push(agent("failed", "repository", { status: "failed" }));
    render(sidebar(props(state)));
    const root = screen.getByRole("button", { name: "Open repository Space" });
    expect(within(root).getByText("main")).toBeVisible();
    expect(root.querySelectorAll(".status-pill")).toHaveLength(1);
    expect(root.querySelector(".status-failed")).toBeInTheDocument();
    const blocked = screen.getByRole("button", {
      name: "Open feature/linked worktree Space",
    });
    expect(blocked.querySelector(".status-blocked")).toBeInTheDocument();
    expect(
      screen.queryByText(/needs input/i, { selector: "small" }),
    ).not.toBeInTheDocument();
    const terminalSpace = screen.getByRole("button", {
      name: "Open terminal-space Space",
    });
    expect(terminalSpace.querySelector(".status-unknown")).toBeInTheDocument();
    expect(
      terminalSpace.querySelector(".status-blocked"),
    ).not.toBeInTheDocument();
  });

  test("shows both empty states without turning standalone Terminals into Agents", () => {
    const input = props({
      ...fixture(),
      workspaces: [],
      agents: [],
      selectedAgentId: "",
      selectedWorkspaceId: "",
    });
    const view = render(sidebar(input));
    expect(screen.getByText("No Spaces")).toBeVisible();
    expect(screen.getByText("No detected Agents")).toBeVisible();
    view.rerender(
      sidebar({
        ...input,
        state: {
          ...input.state,
          workspaces: [workspace("space")],
          agents: [agent("terminal", "space", { kind: "terminal" })],
        },
      }),
    );
    expect(screen.getByText("No detected Agents")).toBeVisible();
    expect(detectedAgents().queryByRole("button")).not.toBeInTheDocument();
  });

  test("exposes full Space details and long Agent identities without hover", () => {
    const name = "repository-with-a-complete-very-long-name";
    const branch = "feature/a-complete-very-long-branch";
    render(
      sidebar(
        props({
          ...fixture(),
          workspaces: [workspace("long", { name, branch })],
          agents: [agent("full-agent-name", "long")],
        }),
      ),
    );
    const select = screen.getByRole("button", { name: `Open ${name} Space` });
    expect(select).toHaveAccessibleDescription(
      `${name} — /projects/long — ${branch} — Working`,
    );
    expect(within(select).getByText(branch)).toBeVisible();
    expect(
      detectedAgents().getByRole("button", {
        name: `Open full-agent-name Agent in ${name}, Working, Codex`,
      }),
    ).toBeVisible();
  });
});

describe("Agent ordering", () => {
  test("toggles the compact text button in both directions", async () => {
    const user = userEvent.setup();
    const input = props();
    const view = render(sidebar(input));
    await user.click(
      screen.getByRole("button", { name: "Agent ordering: Grouped" }),
    );
    expect(input.onAgentSortChange).toHaveBeenLastCalledWith("priority");
    view.rerender(sidebar({ ...input, agentSort: "priority" }));
    const toggle = screen.getByRole("button", {
      name: "Agent ordering: Priority",
    });
    expect(toggle).toHaveTextContent("Priority");
    toggle.focus();
    await user.keyboard(" ");
    expect(input.onAgentSortChange).toHaveBeenLastCalledWith("grouped");
  });

  test("orders priority by state, then descending sequence, then workspace/tab/input order", () => {
    const state = {
      ...fixture(),
      workspaces: [workspace("one"), workspace("two")],
      agents: [
        agent("unknown", "one", { status: "unknown", stateChangeSeq: 1000 }),
        agent("idle", "one", { status: "idle" }),
        agent("working", "one"),
        agent("done", "one", { status: "done" }),
        agent("blocked-old", "one", { status: "blocked" }),
        agent("blocked-new", "two", { status: "blocked", stateChangeSeq: 10 }),
        agent("failed", "one", { status: "failed" }),
        agent("blocked-first-tab-a", "one", {
          status: "blocked",
          tabNumber: 1,
        }),
        agent("blocked-first-tab-b", "one", {
          status: "blocked",
          tabNumber: 1,
        }),
        agent("blocked-second-tab", "one", { status: "blocked", tabNumber: 2 }),
        agent("blocked-other-space", "two", {
          status: "blocked",
          tabNumber: 1,
        }),
      ],
    };
    render(sidebar({ ...props(state), agentSort: "priority" }));
    expect(agentOrder()).toEqual([
      "failed",
      "blocked-new",
      "blocked-first-tab-a",
      "blocked-first-tab-b",
      "blocked-second-tab",
      "blocked-old",
      "blocked-other-space",
      "done",
      "working",
      "idle",
      "unknown",
    ]);
  });

  test("groups moved tabs by snapshot position instead of stable tab number", () => {
    const state = {
      ...fixture(),
      workspaces: [workspace("one")],
      agents: [
        agent("created-first", "one", { tabNumber: 1, tabOrder: 1 }),
        agent("moved-first", "one", { tabNumber: 9, tabOrder: 0 }),
      ],
    };
    render(sidebar(props(state)));
    expect(agentOrder()).toEqual(["moved-first", "created-first"]);
  });

  test("exposes visible tab and runtime identity in accessible Agent names", () => {
    const state = {
      ...fixture(),
      workspaces: [workspace("one")],
      agents: [
        agent("first", "one", {
          label: "pi",
          runtime: "pi",
          tabLabel: "Build",
        }),
        agent("second", "one", {
          label: "pi",
          runtime: "pi",
          tabLabel: "Review",
        }),
      ],
    };
    render(sidebar(props(state)));
    expect(
      detectedAgents().getByRole("button", {
        name: "Open pi Agent in one, Working, tab Build, pi",
      }),
    ).toBeVisible();
    expect(
      detectedAgents().getByRole("button", {
        name: "Open pi Agent in one, Working, tab Review, pi",
      }),
    ).toBeVisible();
  });

  test("grouped ordering ignores priority and sequence and preserves input ties", () => {
    const state = {
      ...fixture(),
      workspaces: [workspace("one"), workspace("two")],
      agents: [
        agent("two", "two", { status: "failed", stateChangeSeq: 100 }),
        agent("later-tab", "one", { tabNumber: 2 }),
        agent("first-a", "one", { tabNumber: 1 }),
        agent("first-b", "one", { tabNumber: 1, stateChangeSeq: 10 }),
      ],
    };
    render(sidebar(props(state)));
    expect(agentOrder()).toEqual(["first-a", "first-b", "later-tab", "two"]);
  });
});

describe("Space worktrees", () => {
  test("starts expanded, groups by repository identity, and only expands actual parents", () => {
    render(sidebar(props()));
    const worktrees = screen.getByRole("list", {
      name: "repository worktrees",
    });
    expect(
      within(worktrees).getByRole("button", {
        name: "Open feature/linked worktree Space",
      }),
    ).toBeVisible();
    expect(
      within(worktrees).queryByRole("button", {
        name: "Open other-repository Space",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open orphan-checkout Space" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /^(Expand|Collapse)/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Collapse repository worktrees" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("shows hidden worktree attention on the collapsed parent Space", async () => {
    const user = userEvent.setup();
    render(sidebar(props()));
    const parent = screen.getByRole("button", {
      name: "Open repository Space",
    });
    expect(parent.querySelector(".status-working")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Collapse repository worktrees" }),
    );
    expect(parent.querySelector(".status-blocked")).toBeInTheDocument();
    expect(parent).toHaveAccessibleDescription(
      expect.stringContaining("Needs input"),
    );
    await user.click(
      screen.getByRole("button", { name: "Expand repository worktrees" }),
    );
    expect(parent.querySelector(".status-working")).toBeInTheDocument();
  });

  test("keeps all Agents reachable while worktrees are collapsed, without selecting or dismissing", async () => {
    const user = userEvent.setup();
    const input = { ...props(), onDismiss: vi.fn() };
    render(sidebar(input));
    const toggle = screen.getByRole("button", {
      name: "Collapse repository worktrees",
    });
    const controlled = document.getElementById(
      toggle.getAttribute("aria-controls") ?? "",
    );
    expect(controlled).toContainElement(
      screen.getByRole("list", { name: "repository worktrees" }),
    );
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", {
        name: "Open feature/linked worktree Space",
      }),
    ).not.toBeInTheDocument();
    expect(
      detectedAgents().getByRole("button", { name: /Open linked-agent Agent/ }),
    ).toBeVisible();
    expect(input.onSelectWorkspace).not.toHaveBeenCalled();
    expect(input.onSelectAgent).not.toHaveBeenCalled();
    expect(input.onDismiss).not.toHaveBeenCalled();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("preserves manual collapse on snapshot refresh and reopens on selection changes", async () => {
    const user = userEvent.setup();
    const input = props();
    const view = render(sidebar(input));
    await user.click(
      screen.getByRole("button", { name: "Collapse repository worktrees" }),
    );
    view.rerender(sidebar({ ...input, state: structuredClone(input.state) }));
    expect(
      screen.getByRole("button", { name: "Expand repository worktrees" }),
    ).toHaveAttribute("aria-expanded", "false");
    const selected = {
      ...input,
      state: {
        ...input.state,
        selectedWorkspaceId: "linked-checkout",
        selectedAgentId: "linked-agent",
      },
    };
    view.rerender(sidebar(selected));
    expect(
      screen.getByRole("button", { name: "Collapse repository worktrees" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      detectedAgents().getByRole("button", { name: /Open linked-agent Agent/ }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(
      screen.getByRole("button", { name: "Collapse repository worktrees" }),
    );
    view.rerender(
      sidebar({ ...selected, state: structuredClone(selected.state) }),
    );
    expect(
      screen.getByRole("button", { name: "Expand repository worktrees" }),
    ).toHaveAttribute("aria-expanded", "false");
    view.unmount();
    render(sidebar(selected));
    expect(
      screen.getByRole("button", {
        name: "Open feature/linked worktree Space",
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("dismisses mobile navigation after keyboard Space and Agent selection", async () => {
    const user = userEvent.setup();
    const input = { ...props(), onDismiss: vi.fn() };
    render(sidebar(input));
    screen
      .getByRole("button", { name: "Open feature/linked worktree Space" })
      .focus();
    await user.keyboard("{Enter}");
    expect(input.onSelectWorkspace).toHaveBeenCalledExactlyOnceWith(
      "linked-checkout",
    );
    detectedAgents()
      .getByRole("button", { name: /Open linked-agent Agent/ })
      .focus();
    await user.keyboard(" ");
    expect(input.onSelectAgent).toHaveBeenCalledExactlyOnceWith("linked-agent");
    expect(input.onDismiss).toHaveBeenCalledTimes(2);
  });
});

describe("Sidebar actions", () => {
  test("creates a Space directly and dismisses before opening the dialog with its focus target", async () => {
    const user = userEvent.setup();
    const input = { ...props(), onDismiss: vi.fn() };
    render(sidebar(input));
    const button = screen.getByRole("button", { name: "Create a new Space" });
    expect(button).toHaveTextContent("New");
    await user.click(button);
    expect(input.onNewSpace).toHaveBeenCalledExactlyOnceWith(button);
    expect(input.onDismiss).toHaveBeenCalledOnce();
    expect(input.onDismiss.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(input.onNewSpace).mock.invocationCallOrder[0] ?? 0,
    );
  });

  test.each([
    ["New Space", "onNewSpace"],
    ["Open Attention Inbox, 2 items", "onOpenAttention"],
    ["Mission Control", "onOpenMissionControl"],
    ["Workflow templates", "onOpenWorkflows"],
    ["Viewer shares", "onOpenShares"],
    ["Settings", "onOpenSettings"],
    ["Herdr runtime", "onOpenRuntime"],
    ["Keybindings", "onOpenKeybindings"],
  ] as const)(
    "keeps %s in Menu and passes the persistent focus target",
    async (label, callback) => {
      const user = userEvent.setup();
      const input = { ...props(), onDismiss: vi.fn() };
      render(sidebar(input));
      expect(
        screen.queryByRole("menuitem", { name: label }),
      ).not.toBeInTheDocument();
      const trigger = screen.getByRole("button", { name: "Open menu" });
      expect(trigger).toHaveAccessibleDescription("Attention Inbox, 2 items");
      expect(trigger).toHaveAttribute("data-attention", "true");
      await user.click(trigger);
      await user.click(screen.getByRole("menuitem", { name: label }));
      expect(input[callback]).toHaveBeenCalledExactlyOnceWith(trigger);
      expect(input.onDismiss).toHaveBeenCalledOnce();
    },
  );

  test("uses the supplied inbox count rather than blocked Agent totals", () => {
    render(sidebar({ ...props(), attentionCount: 0 }));
    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger).toHaveAttribute("data-attention", "false");
    expect(trigger).toHaveAccessibleDescription("Attention Inbox, 0 items");
  });

  test("preserves viewer permissions but keeps supervision, navigation, and reload reachable", async () => {
    const user = userEvent.setup();
    const input = { ...props(), canCreateSpace: false };
    render(sidebar(input));
    expect(
      screen.getByRole("button", { name: "Create a new Space" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    for (const name of ["New Space", "Viewer shares", "Herdr runtime"]) {
      expect(screen.getByRole("menuitem", { name })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await user.click(screen.getByRole("menuitem", { name }));
    }
    expect(input.onNewSpace).not.toHaveBeenCalled();
    expect(input.onOpenShares).not.toHaveBeenCalled();
    expect(input.onOpenRuntime).not.toHaveBeenCalled();
    for (const name of [
      "Open Attention Inbox, 2 items",
      "Mission Control",
      "Workflow templates",
      "Settings",
      "Keybindings",
      "Reload Herdr",
    ]) {
      expect(screen.getByRole("menuitem", { name })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  test("supports keyboard Menu navigation and returns focus after cancellation", async () => {
    const user = userEvent.setup();
    render(sidebar(props()));
    const trigger = screen.getByRole("button", { name: "Open menu" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "New Space" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: "Open Attention Inbox, 2 items" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("reloads Herdr and dismisses mobile navigation", async () => {
    const user = userEvent.setup();
    const input = { ...props(), onDismiss: vi.fn() };
    render(sidebar(input));
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Reload Herdr" }));
    expect(input.onRefresh).toHaveBeenCalledOnce();
    expect(input.onDismiss).toHaveBeenCalledOnce();
  });
});
