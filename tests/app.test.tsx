import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { App } from "../src/App";
import { createDemoState } from "../src/state";

function renderApp() {
  const user = userEvent.setup();
  render(<App live={false} />);
  return user;
}

describe("herdr-web terminal-first workbench", () => {
  beforeEach(() => {
    document.documentElement.classList.remove(
      "dark",
      "light",
      "theme-classic",
      "theme-editorial",
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
    expect(screen.getByRole("radio", { name: /Qwen Code/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
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

  test("puts blocked agents in a global needs-input group", () => {
    renderApp();

    const attention = screen.getByRole("region", { name: "Needs input" });
    expect(
      within(attention).getByRole("button", { name: /api-review/i }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Spaces" })).toBeVisible();
  });

  test("mirrors Herdr with Spaces actions above a global Agents panel", async () => {
    const user = renderApp();
    const agents = screen.getByRole("region", { name: "Agents" });

    expect(screen.getByRole("heading", { name: "Spaces" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create a new Space" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Open menu" })).toBeVisible();
    const agentList = within(agents).getByRole("navigation", {
      name: "Detected Agents",
    });
    expect(within(agentList).getAllByRole("button")).toHaveLength(5);

    await user.click(
      within(agentList).getByRole("button", {
        name: /agent-guide.*herdr\.dev/i,
      }),
    );
    expect(
      screen.getByRole("tab", { name: /agent-guide.*Idle/i }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("groups linked worktree Spaces under their repository Space", () => {
    const state = createDemoState();
    state.selectedWorkspaceId = "linked-tree";
    state.selectedAgentId = "";
    state.selectedSessionByWorkspace = {};
    const blockedAgent = state.agents[0];
    if (!blockedAgent) throw new Error("Demo state must include an Agent");
    state.agents = [
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
    expect(within(linkedWorktree).getByText("1 needs input")).toBeVisible();
    expect(
      within(nav).getByRole("group", { name: "herdr-web worktrees" }),
    ).toBeVisible();
    expect(
      within(linkedWorktree).queryByText("worktree-clear-valley-bcba"),
    ).not.toBeInTheDocument();
  });

  test("switches the Agents panel between grouped and priority order", async () => {
    const user = renderApp();
    const agents = screen.getByRole("region", { name: "Agents" });
    const list = within(agents).getByRole("navigation", {
      name: "Detected Agents",
    });
    const labels = () =>
      within(list)
        .getAllByRole("button")
        .map((item) => item.textContent);

    expect(
      within(agents).getByRole("radio", { name: "Grouped" }),
    ).toHaveAttribute("data-state", "on");
    expect(labels()).toEqual([
      expect.stringContaining("web-bridge"),
      expect.stringContaining("api-review"),
      expect.stringContaining("integration-tests"),
      expect.stringContaining("agent-guide"),
      expect.stringContaining("plugin-index"),
    ]);

    await user.click(within(agents).getByRole("radio", { name: "Priority" }));

    expect(labels()).toEqual([
      expect.stringContaining("api-review"),
      expect.stringContaining("integration-tests"),
      expect.stringContaining("web-bridge"),
      expect.stringContaining("plugin-index"),
      expect.stringContaining("agent-guide"),
    ]);
    expect(window.localStorage.getItem("herdr-web-agent-sort")).toBe(
      "priority",
    );
  });

  test("previews, cancels, and creates a new Space safely", async () => {
    const user = renderApp();
    const trigger = screen.getByRole("button", { name: "Create a new Space" });

    await user.click(trigger);
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
      within(settings).getAllByRole("radio", { name: /Editorial|Classic/ }),
    ).toHaveLength(4);
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
  });

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
      name: "Search Spaces, Agents, and Terminals",
    });
    await user.type(search, "plugin");
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");

    expect(screen.getByRole("tab", { name: /plugin-index/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("restores focus after closing the command palette", async () => {
    const user = renderApp();
    const trigger = screen.getByRole("button", {
      name: "Open command palette",
    });

    await user.click(trigger);
    expect(
      screen.getByRole("combobox", {
        name: "Search Spaces, Agents, and Terminals",
      }),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("cancels Agent setup without side effects and restores focus", async () => {
    const user = renderApp();
    const trigger = screen.getByRole("button", { name: "New agent" });
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

    await user.click(screen.getByRole("button", { name: "New agent" }));
    expect(screen.getByLabelText("Agent name")).toHaveFocus();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
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

    await user.click(screen.getByRole("button", { name: "Split pane" }));
    await user.click(screen.getByRole("menuitem", { name: "Split right" }));
    expect(screen.getByRole("button", { name: "Split pane" })).toHaveAttribute(
      "title",
      "This session already has two panes.",
    );
    expect(
      screen.getByRole("region", { name: "shell terminal" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close shell pane" }));
    const dialog = screen.getByRole("dialog", { name: "Close shell pane?" });
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("region", { name: "shell terminal" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close shell pane" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm close pane" }),
    );
    expect(
      screen.queryByRole("region", { name: "shell terminal" }),
    ).not.toBeInTheDocument();
  });

  test("moves real runtime details into an on-demand drawer", async () => {
    const user = renderApp();

    expect(
      screen.queryByRole("heading", { name: "Activity" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("NORMAL")).not.toBeInTheDocument();
    expect(screen.queryByText("UTF-8")).not.toBeInTheDocument();
    expect(screen.queryByText("Copy session summary")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open details" }));
    const dialog = screen.getByRole("dialog", { name: "Session details" });
    expect(within(dialog).getByText("Claude Code")).toBeVisible();
    expect(within(dialog).getByText("Sonnet 4.6")).toBeVisible();
  });

  test("keeps the read-only terminal from looking like a second input", () => {
    renderApp();

    expect(document.querySelector(".terminal-cursor")).not.toBeInTheDocument();
    expect(
      screen.getByRole("document", { name: "api-review output" }),
    ).not.toHaveAttribute("aria-live");
  });
});
