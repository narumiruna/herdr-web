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

function renderApp() {
  const user = userEvent.setup();
  render(<App live={false} />);
  return user;
}

describe("herdr terminal-first workbench", () => {
  test("opens the most urgent agent when a workspace is selected", async () => {
    const user = renderApp();

    await user.click(
      screen.getByRole("button", { name: "Open herdr.dev workspace" }),
    );

    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { name: "agent-guide" })).toBeVisible();
    expect(main.getByText("docs/agent-guide")).toBeVisible();
  });

  test("puts blocked agents in a global needs-attention group", () => {
    renderApp();

    const attention = screen.getByRole("region", { name: "Needs attention" });
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
    expect(main.getByText("Working")).toBeVisible();
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

    await user.click(screen.getByRole("button", { name: /web-bridge/i }));
    const buildMessage = screen.getByRole("textbox", {
      name: "Message web-bridge",
    });
    expect(buildMessage).toHaveValue("");
    expect(screen.queryByText("review.png")).not.toBeInTheDocument();
    await user.type(buildMessage, "build draft");

    await user.click(screen.getByRole("button", { name: /api-review/i }));
    expect(
      screen.getByRole("textbox", { name: "Message api-review" }),
    ).toHaveValue("review draft");
    expect(screen.getByText("review.png")).toBeVisible();
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

    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { name: "plugin-index" })).toBeVisible();
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

  test("creates a new agent with a fixed command preset", async () => {
    const user = renderApp();

    await user.click(screen.getByRole("button", { name: "New agent" }));
    expect(screen.getByLabelText("Agent name")).toHaveFocus();
    await user.type(screen.getByLabelText("Agent name"), "security-audit");
    await user.selectOptions(screen.getByLabelText("Agent runtime"), "Codex");
    expect(screen.getByText("codex --full-auto")).toBeVisible();
    expect(screen.queryByLabelText("Command")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start agent" }));

    expect(
      within(screen.getByRole("main")).getByRole("heading", {
        name: "security-audit",
      }),
    ).toBeVisible();
    expect(screen.getByText("Codex connected to herdr")).toBeVisible();
  });

  test("cancels and confirms pane closure without hidden side effects", async () => {
    const user = renderApp();

    await user.click(screen.getByRole("button", { name: "Split terminal" }));
    expect(
      screen.getByRole("button", { name: "Split terminal" }),
    ).toHaveAttribute("title", "This session already has two panes.");
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

  test("does not make retained terminal output a live region", () => {
    renderApp();

    expect(
      screen.getByRole("document", { name: "api-review output" }),
    ).not.toHaveAttribute("aria-live");
  });
});
