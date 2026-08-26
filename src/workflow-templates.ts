import type { RuntimeName } from "./state";

export const RUNTIME_COMMAND: Record<RuntimeName, string> = {
  "Claude Code": "claude",
  Codex: "codex --full-auto",
  OpenCode: "opencode",
  Pi: "pi",
  "Qwen Code": "qwen",
};

const RUNTIMES = new Set<RuntimeName>(
  Object.keys(RUNTIME_COMMAND) as RuntimeName[],
);
const TEMPLATE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_PARALLEL_LAUNCHES = 3;

export interface WorkflowStep {
  cwd: string;
  id: string;
  label: string;
  order: number;
  prompt: string;
  runtime: RuntimeName;
  waitForPrevious: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  projectKey?: string;
  scope: "browser" | "project";
  steps: WorkflowStep[];
  version: 1;
}

export interface WorkflowStepOutcome {
  error?: string;
  status: "failed" | "partial" | "started";
  stepId: string;
}

function validString(
  value: unknown,
  max: number,
  required = false,
): string | undefined {
  if (typeof value !== "string") return required ? undefined : "";
  const text = value.trim();
  if ((required && !text) || text.length > max) return undefined;
  return text;
}

function validPath(value: unknown): string | undefined {
  const path = validString(value, 4_096);
  if (path === undefined) return undefined;
  return [...path].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  })
    ? undefined
    : path;
}

export function parseWorkflowTemplate(
  value: unknown,
): WorkflowTemplate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const input = value as Partial<WorkflowTemplate>;
  const id = validString(input.id, 128, true);
  const name = validString(input.name, 80, true);
  if (
    input.version !== 1 ||
    !id ||
    !TEMPLATE_ID.test(id) ||
    !name ||
    (input.scope !== "browser" && input.scope !== "project") ||
    !Array.isArray(input.steps) ||
    input.steps.length < 1 ||
    input.steps.length > 12
  ) {
    return undefined;
  }

  const steps: WorkflowStep[] = [];
  for (const [index, raw] of input.steps.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const step = raw as Partial<WorkflowStep>;
    const runtime = step.runtime;
    const stepId = validString(step.id, 128, true);
    const label = validString(step.label, 80, true);
    const cwd = validPath(step.cwd);
    const prompt = validString(step.prompt, 20_000);
    if (
      !runtime ||
      !RUNTIMES.has(runtime) ||
      !stepId ||
      !TEMPLATE_ID.test(stepId) ||
      !label ||
      cwd === undefined ||
      prompt === undefined ||
      !Number.isInteger(step.order) ||
      Number(step.order) < 0 ||
      Number(step.order) >= 12 ||
      typeof step.waitForPrevious !== "boolean"
    ) {
      return undefined;
    }
    steps.push({
      cwd,
      id: stepId,
      label,
      order: Number(step.order ?? index),
      prompt,
      runtime,
      waitForPrevious: step.waitForPrevious,
    });
  }
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    return undefined;
  }
  const projectKey =
    input.scope === "project" ? validPath(input.projectKey) : undefined;
  if (input.scope === "project" && !projectKey) return undefined;
  return {
    id,
    name,
    ...(projectKey ? { projectKey } : {}),
    scope: input.scope,
    steps: steps.sort((left, right) => left.order - right.order),
    version: 1,
  };
}

export function parseWorkflowTemplates(
  value: string | null,
): WorkflowTemplate[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 40)
      .flatMap((entry) => {
        const template = parseWorkflowTemplate(entry);
        return template ? [template] : [];
      })
      .filter(({ scope }) => scope === "browser");
  } catch {
    return [];
  }
}

export async function executeWorkflow(
  template: WorkflowTemplate,
  start: (step: WorkflowStep) => Promise<void>,
): Promise<WorkflowStepOutcome[]> {
  const outcomes = new Map<string, WorkflowStepOutcome>();
  let pending: Promise<void>[] = [];
  const orderedSteps = [...template.steps].sort(
    (left, right) => left.order - right.order,
  );
  const run = async (step: WorkflowStep) => {
    try {
      await start(step);
      outcomes.set(step.id, { status: "started", stepId: step.id });
    } catch (error) {
      outcomes.set(step.id, {
        error: error instanceof Error ? error.message : "Agent launch failed",
        status:
          error instanceof Error && error.message.startsWith("Agent started,")
            ? "partial"
            : "failed",
        stepId: step.id,
      });
    }
  };
  for (const step of orderedSteps) {
    if (step.waitForPrevious || pending.length >= MAX_PARALLEL_LAUNCHES) {
      await Promise.all(pending);
      pending = [];
    }
    if (step.waitForPrevious) await run(step);
    else pending.push(run(step));
  }
  await Promise.all(pending);
  return orderedSteps.flatMap((step) => {
    const outcome = outcomes.get(step.id);
    return outcome ? [outcome] : [];
  });
}
