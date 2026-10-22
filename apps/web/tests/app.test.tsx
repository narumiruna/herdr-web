import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";
import { ViewerShareDialog } from "../src/components/ViewerShareDialog";
import { WorkflowTemplatesDialog } from "../src/components/WorkflowTemplatesDialog";
import { createDemoState } from "../src/state";
import {
  themeAppearance,
  themeStyle,
  WORKBENCH_THEME_STYLES,
  WORKBENCH_THEMES,
} from "../src/theme-preferences";
import type { WorkflowTemplate } from "../src/workflow-templates";

function renderApp() {
  const user = userEvent.setup();
  render(<App live={false} />);
  return user;
}

// Keep DOM integration checks bounded without failing on shared-host CPU load.
describe("herdr-web terminal-first workbench", { timeout: 30_000 }, () => {
  beforeEach(() => {
    document.documentElement.classList.remove(
      "dark",
      "light",
      ...WORKBENCH_THEME_STYLES.map((style) => `theme-${style}`),
    );
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  test("defaults to Editorial Dark and migrates an explicit light appearance", () => {
    const dark = render(<App live={false} />);
    expect(dark.container.querySelector(".herdr-web-theme")).toHaveClass(
      "dark",
      "theme-editorial",
    );
    expect(document.documentElement).toHaveClass("dark", "theme-editorial");
    dark.unmount();

    window.localStorage.removeItem("herdr-web-theme");
    window.localStorage.setItem("herdr-web-appearance", "light");
    const light = render(<App live={false} />);
    expect(light.container.querySelector(".herdr-web-theme")).toHaveClass(
      "light",
      "theme-editorial",
    );
    expect(document.documentElement).toHaveClass("light", "theme-editorial");
  });

  test.each(WORKBENCH_THEMES)(
    "restores saved $label and removes stale theme classes",
    ({ theme }) => {
      for (const style of WORKBENCH_THEME_STYLES) {
        document.documentElement.classList.add(`theme-${style}`);
      }
      window.localStorage.setItem("herdr-web-theme", theme);
      const app = render(<App live={false} />);
      const expectedClass = `theme-${themeStyle(theme)}`;
      expect(app.container.querySelector(".herdr-web-theme")).toHaveClass(
        expectedClass,
        themeAppearance(theme),
      );
      expect(
        [...document.documentElement.classList].filter((name) =>
          name.startsWith("theme-"),
        ),
      ).toEqual([expectedClass]);
      expect(window.localStorage.getItem("herdr-web-theme")).toBe(theme);
    },
  );

  test("shows the herdr-web product identity", () => {
    renderApp();

    expect(
      screen.getByText("herdr-web", { selector: ".brand-type strong" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("img", { name: "herdr-web terminal mark" })[0],
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "herdr-web navigation" }),
    ).toBeVisible();
  });

  test("keeps browser attention and the selected context in the document title", () => {
    renderApp();

    expect(document.title).toMatch(/^\(\d+\) /);
    expect(document.title).toContain("api-review");
    expect(document.title).toContain("herdr-web");
  });

  test("combines workspace controls and tabs into one workbench header", () => {
    const app = render(<App live={false} />);
    const header = app.container.querySelector(
      '.session-tabs[data-combined="true"]',
    );

    expect(header).not.toBeNull();
    expect(header).toContainElement(
      screen.getByRole("tablist", { name: "herdr tabs" }),
    );
    expect(header).toContainElement(
      screen.getByRole("button", { name: "New Agent in herdr" }),
    );
    expect(app.container.querySelector(".app-surface > .topbar")).toBeNull();
    expect(
      app.container.querySelector(".agent-progress-summary .status-pill"),
    ).toBeNull();
    expect(
      screen
        .getByRole("tab", { selected: true })
        .querySelectorAll(".status-pill"),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Session lifecycle actions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open details" }),
    ).not.toBeInTheDocument();
  });

  test("labels desktop icon actions on keyboard focus", async () => {
    renderApp();

    const inbox = screen.getByRole("button", {
      name: /Open Attention Inbox/,
    });
    inbox.focus();
    expect(inbox).toHaveFocus();
    expect(inbox).toHaveTextContent("Attention Inbox");

    const actions = screen.getByRole("button", {
      name: "Open more actions",
    });
    actions.focus();
    expect(actions).toHaveFocus();
    expect(actions).toHaveAccessibleName("Open more actions");
  });

  test("shows each workspace session in a keyboard-accessible tab bar", async () => {
    const user = renderApp();
    const tabList = screen.getByRole("tablist", { name: "herdr tabs" });

    expect(within(tabList).getAllByRole("tab")).toHaveLength(3);
    const selectedTab = within(tabList).getByRole("tab", {
      name: /api-review/i,
    });
    expect(selectedTab).toHaveAttribute("aria-selected", "true");
    selectedTab.focus();
    await user.keyboard("{ArrowLeft}");
    expect(
      screen.getByRole("tab", { name: /web-bridge.*Working/i }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("opens Agent setup from the plus button beside the tab bar", async () => {
    const user = renderApp();
    const trigger = screen.getByRole("button", {
      name: "New Agent in herdr",
    });

    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "Start a new Agent" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /Muse/ })).toBeVisible();
    expect(screen.getByRole("radio", { name: /Qwen Code/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("keeps session controls available in the mobile action sheet", async () => {
    const user = renderApp();

    await user.click(screen.getByRole("button", { name: "Open more actions" }));
    const actions = screen.getByRole("dialog", { name: "More actions" });

    for (const name of [
      "Start Agent",
      "New Terminal",
      "Rename tab",
      "Move tab left",
      "Move tab right",
      "Restart Agent",
      "Stop Agent",
      "Archive Agent",
      "Clear Agent",
      "Close tab",
    ]) {
      expect(
        within(actions).getByRole("button", {
          name: new RegExp(`^${name}`),
        }),
      ).toBeEnabled();
    }
  });

  test("opens the most urgent agent when a workspace is selected", async () => {
    const user = renderApp();

    await user.click(
      screen.getByRole("button", { name: "Open herdr.dev Space" }),
    );

    expect(
      screen.getByRole("tab", { name: /agent-guide.*Idle/i }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(screen.getByRole("main")).getByText("docs/agent-guide"),
    ).toBeVisible();
  });

  test("keeps cross-workspace attention in one compact entry", () => {
    renderApp();
    expect(
      screen.getAllByRole("button", {
        name: "Open Attention Inbox, 2 items",
      }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("region", { name: "Needs input" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Spaces" })).toBeVisible();
  });

  test("nests Agents in one workspace tree with independent expanders", async () => {
    const user = renderApp();
    const nav = screen.getByRole("navigation", {
      name: "herdr-web navigation",
    });
    expect(
      screen.queryByRole("region", { name: "Agents" }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).getByRole("list", { name: "herdr Agents" }),
    ).toBeVisible();
    expect(
      within(nav).queryByRole("button", { name: /Open agent-guide Agent/ }),
    ).not.toBeInTheDocument();
    const expander = within(nav).getByRole("button", {
      name: "Expand herdr.dev Space",
    });
    expander.focus();
    await user.keyboard("{Enter}");
    expect(expander).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Open herdr Space" }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(
      within(nav).getByRole("button", {
        name: /Open agent-guide Agent in herdr\.dev/,
      }),
    );
    expect(
      screen.getByRole("tab", { name: /agent-guide.*Idle/i }),
    ).toHaveAttribute("aria-selected", "true");
    await user.click(
      within(nav).getByRole("button", { name: "Collapse herdr.dev Space" }),
    );
    expect(
      within(nav).queryByRole("list", { name: "herdr.dev Agents" }),
    ).not.toBeInTheDocument();
  });

  test("ignores obsolete panel and sort preferences without changing other storage", async () => {
    window.localStorage.setItem("herdr-web-sidebar-spaces-ratio", "0.7");
    window.localStorage.setItem("herdr-web-agent-sort", "priority");
    window.localStorage.setItem("unrelated", "keep");
    const user = renderApp();
    expect(
      screen.queryByRole("separator", {
        name: "Resize Spaces and Agents panels",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Priority" }),
    ).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "herdr Agents" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining("web-bridge"),
      expect.stringContaining("api-review"),
      expect.stringContaining("integration-tests"),
    ]);
    await user.click(
      screen.getByRole("button", { name: "Collapse herdr Space" }),
    );
    expect(window.localStorage.getItem("herdr-web-sidebar-spaces-ratio")).toBe(
      "0.7",
    );
    expect(window.localStorage.getItem("herdr-web-agent-sort")).toBe(
      "priority",
    );
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });

  test("groups linked worktree Spaces under collapsible repository Spaces", async () => {
    const state = createDemoState();
    const user = userEvent.setup();
    state.selectedWorkspaceId = "linked-tree";
    state.selectedAgentId = "";
    state.selectedSessionByWorkspace = {};
    const blockedAgent = state.agents[0];
    if (!blockedAgent) throw new Error("Demo state must include an Agent");
    state.agents = [
      {
        ...structuredClone(blockedAgent),
        id: "parent-agent",
        label: "parent-agent",
        workspaceId: "repo-root",
      },
      {
        ...blockedAgent,
        id: "blocked-linked-tree",
        label: "blocked-linked-tree",
        status: "blocked",
        workspaceId: "linked-tree",
      },
    ];
    state.workspaces = [
      {
        accent: "amber",
        ahead: 0,
        behind: 0,
        branch: "main",
        id: "repo-root",
        name: "herdr-web",
        path: "/repo/herdr-web",
        worktree: {
          branch: "main",
          checkoutPath: "/repo/herdr-web",
          isLinked: false,
          repoKey: "/repo/herdr-web/.git",
          repoName: "herdr-web",
          repoRoot: "/repo/herdr-web",
        },
      },
      {
        accent: "blue",
        ahead: 0,
        behind: 0,
        branch: "narumi/feat/tree",
        id: "linked-tree",
        name: "worktree-clear-valley-bcba",
        path: "/repo/.herdr/worktree-clear-valley-bcba",
        worktree: {
          branch: "narumi/feat/tree",
          checkoutPath: "/repo/.herdr/worktree-clear-valley-bcba",
          isLinked: true,
          repoKey: "/repo/herdr-web/.git",
          repoName: "herdr-web",
          repoRoot: "/repo/herdr-web",
        },
      },
    ];

    render(<App initialState={state} live={false} />);

    const nav = screen.getByRole("navigation", {
      name: "herdr-web navigation",
    });
    expect(
      within(nav).getByRole("button", { name: "Open herdr-web Space" }),
    ).toBeVisible();
    const linkedWorktree = within(nav).getByRole("button", {
      name: "Open narumi/feat/tree worktree Space",
    });
    expect(linkedWorktree).toHaveAttribute("aria-current", "page");
    const parentAgents = within(nav).getByRole("list", {
      name: "herdr-web Agents",
    });
    const childAgents = within(nav).getByRole("list", {
      name: "narumi/feat/tree Agents",
    });
    expect(
      within(parentAgents).getByRole("button", {
        name: /Open parent-agent Agent/,
      }),
    ).toBeVisible();
    expect(
      within(parentAgents).queryByRole("button", {
        name: /blocked-linked-tree/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(childAgents).getByRole("button", {
        name: /Open blocked-linked-tree Agent/,
      }),
    ).toBeVisible();
    expect(
      within(childAgents).queryByRole("button", { name: /parent-agent/ }),
    ).not.toBeInTheDocument();
    expect(within(linkedWorktree).getByText("1 needs input")).toBeVisible();
    expect(
      within(nav).getByRole("list", { name: "herdr-web worktrees" }),
    ).toBeVisible();
    expect(linkedWorktree).toHaveAccessibleDescription(
      "worktree-clear-valley-bcba — /repo/.herdr/worktree-clear-valley-bcba — narumi/feat/tree",
    );
    expect(
      within(linkedWorktree).queryByText("worktree-clear-valley-bcba"),
    ).not.toBeInTheDocument();

    await user.click(
      within(nav).getByRole("button", {
        name: "Collapse herdr-web Space",
      }),
    );
    expect(
      within(nav).queryByRole("list", { name: "herdr-web worktrees" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(nav).getByRole("button", { name: "Expand herdr-web Space" }),
    );
    expect(
      within(nav).getByRole("list", { name: "herdr-web worktrees" }),
    ).toBeVisible();
  });

  test("keeps similar long branches distinct and exposes exact values", async () => {
    const state = createDemoState();
    const user = userEvent.setup();
    const branches = [
      "narumi/feat/add-adjustable-spaces-agents-divider",
      "narumi/feat/add-accessible-terminal-actions",
    ];
    state.workspaces.push(
      {
        accent: "blue",
        ahead: 0,
        behind: 0,
        branch: branches[0] ?? "",
        id: "long-branch-one",
        name: "Divider work",
        path: "/repo/divider-work",
      },
      {
        accent: "grass",
        ahead: 0,
        behind: 0,
        branch: branches[1] ?? "",
        id: "long-branch-two",
        name: "Terminal actions",
        path: "/repo/terminal-actions",
      },
    );

    render(<App initialState={state} live={false} />);

    const first = screen.getByRole("button", {
      name: "Open Divider work Space",
    });
    const second = screen.getByRole("button", {
      name: "Open Terminal actions Space",
    });
    expect(first).toHaveAccessibleDescription(
      expect.stringContaining(branches[0]),
    );
    expect(second).toHaveAccessibleDescription(
      expect.stringContaining(branches[1]),
    );
    first.focus();
    expect(first).toHaveFocus();
    await user.click(second);
    expect(second).toHaveAttribute("aria-current", "page");
  });

  test("shows scannable Agent identity, task, Space, selection, and status", async () => {
    const state = createDemoState();
    const statuses = [
      "blocked",
      "working",
      "done",
      "failed",
      "idle",
      "unknown",
    ] as const;
    const base = state.agents[0];
    if (!base) throw new Error("Demo state must include an Agent");
    state.agents = statuses.map((status, index) => ({
      ...structuredClone(base),
      currentStep:
        index === 0
          ? "Review the complete compatibility contract and preserve the distinguishing outcome"
          : `Current ${status} task`,
      id: `agent-${status}`,
      label: `${status}-agent`,
      status,
      tabNumber: index + 1,
    }));
    state.selectedAgentId = "agent-blocked";
    state.selectedSessionByWorkspace = {
      "herdr-core": "agent-blocked",
    };
    const user = userEvent.setup();

    const { container } = render(<App initialState={state} live={false} />);
    const agents = screen.getByRole("list", { name: "herdr Agents" });
    const rows = within(agents).getAllByRole("button");

    expect(rows).toHaveLength(statuses.length);
    for (const status of statuses) {
      const row = within(agents).getByRole("button", {
        name: new RegExp(`Open ${status}-agent Agent`),
      });
      expect(row.querySelector(".agent-identity")).toBeInTheDocument();
      expect(row.querySelector(`.status-${status}`)).toBeInTheDocument();
      expect(
        within(row).getByText(
          status === "blocked"
            ? /Review the complete compatibility contract/
            : `Current ${status} task`,
        ),
      ).toBeVisible();
      expect(row).toHaveAccessibleName(
        expect.stringContaining("Agent in herdr"),
      );
    }
    expect(
      within(agents).getByRole("button", { name: /Open blocked-agent Agent/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      container.querySelectorAll(".agent-item[data-active='true']"),
    ).toHaveLength(1);

    const blocked = within(agents).getByRole("button", {
      name: /Open blocked-agent Agent/,
    });
    blocked.focus();
    expect(blocked).toHaveFocus();
    await user.click(blocked);
    expect(
      screen.getByRole("tab", { name: /blocked-agent.*Needs input/ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("reveals a collapsed workspace when search selects its Agent", async () => {
    const user = renderApp();
    expect(
      screen.getByRole("button", { name: "Expand plugin-marketplace Space" }),
    ).toHaveAttribute("aria-expanded", "false");
    await user.click(
      screen.getByRole("button", { name: "Open Action Palette" }),
    );
    await user.type(screen.getByRole("combobox"), "plugin-index");
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: "Collapse plugin-marketplace Space" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Open plugin-index Agent/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("previews, cancels, and creates a new Space safely", async () => {
    const user = renderApp();
    const trigger = screen.getByRole("button", { name: "Open menu" });

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "New Space" }));
    await user.type(screen.getByLabelText("Directory"), "/repo/cancelled");
    expect(
      within(screen.getByRole("region", { name: "Space preview" })).getByText(
        "cancelled",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(
      screen.queryByRole("button", { name: "Open cancelled Space" }),
    ).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "New Space" }));
    await user.type(screen.getByLabelText("Directory"), "/repo/web-tool/");
    await user.type(screen.getByLabelText(/Label/), "Web tool");
    await user.click(screen.getByRole("button", { name: "Create Space" }));

    expect(
      await screen.findByRole("button", { name: "Open Web tool Space" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("heading", { name: "Start your first Agent" }),
    ).toBeVisible();
  });

  test("restores the saved terminal text size", async () => {
    window.localStorage.setItem("herdr-web-terminal-font-size", "15");
    const user = renderApp();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));

    expect(screen.getByRole("radio", { name: /Comfortable/ })).toBeChecked();
    expect(
      screen.getByText("15 px", { selector: "legend small" }),
    ).toBeVisible();
  });

  test("opens Settings and Keybindings from the Space menu", async () => {
    const user = renderApp();
    const openMenu = screen.getByRole("button", { name: "Open menu" });

    await user.click(openMenu);
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    const settings = screen.getByRole("dialog", { name: "Settings" });
    expect(settings).toBeVisible();
    expect(
      within(
        within(settings).getByRole("group", { name: "Theme" }),
      ).getAllByRole("radio"),
    ).toHaveLength(WORKBENCH_THEMES.length);
    await user.click(screen.getByRole("radio", { name: /Classic Light/ }));
    await user.click(screen.getByRole("radio", { name: /Compact/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("herdr-web-terminal-font-size")).toBe(
      "13",
    );

    await user.click(openMenu);
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    await user.click(screen.getByRole("radio", { name: /Classic Light/ }));
    await user.click(screen.getByRole("radio", { name: /Comfortable/ }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(document.documentElement).toHaveClass("light", "theme-classic");
    expect(window.localStorage.getItem("herdr-web-theme")).toBe(
      "classic-light",
    );
    expect(window.localStorage.getItem("herdr-web-terminal-font-size")).toBe(
      "15",
    );

    await user.click(openMenu);
    await user.click(screen.getByRole("menuitem", { name: "Keybindings" }));
    expect(screen.getByRole("dialog", { name: "Keybindings" })).toBeVisible();
    expect(screen.getByText("⌘ K / Ctrl K")).toBeVisible();
    expect(screen.getByText("⌘ + / Ctrl +")).toBeVisible();
    expect(screen.getByText("⌘ 0 / Ctrl 0")).toBeVisible();
  }, 30_000);

  test("sends direction to a blocked agent and resumes the session", async () => {
    const user = renderApp();

    await user.type(
      screen.getByRole("textbox", { name: "Message api-review" }),
      "Keep numeric IDs for existing clients.",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    const main = within(screen.getByRole("main"));
    expect(
      screen.getByRole("tab", { name: /api-review.*Working/i }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      main.getByText("› Keep numeric IDs for existing clients."),
    ).toBeVisible();
    expect(screen.queryByText("Replied to api-review")).not.toBeInTheDocument();
  });

  test("preserves separate drafts and attachments while switching agents", async () => {
    const user = renderApp();
    const reviewMessage = screen.getByRole("textbox", {
      name: "Message api-review",
    });
    await user.type(reviewMessage, "review draft");
    const image = new File(["png"], "review.png", { type: "image/png" });
    fireEvent.paste(window, {
      clipboardData: { files: [image], items: [] },
    });

    await user.click(screen.getByRole("tab", { name: /web-bridge/i }));
    const buildMessage = screen.getByRole("textbox", {
      name: "Message web-bridge",
    });
    expect(buildMessage).toHaveValue("");
    expect(screen.queryByText("review.png")).not.toBeInTheDocument();
    await user.type(buildMessage, "build draft");

    await user.click(screen.getByRole("tab", { name: /api-review/i }));
    expect(
      screen.getByRole("textbox", { name: "Message api-review" }),
    ).toHaveValue("review draft");
    expect(screen.getByText("review.png")).toBeVisible();
  });

  test("keeps drafts when navigation temporarily has no session to render", async () => {
    const state = createDemoState();
    state.workspaces.push({
      accent: "blue",
      ahead: 0,
      behind: 0,
      branch: "main",
      id: "empty-workspace",
      name: "empty-workspace",
      path: "/repo/empty",
    });
    const user = userEvent.setup();
    render(<App live={false} initialState={state} />);
    await user.type(
      screen.getByRole("textbox", { name: "Message api-review" }),
      "preserve me",
    );

    await user.click(
      screen.getByRole("button", { name: "Open empty-workspace Space" }),
    );
    expect(
      screen.getByRole("heading", { name: "Start your first Agent" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Open herdr Space" }));

    expect(
      screen.getByRole("textbox", { name: "Message api-review" }),
    ).toHaveValue("preserve me");
  });

  test("queues pasted and dropped images without hiding the composer", async () => {
    renderApp();
    const textbox = screen.getByRole("textbox", { name: "Message api-review" });
    const pasted = new File(["png"], "pasted.png", { type: "image/png" });

    fireEvent.paste(window, { clipboardData: { files: [pasted], items: [] } });

    expect(screen.getByText("pasted.png")).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Remove pasted.png" }));
    const dropped = new File(["jpeg"], "dropped.jpg", {
      type: "image/jpeg",
    });
    fireEvent.drop(screen.getByRole("form", { name: "Message composer" }), {
      dataTransfer: { files: [dropped], items: [] },
    });
    expect(screen.getByText("dropped.jpg")).toBeVisible();
    expect(textbox).toBeVisible();
  });

  test("command palette supports arrow keys and Enter", async () => {
    const user = renderApp();

    await user.keyboard("{Meta>}k{/Meta}");
    const search = await screen.findByRole("combobox", {
      name: "Search actions, Spaces, Agents, and Terminals",
    });
    await user.type(search, "plugin");
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");

    expect(screen.getByRole("tab", { name: /plugin-index/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("runs pane actions from the role-filtered Action Palette", async () => {
    const user = renderApp();

    await user.keyboard("{Meta>}k{/Meta}");
    const search = await screen.findByRole("combobox", {
      name: "Search actions, Spaces, Agents, and Terminals",
    });
    await user.type(search, "Split right");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("region", { name: "shell terminal" }),
    ).toBeVisible();
  });

  test("keeps global priority inspection in Mission Control, not the context row", async () => {
    const user = renderApp();
    expect(
      screen.queryByRole("button", { name: /Filter Agents by/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Mission Control" }));
    const mission = screen.getByRole("dialog", { name: "Mission Control" });
    expect(within(mission).getByText("web-bridge")).toBeVisible();
    expect(within(mission).getByText("plugin-index")).toBeVisible();
    expect(within(mission).getByText("api-review")).toBeVisible();
  });

  test("opens Attention Inbox previews and Mission Control without replacing the terminal", async () => {
    const user = renderApp();

    const inboxTrigger = screen.getByRole("button", {
      name: /Open Attention Inbox/,
    });
    await user.click(inboxTrigger);
    const inbox = screen.getByRole("dialog", { name: "Attention Inbox" });
    expect(within(inbox).getByRole("document")).toHaveTextContent(
      "Decision needed",
    );
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(inboxTrigger).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Mission Control" }));
    const mission = screen.getByRole("dialog", { name: "Mission Control" });
    expect(within(mission).getByText("Controller")).toBeVisible();
    expect(within(mission).getByText("api-review")).toBeVisible();
    expect(
      within(mission).getAllByText(/attention (just )?observed/).length,
    ).toBeGreaterThan(0);
    await user.click(
      within(mission).getByRole("button", { name: "Close dialog" }),
    );
    expect(
      screen.getByRole("document", { name: "api-review output" }),
    ).toBeVisible();
  });

  test("saves and launches a browser-local Agent workflow template", async () => {
    const user = renderApp();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Workflow templates" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Agent workflow templates",
    });
    const name = within(dialog).getByLabelText("Template name");
    await user.clear(name);
    await user.type(name, "Review PR");
    await user.click(
      within(dialog).getByRole("button", { name: "Save template" }),
    );
    await waitFor(() =>
      expect(
        window.localStorage.getItem("herdr-web-workflow-templates"),
      ).toContain("Review PR"),
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Storage"),
      "project",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save template" }),
    );
    await waitFor(() =>
      expect(
        window.localStorage.getItem("herdr-web-workflow-templates"),
      ).not.toContain("Review PR"),
    );
    expect(
      within(dialog).getAllByRole("button", { name: /Review PR/ }),
    ).toHaveLength(1);
    await user.selectOptions(
      within(dialog).getByLabelText("Storage"),
      "browser",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save template" }),
    );
    await waitFor(() =>
      expect(
        window.localStorage.getItem("herdr-web-workflow-templates"),
      ).toContain("Review PR"),
    );
    expect(
      within(dialog).getAllByRole("button", { name: /Review PR/ }),
    ).toHaveLength(1);
    await user.click(
      within(dialog).getByRole("button", { name: "New template" }),
    );
    expect(within(dialog).getByLabelText("Template name")).toHaveValue(
      "New workflow",
    );
    await user.click(within(dialog).getByRole("button", { name: /Review PR/ }));
    await user.click(
      within(dialog).getByRole("button", { name: "Launch workflow" }),
    );
    expect(
      await within(dialog).findByRole("list", {
        name: "Workflow launch results",
      }),
    ).toHaveTextContent("agent-1Started");
  });

  test("deletes the persisted workflow instead of an unsaved storage edit", async () => {
    const workspace = createDemoState().workspaces[0];
    if (!workspace) throw new Error("Missing demo workspace");
    const projectTemplate: WorkflowTemplate = {
      id: "review-pr",
      name: "Review PR",
      projectKey: workspace.path,
      scope: "project",
      steps: [
        {
          cwd: "",
          id: "review",
          label: "review",
          order: 0,
          prompt: "",
          runtime: "Pi",
          waitForPrevious: false,
        },
      ],
      version: 1,
    };
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <WorkflowTemplatesDialog
        canLaunch
        open
        templates={[projectTemplate]}
        workspace={workspace}
        onDelete={onDelete}
        onLaunch={vi.fn().mockResolvedValue([])}
        onOpenChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Storage"), "browser");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(projectTemplate);
  });

  test("creates pane-only viewer shares for standalone Terminals", async () => {
    const state = createDemoState();
    state.agents.push({
      ...structuredClone(
        state.agents[0] as NonNullable<(typeof state.agents)[0]>,
      ),
      activePaneId: "shell-main",
      id: "terminal-shell",
      kind: "terminal",
      label: "shell",
      panes: [
        {
          command: "zsh",
          id: "shell-main",
          lines: ["$"],
          title: "shell",
        },
      ],
      workspaceId: "herdr-core",
    });
    const onCreate = vi.fn().mockResolvedValue({
      share: {
        createdAt: 1,
        expiresAt: 2,
        id: "share-1",
        scope: { paneId: "shell-main", workspaceId: "herdr-core" },
      },
      token: "secret",
      type: "viewer_share_created",
      url: "/#token=secret",
    });
    const user = userEvent.setup();
    render(
      <ViewerShareDialog
        open
        state={state}
        load={vi.fn().mockResolvedValue([])}
        onCreate={onCreate}
        onOpenChange={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText(/Session/),
      "terminal-shell",
    );
    expect(screen.getByLabelText(/Pane/)).toHaveValue("shell-main");
    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(onCreate).toHaveBeenCalledWith(
      { paneId: "shell-main", workspaceId: "herdr-core" },
      60,
    );
  });

  test("restores focus after closing the command palette", async () => {
    const user = renderApp();
    const trigger = screen.getByRole("button", {
      name: "Open Action Palette",
    });

    await user.click(trigger);
    expect(
      screen.getByRole("combobox", {
        name: "Search actions, Spaces, Agents, and Terminals",
      }),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("cancels Agent setup without side effects and restores focus", async () => {
    const user = renderApp();
    const trigger = screen.getByRole("button", { name: "New Agent in herdr" });
    await user.click(trigger);
    await user.type(screen.getByLabelText("Agent name"), "do-not-start");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(
      screen.queryByRole("tab", { name: /do-not-start/i }),
    ).not.toBeInTheDocument();
  });

  test("creates a new agent with a fixed command preset", async () => {
    const user = renderApp();

    await user.click(
      screen.getByRole("button", { name: "New Agent in herdr" }),
    );
    expect(screen.getByLabelText("Agent name")).toHaveFocus();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    await user.type(screen.getByLabelText("Agent name"), "security-audit");
    await user.click(screen.getByRole("radio", { name: /Codex/i }));
    expect(
      within(screen.getByRole("region", { name: "Launch preview" })).getByText(
        "codex --full-auto",
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText("Command")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start agent" }));

    expect(
      screen.queryByRole("dialog", { name: "Start a new Agent" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("security-audit is ready.")).toBeVisible();
    expect(
      screen.getByRole("tab", { name: /security-audit.*Working/i }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Codex connected to herdr")).toBeVisible();
  });

  test("cancels and confirms pane closure without hidden side effects", async () => {
    const user = renderApp();

    await user.click(
      screen.getByRole("button", { name: "More terminal actions" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Split right" }));
    await user.click(
      screen.getByRole("button", { name: "More terminal actions" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Split right" }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("region", { name: "shell terminal" }),
    ).toBeVisible();

    await user.click(
      within(screen.getByRole("tablist", { name: "Session panes" })).getByRole(
        "tab",
        { name: "shell" },
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "More terminal actions" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Close shell pane" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Close shell pane?" });
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("region", { name: "shell terminal" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "More terminal actions" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Close shell pane" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm close pane" }),
    );
    expect(
      screen.queryByRole("region", { name: "shell terminal" }),
    ).not.toBeInTheDocument();
  });

  test("moves exact selected-pane details into a drawer and preserves drafts and focus", async () => {
    const state = createDemoState();
    const selected = state.agents.find(
      (agent) => agent.id === state.selectedAgentId,
    );
    const pane = selected?.panes[0];
    if (!pane) throw new Error("Demo state must include a selected pane");
    pane.cwd = "/repo/exact-selected-pane-directory";
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<App initialState={state} live={false} />);
    expect(
      screen.queryByText("/repo/exact-selected-pane-directory"),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("heading", { name: "Activity" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("NORMAL")).not.toBeInTheDocument();
    expect(screen.queryByText("UTF-8")).not.toBeInTheDocument();
    expect(screen.queryByText("Copy session summary")).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "Open more actions" });
    await user.type(
      screen.getByRole("textbox", { name: "Message api-review" }),
      "details draft",
    );
    fireEvent.paste(window, {
      clipboardData: {
        files: [new File(["png"], "details.png", { type: "image/png" })],
        items: [],
      },
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: /^Execution details/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Execution details" });
    expect(
      within(dialog).getByText("/repo/exact-selected-pane-directory"),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", {
        name: "Copy current working directory",
      }),
    );
    expect(copy).toHaveBeenCalledWith("/repo/exact-selected-pane-directory");
    expect(within(dialog).getByText("Claude Code")).toBeVisible();
    expect(within(dialog).getByText("Sonnet 4.6")).toBeVisible();
    expect(within(dialog).getByText("Current task")).toBeVisible();
    expect(
      within(dialog).getByText("Waiting for a compatibility decision"),
    ).toBeVisible();
    expect(within(dialog).getByText("Goal")).toBeVisible();
    expect(within(dialog).getByText("Updated")).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(
      screen.getByRole("textbox", { name: "Message api-review" }),
    ).toHaveValue("details draft");
    expect(screen.getByText("details.png")).toBeVisible();
  });

  test("keeps long names accessible and standalone Terminals out of detected Agents", async () => {
    const state = createDemoState();
    const agent = state.agents[0];
    if (!agent) throw new Error("Demo state must include an Agent");
    const label =
      "review-the-complete-cross-workspace-compatibility-contract-without-truncating-identity";
    agent.label = label;
    state.agents.push({
      ...structuredClone(agent),
      id: "standalone",
      kind: "terminal",
      label: "standalone shell",
      tabNumber: 4,
    });
    const user = userEvent.setup();
    render(<App initialState={state} live={false} />);
    const list = screen.getByRole("list", { name: "herdr Agents" });
    const row = within(list).getByRole("button", {
      name: `Open ${label} Agent in herdr, Working`,
    });
    row.focus();
    expect(row).toHaveFocus();
    expect(within(row).getByText(label)).toBeVisible();
    expect(
      within(list).queryByRole("button", { name: /standalone shell/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /standalone shell/ }));
    expect(
      screen.getByRole("tab", { name: /standalone shell/ }),
    ).toHaveAttribute("aria-selected", "true");
    await user.click(
      screen.getByRole("button", { name: "Open Action Palette" }),
    );
    await user.type(screen.getByRole("combobox"), "standalone shell");
    expect(
      screen.getAllByRole("option", { name: /standalone shell/ }).length,
    ).toBeGreaterThan(0);
  });

  test("hides missing task metadata without hiding actionable Agent status", () => {
    const state = createDemoState();
    const selected = state.agents.find(
      (agent) => agent.id === state.selectedAgentId,
    );
    if (!selected) throw new Error("Demo state must include a selected Agent");
    selected.currentStep = "";
    selected.summary = "";
    const { container } = render(<App initialState={state} live={false} />);
    expect(
      container.querySelector(".agent-progress-summary"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName(
      /Needs input/,
    );
    expect(
      screen.getByRole("region", { name: "Agent needs input" }),
    ).toBeVisible();
  });

  test("counts actionable attention groups and reveals selection from attention", async () => {
    const state = createDemoState();
    const remote = state.agents.find(
      (agent) => agent.workspaceId === "docs-site",
    );
    if (!remote) throw new Error("Demo state must include a remote Agent");
    remote.status = "failed";
    const user = userEvent.setup();
    render(<App initialState={state} live={false} />);
    expect(
      screen.getByRole("button", { name: "Expand herdr.dev Space" }),
    ).toHaveAttribute("aria-expanded", "false");
    await user.click(
      screen.getByRole("button", { name: "Open Attention Inbox, 3 items" }),
    );
    const inbox = screen.getByRole("dialog", { name: "Attention Inbox" });
    await user.click(
      within(inbox).getByRole("button", { name: /agent-guide/ }),
    );
    const open = within(inbox).getByRole("button", { name: "Open Agent" });
    await user.click(open);
    expect(
      screen.getByRole("button", { name: "Collapse herdr.dev Space" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Open agent-guide Agent/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("updates the compact attention count after review and snooze", async () => {
    const user = renderApp();
    await user.click(
      screen.getByRole("button", { name: "Open Attention Inbox, 2 items" }),
    );
    const inbox = screen.getByRole("dialog", { name: "Attention Inbox" });
    await user.click(
      within(inbox).getByRole("button", { name: "Mark reviewed" }),
    );
    await user.click(
      within(inbox).getByRole("button", { name: "Close dialog" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Open Attention Inbox, 1 items" }),
    );
    const reopened = screen.getByRole("dialog", { name: "Attention Inbox" });
    await user.click(
      within(reopened).getByRole("button", { name: "Snooze 15m" }),
    );
    await user.click(
      within(reopened).getByRole("button", { name: "Close dialog" }),
    );
    expect(
      screen.getByRole("button", { name: "Open Attention Inbox, 0 items" }),
    ).toBeVisible();
  });

  test("keeps the read-only terminal from looking like a second input", () => {
    renderApp();

    expect(document.querySelector(".terminal-cursor")).not.toBeInTheDocument();
    expect(
      screen.getByRole("document", { name: "api-review output" }),
    ).not.toHaveAttribute("aria-live");
  });
});
