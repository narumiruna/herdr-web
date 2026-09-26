import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkflowTemplateStore } from "../server/workflow-template-store";
import {
  executeWorkflow,
  parseWorkflowTemplate,
  parseWorkflowTemplates,
  RUNTIME_COMMAND,
  type WorkflowTemplate,
} from "../src/workflow-templates";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function workflow(): WorkflowTemplate {
  return {
    id: "review-pr",
    name: "Review PR",
    scope: "browser",
    steps: [
      {
        cwd: "/repo",
        id: "architecture",
        label: "architecture-review",
        order: 0,
        prompt: "Review architecture and correctness.",
        runtime: "Claude Code",
        waitForPrevious: false,
      },
      {
        cwd: "/repo",
        id: "tests",
        label: "regression-tests",
        order: 1,
        prompt: "Run tests and identify regressions.",
        runtime: "Codex",
        waitForPrevious: true,
      },
    ],
    version: 1,
  };
}

describe("workflow templates", () => {
  test("retains the ordered runtime choices and exact display commands", () => {
    expect(Object.entries(RUNTIME_COMMAND)).toEqual([
      ["Claude Code", "claude"],
      ["Codex", "codex --full-auto"],
      ["Muse", "muse"],
      ["OpenCode", "opencode"],
      ["Pi", "pi"],
      ["Qwen Code", "qwen"],
    ]);
  });

  test("accepts only versioned, bounded, allowlisted Agent steps", () => {
    expect(parseWorkflowTemplate(workflow())).toMatchObject({
      id: "review-pr",
      steps: [
        { runtime: "Claude Code" },
        { runtime: "Codex", waitForPrevious: true },
      ],
    });
    expect(
      parseWorkflowTemplate({
        ...workflow(),
        steps: [{ ...workflow().steps[0], runtime: "sh -c malware" }],
      }),
    ).toBeUndefined();
    expect(
      parseWorkflowTemplate({
        ...workflow(),
        steps: [{ ...workflow().steps[0], runtime: "Muse" }],
      }),
    ).toMatchObject({ steps: [{ runtime: "Muse" }] });
    expect(parseWorkflowTemplates(JSON.stringify([workflow()]))).toHaveLength(
      1,
    );
    expect(parseWorkflowTemplates("malformed")).toEqual([]);
  });

  test("preserves launch order barriers and reports partial failure without retry", async () => {
    let releaseFirst: (() => void) | undefined;
    const calls: string[] = [];
    const start = vi.fn(async (step: WorkflowTemplate["steps"][number]) => {
      calls.push(`start:${step.id}`);
      if (step.id === "architecture") {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        calls.push("finish:architecture");
      } else {
        throw new Error("Agent started, but its initial prompt failed");
      }
    });

    const running = executeWorkflow(workflow(), start);
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    expect(calls).toEqual(["start:architecture"]);
    releaseFirst?.();
    const outcomes = await running;

    expect(calls).toEqual([
      "start:architecture",
      "finish:architecture",
      "start:tests",
    ]);
    expect(outcomes).toEqual([
      { status: "started", stepId: "architecture" },
      {
        error: "Agent started, but its initial prompt failed",
        status: "partial",
        stepId: "tests",
      },
    ]);
    expect(start).toHaveBeenCalledTimes(2);
  });

  test("recovers the mutation queue after an unreadable store is repaired", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-workflow-recovery-"));
    directories.push(directory);
    const path = join(directory, "workflows.json");
    const store = new WorkflowTemplateStore(path);
    const template = {
      ...workflow(),
      projectKey: "/repo",
      scope: "project" as const,
    };
    await writeFile(path, "invalid JSON");
    await expect(store.save(template)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("invalid JSON");
    await writeFile(path, '{"templates":[],"version":1}');
    await store.save(template);
    expect(await store.list("/repo")).toEqual([template]);
    await Promise.all([
      store.delete("/repo", template.id),
      store.save(template),
    ]);
    expect(await store.list("/repo")).toEqual([template]);
  });

  test("persists project-scoped templates atomically outside the project", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-workflows-"));
    directories.push(directory);
    const path = join(directory, "runtime", "workflow-templates.json");
    const store = new WorkflowTemplateStore(path);
    const template = {
      ...workflow(),
      projectKey: "/repo",
      scope: "project" as const,
    };

    await store.save(template);
    const second = {
      ...template,
      id: "review-security",
      name: "Review security",
    };
    const third = { ...template, id: "review-tests", name: "Review tests" };
    await Promise.all([store.save(second), store.save(third)]);
    expect(await store.list("/repo")).toEqual([template, second, third]);
    expect(await store.list("/other")).toEqual([]);
    const otherProject = { ...template, projectKey: "/other" };
    await store.save(otherProject);
    expect(await store.list("/other")).toEqual([otherProject]);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      version: 1,
    });
    expect(await store.delete("/repo", template.id)).toBe(true);
    expect(await store.list("/repo")).toEqual([second, third]);
  });
});
