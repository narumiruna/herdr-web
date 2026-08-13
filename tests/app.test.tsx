import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { App } from "../src/App";

function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  return user;
}

describe("herdr web app", () => {
  test("opens the most urgent agent when a workspace is selected", async () => {
    const user = renderApp();

    await user.click(
      screen.getByRole("button", { name: "Open herdr.dev workspace" }),
    );

    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { name: "agent-guide" })).toBeVisible();
    expect(main.getByText("docs/agent-guide")).toBeVisible();
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
    expect(screen.getByText("Replied to api-review")).toBeVisible();
  });

  test("command palette finds and focuses agents", async () => {
    const user = renderApp();

    await user.keyboard("{Meta>}k{/Meta}");
    const search = await screen.findByRole("textbox", {
      name: "Search spaces and agents",
    });
    await user.type(search, "plugin");
    await user.click(screen.getByRole("option", { name: /plugin-index/i }));

    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { name: "plugin-index" })).toBeVisible();
    expect(main.getByText("plugin-marketplace")).toBeVisible();
  });

  test("creates a new session in the active workspace", async () => {
    const user = renderApp();

    await user.click(screen.getByRole("button", { name: "New session" }));
    await user.type(screen.getByLabelText("Session name"), "security-audit");
    await user.selectOptions(screen.getByLabelText("Agent runtime"), "Codex");
    await user.clear(screen.getByLabelText("Command"));
    await user.type(screen.getByLabelText("Command"), "codex --full-auto");
    await user.click(screen.getByRole("button", { name: "Start session" }));

    expect(
      within(screen.getByRole("main")).getByRole("heading", {
        name: "security-audit",
      }),
    ).toBeVisible();
    expect(screen.getByText("Codex connected to herdr")).toBeVisible();
  });

  test("splits and closes the focused terminal", async () => {
    const user = renderApp();

    await user.click(screen.getByRole("button", { name: "Split terminal" }));
    expect(
      screen.getByRole("region", { name: "shell terminal" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close shell pane" }));
    expect(
      screen.queryByRole("region", { name: "shell terminal" }),
    ).not.toBeInTheDocument();
  });
});
