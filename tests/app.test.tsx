import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { App } from "../src/App";
import { createDemoState } from "../src/state";

function renderApp() {
  const user = userEvent.setup();
  render(<App live={false} />);
  return user;
}

describe("herdr terminal-first workbench", () => {
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

  test("opens the most urgent agent when a workspace is selected", async () => {
    const user = renderApp();

    await user.click(
      screen.getByRole("button", { name: "Open herdr.dev workspace" }),
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
    expect(screen.getByRole("heading", { name: "Workspaces" })).toBeVisible();
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
      screen.getByRole("button", { name: "Open empty-workspace workspace" }),
    );
    expect(
      screen.getByRole("heading", { name: "Start your first Agent" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Open herdr workspace" }),
    );

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
      name: "Search workspaces, agents, and terminals",
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
        name: "Search workspaces, agents, and terminals",
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
    expect(screen.getAllByRole("radio")).toHaveLength(4);
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
