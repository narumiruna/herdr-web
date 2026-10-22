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
    status: "working",
    currentStep: "",
    summary: "",
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
    attentionCount: 2,
    canCreateSpace: true,
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

function workspaceRow(name: string) {
  const row = screen.getByRole("button", { name }).closest("li");
  if (!row) throw new Error(`Missing workspace row: ${name}`);
  return within(row);
}

describe("Sidebar workspace navigation", () => {
  test("uses one workspace hierarchy with only the selected workspace Agent list expanded", () => {
    const { container } = render(sidebar(props()));
    expect(screen.getByRole("heading", { name: "Spaces" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Agents" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Agent ordering" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".sidebar-scroll")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Collapse repository Space" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Expand feature/linked Space" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Expand other-repository Space" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("list", { name: "repository Agents" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "feature/linked Agents" }),
    ).not.toBeInTheDocument();
    const agents = within(
      screen.getByRole("list", { name: "repository Agents" }),
    ).getAllByRole("button");
    expect(
      agents.map((item) => item.querySelector("strong")?.textContent),
    ).toEqual(["root-first", "root-second"]);
    expect(
      screen.queryByRole("button", { name: /unknown-workspace-agent/ }),
    ).not.toBeInTheDocument();
  });

  test("keeps linked Agents under their exact worktree and uses repository identity, not repository name", async () => {
    const user = userEvent.setup();
    render(sidebar(props()));
    const worktrees = screen.getByRole("list", {
      name: "repository worktrees",
    });
    expect(
      within(worktrees).getByRole("button", {
        name: "Open feature/linked worktree Space",
      }),
    ).toBeInTheDocument();
    expect(
      within(worktrees).queryByRole("button", {
        name: "Open other-repository Space",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(worktrees).queryByRole("button", {
        name: "Open orphan-checkout Space",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open orphan-checkout Space" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand feature/linked Space" }),
    );
    expect(
      within(
        screen.getByRole("list", { name: "feature/linked Agents" }),
      ).getByRole("button", { name: /Open linked-agent Agent/ }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "repository Agents" }),
      ).queryByRole("button", { name: /linked-agent/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand other-repository Space" }),
    );
    expect(
      within(
        screen.getByRole("list", { name: "other-repository Agents" }),
      ).getByRole("button", { name: /Open other-agent Agent/ }),
    ).toBeInTheDocument();
  });

  test("separates keyboard selection from expand and collapse", async () => {
    const user = userEvent.setup();
    const input = props();
    render(sidebar(input));
    const toggle = screen.getByRole("button", {
      name: "Collapse repository Space",
    });
    const controlledId = toggle.getAttribute("aria-controls");
    expect(controlledId).toBeTruthy();
    expect(document.getElementById(controlledId ?? "")).toContainElement(
      screen.getByRole("list", { name: "repository Agents" }),
    );
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: /Open root-first Agent/ }),
    ).not.toBeInTheDocument();
    expect(input.onSelectWorkspace).not.toHaveBeenCalled();
    expect(input.onSelectAgent).not.toHaveBeenCalled();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const select = screen.getByRole("button", {
      name: "Open other-repository Space",
    });
    select.focus();
    await user.keyboard("{Enter}");
    expect(input.onSelectWorkspace).toHaveBeenCalledExactlyOnceWith(
      "other-repository",
    );
    expect(
      screen.getByRole("button", { name: "Expand other-repository Space" }),
    ).toHaveAttribute("aria-expanded", "false");
    screen.getByRole("button", { name: /Open root-first Agent/ }).focus();
    await user.keyboard(" ");
    expect(input.onSelectAgent).toHaveBeenCalledExactlyOnceWith("root-first");
  });

  test("reveals selected worktree ancestors on initial mount and mobile remount", () => {
    const state = fixture();
    state.selectedWorkspaceId = "linked-checkout";
    state.selectedAgentId = "linked-agent";
    const input = props(state);
    const view = render(sidebar(input));
    expect(
      screen.getByRole("button", { name: "Collapse repository Space" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Collapse feature/linked Space" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Open linked-agent Agent/ }),
    ).toHaveAttribute("aria-current", "page");
    view.unmount();
    state.selectedWorkspaceId = "other-repository";
    state.selectedAgentId = "other-agent";
    render(sidebar(input));
    expect(
      screen.getByRole("button", { name: /Open other-agent Agent/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("button", { name: "Expand repository Space" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: /Open linked-agent Agent/ }),
    ).not.toBeInTheDocument();
  });

  test("reveals external search, tab, and attention selections after ancestors were collapsed", async () => {
    const user = userEvent.setup();
    const input = props();
    const view = render(sidebar(input));
    await user.click(
      screen.getByRole("button", { name: "Collapse repository Space" }),
    );
    view.rerender(
      sidebar({
        ...input,
        state: {
          ...input.state,
          selectedWorkspaceId: "linked-checkout",
          selectedAgentId: "linked-agent",
        },
      }),
    );
    expect(
      screen.getByRole("button", { name: /Open linked-agent Agent/ }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(
      screen.getByRole("button", { name: "Collapse repository Space" }),
    );
    view.rerender(
      sidebar({
        ...input,
        state: { ...input.state, selectedAgentId: "root-second" },
      }),
    );
    expect(
      screen.getByRole("button", { name: /Open root-second Agent/ }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(
      screen.getByRole("button", { name: "Collapse repository Space" }),
    );
    view.rerender(
      sidebar({
        ...input,
        state: {
          ...input.state,
          selectedWorkspaceId: "empty-space",
          selectedAgentId: "",
        },
      }),
    );
    expect(
      screen.getByRole("button", { name: "Collapse empty-space Space" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("does not reopen manually collapsed groups on live status updates", async () => {
    const user = userEvent.setup();
    const input = props();
    const view = render(sidebar(input));
    await user.click(
      screen.getByRole("button", { name: "Collapse repository Space" }),
    );
    view.rerender(sidebar({ ...input, state: structuredClone(input.state) }));
    expect(
      screen.getByRole("button", { name: "Expand repository Space" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  test("supports empty workspaces and does not classify standalone Terminals as Agents", async () => {
    const user = userEvent.setup();
    render(sidebar(props()));
    await user.click(
      screen.getByRole("button", { name: "Expand empty-space Space" }),
    );
    expect(
      workspaceRow("Open empty-space Space").getByText("No detected Agents"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand terminal-space Space" }),
    );
    expect(
      workspaceRow("Open terminal-space Space").getByText("No detected Agents"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /standalone-terminal/ }),
    ).not.toBeInTheDocument();
  });

  test("supports an empty workspace collection", () => {
    render(
      sidebar({
        ...props({
          ...fixture(),
          workspaces: [],
          agents: [],
          selectedWorkspaceId: "",
          selectedAgentId: "",
        }),
        attentionCount: 0,
      }),
    );
    expect(screen.getByText("No Spaces")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Open Attention Inbox, 0 items",
      }),
    ).toBeEnabled();
  });

  test("exposes complete long names and workspace details without hover", () => {
    const longWorkspace =
      "repository-with-a-complete-very-long-name-that-must-remain-accessible";
    const longBranch =
      "feature/a-very-long-branch-name-that-must-not-be-shortened-for-touch";
    const longAgent =
      "agent-with-a-complete-very-long-name-that-must-remain-accessible";
    const state = fixture();
    state.workspaces = [
      workspace("long", { name: longWorkspace, branch: longBranch }),
    ];
    state.agents = [agent("long-agent", "long", { label: longAgent })];
    state.selectedWorkspaceId = "long";
    state.selectedAgentId = "long-agent";
    render(sidebar(props(state)));
    const select = screen.getByRole("button", {
      name: `Open ${longWorkspace} Space`,
    });
    expect(select).toHaveAccessibleDescription(
      `${longWorkspace} — /projects/long — ${longBranch}`,
    );
    expect(within(select).getByText(longWorkspace)).toBeVisible();
    expect(within(select).getByText(longBranch)).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: `Open ${longAgent} Agent in ${longWorkspace}, Working`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(longAgent)).toBeVisible();
  });

  test("keeps attention compact, uses the supplied inbox count, and passes its focus target", async () => {
    const user = userEvent.setup();
    const input = { ...props(), onDismiss: vi.fn() };
    render(sidebar(input));
    const attention = screen.getByRole("button", {
      name: "Open Attention Inbox, 2 items",
    });
    expect(within(attention).getByText("2")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /needing input/ }),
    ).not.toBeInTheDocument();
    expect(
      workspaceRow("Open feature/linked worktree Space").getByText(
        "1 needs input",
      ),
    ).toBeInTheDocument();
    await user.click(attention);
    expect(input.onOpenAttention).toHaveBeenCalledExactlyOnceWith(attention);
    expect(input.onSelectAgent).not.toHaveBeenCalled();
    expect(input.onDismiss).toHaveBeenCalledOnce();
  });

  test("dismisses mobile navigation after workspace and Agent selection, not expansion", async () => {
    const user = userEvent.setup();
    const input = { ...props(), onDismiss: vi.fn() };
    render(sidebar(input));
    await user.click(
      screen.getByRole("button", { name: "Expand feature/linked Space" }),
    );
    expect(input.onDismiss).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", {
        name: "Open feature/linked worktree Space",
      }),
    );
    expect(input.onSelectWorkspace).toHaveBeenCalledExactlyOnceWith(
      "linked-checkout",
    );
    expect(input.onDismiss).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: /Open linked-agent Agent/ }),
    );
    expect(input.onSelectAgent).toHaveBeenCalledExactlyOnceWith("linked-agent");
    expect(input.onDismiss).toHaveBeenCalledTimes(2);
  });
});

describe("Sidebar overflow menu", () => {
  test.each([
    ["New Space", "onNewSpace"],
    ["Mission Control", "onOpenMissionControl"],
    ["Workflow templates", "onOpenWorkflows"],
    ["Viewer shares", "onOpenShares"],
    ["Settings", "onOpenSettings"],
    ["Herdr runtime", "onOpenRuntime"],
    ["Keybindings", "onOpenKeybindings"],
  ] as const)(
    "moves %s into the menu and passes the persistent focus target",
    async (label, callback) => {
      const user = userEvent.setup();
      const input = { ...props(), onDismiss: vi.fn() };
      render(sidebar(input));
      expect(
        screen.queryByRole("button", { name: "Create a new Space" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: label }),
      ).not.toBeInTheDocument();
      const trigger = screen.getByRole("button", { name: "Open menu" });
      await user.click(trigger);
      await user.click(screen.getByRole("menuitem", { name: label }));
      expect(input[callback]).toHaveBeenCalledExactlyOnceWith(trigger);
      expect(input.onDismiss).toHaveBeenCalledOnce();
    },
  );

  test("preserves viewer permissions but keeps supervision, navigation, and reload reachable", async () => {
    const user = userEvent.setup();
    const input = { ...props(), canCreateSpace: false };
    render(sidebar(input));
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
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "Open repository Space" }),
    );
    expect(input.onSelectWorkspace).toHaveBeenCalledWith("repository");
  });

  test("supports keyboard menu navigation and returns focus after cancellation", async () => {
    const user = userEvent.setup();
    render(sidebar(props()));
    const trigger = screen.getByRole("button", { name: "Open menu" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "New Space" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: "Mission Control" }),
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
