import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { AgentProgressSummary } from "../src/components/AgentProgressSummary";
import { type Agent, createDemoState } from "../src/state";

function demoAgent(): Agent {
  const agent = createDemoState().agents.find(
    ({ id }) => id === "agent-review",
  );
  if (!agent) throw new Error("Missing demo Agent");
  return structuredClone(agent);
}

describe("AgentProgressSummary", () => {
  test("keeps secondary progress collapsed until requested", async () => {
    const agent = demoAgent();
    const user = userEvent.setup();
    const { container } = render(<AgentProgressSummary agent={agent} />);
    const details = container.querySelector("details");

    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText(agent.currentStep)).toBeVisible();
    expect(screen.getByText(agent.summary)).not.toBeVisible();

    await user.click(screen.getByText("Details"));

    expect(details).toHaveAttribute("open");
    expect(screen.getByText(agent.summary)).toBeVisible();
    expect(screen.getByText(agent.updated)).toBeVisible();
  });

  test.each([
    ["blocked", "Needs input"],
    ["working", "Working"],
    ["done", "Done"],
    ["failed", "Failed"],
  ] as const)("shows %s as a semantic status", (status, label) => {
    const agent = demoAgent();
    agent.status = status;
    const { container } = render(<AgentProgressSummary agent={agent} />);

    expect(container.querySelector(`.status-${status}`)).toBeInTheDocument();
    expect(
      container.querySelector(".agent-progress-copy small"),
    ).toHaveTextContent(label);
  });

  test("uses a summary as the task and omits an empty disclosure", () => {
    const agent = demoAgent();
    agent.currentStep = "";
    agent.updated = "";
    const { container } = render(<AgentProgressSummary agent={agent} />);

    expect(screen.getByText(agent.summary)).toBeVisible();
    expect(container.querySelector("details")).not.toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
  });

  test("omits empty and standalone Terminal progress", () => {
    const emptyAgent = demoAgent();
    emptyAgent.currentStep = "";
    emptyAgent.summary = "";
    emptyAgent.updated = "";
    const empty = render(<AgentProgressSummary agent={emptyAgent} />);
    expect(empty.container).toBeEmptyDOMElement();
    empty.unmount();

    const terminal = demoAgent();
    terminal.kind = "terminal";
    const standalone = render(<AgentProgressSummary agent={terminal} />);
    expect(standalone.container).toBeEmptyDOMElement();
  });
});
