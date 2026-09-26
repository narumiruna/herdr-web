import {
  ChevronDownIcon,
  ChevronUpIcon,
  Cross2Icon,
  PlusIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import { Button, TextField } from "@radix-ui/themes";
import { useEffect, useMemo, useState } from "react";
import type { RuntimeName, Workspace } from "../state";
import {
  RUNTIME_COMMAND,
  type WorkflowStep,
  type WorkflowStepOutcome,
  type WorkflowTemplate,
} from "../workflow-templates";
import { RadixDialog } from "./RadixDialog";

interface WorkflowTemplatesDialogProps {
  canLaunch: boolean;
  open: boolean;
  templates: WorkflowTemplate[];
  workspace?: Workspace;
  onDelete: (template: WorkflowTemplate) => Promise<void>;
  onLaunch: (template: WorkflowTemplate) => Promise<WorkflowStepOutcome[]>;
  onOpenChange: (open: boolean) => void;
  onSave: (template: WorkflowTemplate) => Promise<void>;
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? Date.now().toString(36)}`;
}

function newStep(order: number): WorkflowStep {
  return {
    cwd: "",
    id: newId("step"),
    label: `agent-${order + 1}`,
    order,
    prompt: "",
    runtime: "Claude Code",
    waitForPrevious: order > 0,
  };
}

function newTemplate(workspace?: Workspace): WorkflowTemplate {
  return {
    id: newId("workflow"),
    name: "New workflow",
    scope: "browser",
    steps: [newStep(0)],
    version: 1,
    ...(workspace ? { projectKey: workspace.path } : {}),
  };
}

export function WorkflowTemplatesDialog({
  canLaunch,
  open,
  templates,
  workspace,
  onDelete,
  onLaunch,
  onOpenChange,
  onSave,
}: WorkflowTemplatesDialogProps) {
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<WorkflowTemplate>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcomes, setOutcomes] = useState<WorkflowStepOutcome[]>([]);
  const visibleTemplates = useMemo(
    () =>
      templates.filter(
        ({ scope, projectKey }) =>
          scope === "browser" || !projectKey || projectKey === workspace?.path,
      ),
    [templates, workspace?.path],
  );

  useEffect(() => {
    if (!open) return;
    const visibleDraft = visibleTemplates.some(({ id }) => id === draft?.id);
    const unsavedDraft =
      Boolean(draft) && !templates.some(({ id }) => id === draft?.id);
    if (
      draft?.id === selectedId &&
      (visibleDraft || unsavedDraft || draft.scope === "browser")
    ) {
      return;
    }
    const selected = visibleTemplates.find(({ id }) => id === selectedId);
    const next = selected ?? visibleTemplates[0] ?? newTemplate(workspace);
    setSelectedId(next.id);
    setDraft(structuredClone(next));
    setError("");
    setOutcomes([]);
  }, [draft, open, selectedId, templates, visibleTemplates, workspace]);

  const select = (template: WorkflowTemplate) => {
    setSelectedId(template.id);
    setDraft(structuredClone(template));
    setError("");
    setOutcomes([]);
  };
  const patchStep = (stepId: string, update: Partial<WorkflowStep>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step) =>
              step.id === stepId ? { ...step, ...update } : step,
            ),
          }
        : current,
    );
  };
  const moveStep = (index: number, offset: number) => {
    setDraft((current) => {
      if (!current) return current;
      const steps = [...current.steps];
      const target = index + offset;
      if (target < 0 || target >= steps.length) return current;
      [steps[index], steps[target]] = [
        steps[target] as WorkflowStep,
        steps[index] as WorkflowStep,
      ];
      return {
        ...current,
        steps: steps.map((step, order) => ({ ...step, order })),
      };
    });
  };

  const save = async () => {
    if (!draft || busy) return;
    if (!draft.name.trim() || draft.steps.some(({ label }) => !label.trim())) {
      setError("Name the workflow and every Agent step before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        projectKey: draft.scope === "project" ? workspace?.path : undefined,
        steps: draft.steps.map((step, order) => ({
          ...step,
          cwd: step.cwd.trim(),
          label: step.label.trim(),
          order,
          prompt: step.prompt.trim(),
        })),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft || busy) return;
    const persisted = templates.find(({ id }) => id === draft.id);
    if (!persisted) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(persisted);
      setSelectedId("");
      setDraft(undefined);
      setOutcomes([]);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Delete failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    if (!draft || !canLaunch || busy) return;
    setBusy(true);
    setError("");
    setOutcomes([]);
    try {
      setOutcomes(await onLaunch(draft));
    } catch (launchError) {
      setError(
        launchError instanceof Error ? launchError.message : "Launch failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <RadixDialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Agent workflow templates"
      description="Start an ordered batch of approved Agent runtimes. Templates do not create autonomous Agent-to-Agent collaboration."
      className="workflow-dialog"
    >
      <div className="workflow-layout">
        <aside aria-label="Workflow templates">
          {visibleTemplates.map((template) => (
            <button
              type="button"
              key={template.id}
              data-active={template.id === selectedId}
              onClick={() => select(template)}
            >
              <strong>{template.name}</strong>
              <small>
                {template.scope} · {template.steps.length} Agents
              </small>
            </button>
          ))}
          <Button
            type="button"
            size="1"
            variant="soft"
            onClick={() => {
              const created = newTemplate(workspace);
              setSelectedId(created.id);
              setDraft(created);
            }}
          >
            <PlusIcon /> New template
          </Button>
        </aside>
        {draft && (
          <section className="workflow-editor">
            <div className="workflow-heading-fields">
              <label htmlFor="workflow-template-name">
                <span>Template name</span>
                <TextField.Root
                  id="workflow-template-name"
                  value={draft.name}
                  maxLength={80}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Storage</span>
                <select
                  value={draft.scope}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      scope:
                        event.target.value === "project"
                          ? "project"
                          : "browser",
                    })
                  }
                >
                  <option value="browser">This browser</option>
                  <option value="project" disabled={!workspace}>
                    This project
                  </option>
                </select>
              </label>
            </div>
            <ol className="workflow-steps">
              {draft.steps.map((step, index) => (
                <li key={step.id}>
                  <header>
                    <strong>Step {index + 1}</strong>
                    <span>
                      <button
                        type="button"
                        aria-label={`Move ${step.label} earlier`}
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        <ChevronUpIcon />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${step.label} later`}
                        disabled={index === draft.steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ChevronDownIcon />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${step.label}`}
                        disabled={draft.steps.length === 1}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            steps: draft.steps
                              .filter(({ id }) => id !== step.id)
                              .map((entry, order) => ({ ...entry, order })),
                          })
                        }
                      >
                        <Cross2Icon />
                      </button>
                    </span>
                  </header>
                  <div className="workflow-step-grid">
                    <label>
                      <span>Agent name</span>
                      <input
                        value={step.label}
                        maxLength={80}
                        onChange={(event) =>
                          patchStep(step.id, { label: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Runtime</span>
                      <select
                        value={step.runtime}
                        onChange={(event) =>
                          patchStep(step.id, {
                            runtime: event.target.value as RuntimeName,
                          })
                        }
                      >
                        {Object.entries(RUNTIME_COMMAND).map(
                          ([runtime, command]) => (
                            <option key={runtime} value={runtime}>
                              {runtime} · {command}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="workflow-wide">
                      <span>
                        Working directory <small>optional</small>
                      </span>
                      <input
                        value={step.cwd}
                        maxLength={4_096}
                        placeholder={workspace?.path}
                        onChange={(event) =>
                          patchStep(step.id, { cwd: event.target.value })
                        }
                      />
                    </label>
                    <label className="workflow-wide">
                      <span>
                        Initial prompt <small>optional</small>
                      </span>
                      <textarea
                        rows={3}
                        value={step.prompt}
                        maxLength={20_000}
                        onChange={(event) =>
                          patchStep(step.id, { prompt: event.target.value })
                        }
                      />
                    </label>
                    <label className="workflow-check workflow-wide">
                      <input
                        type="checkbox"
                        checked={step.waitForPrevious}
                        onChange={(event) =>
                          patchStep(step.id, {
                            waitForPrevious: event.target.checked,
                          })
                        }
                      />
                      Wait for earlier launch requests to finish before this
                      step
                    </label>
                  </div>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              size="1"
              variant="soft"
              disabled={draft.steps.length >= 12}
              onClick={() =>
                setDraft({
                  ...draft,
                  steps: [...draft.steps, newStep(draft.steps.length)],
                })
              }
            >
              <PlusIcon /> Add Agent step
            </Button>
            {outcomes.length > 0 && (
              <ul
                className="workflow-outcomes"
                aria-label="Workflow launch results"
              >
                {draft.steps.map((step) => {
                  const outcome = outcomes.find(
                    ({ stepId }) => stepId === step.id,
                  );
                  return outcome ? (
                    <li key={step.id} data-status={outcome.status}>
                      <strong>{step.label}</strong>
                      <span>
                        {outcome.status === "started"
                          ? "Started"
                          : outcome.error}
                      </span>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <footer className="form-actions">
              {templates.some(({ id }) => id === draft.id) && (
                <Button
                  type="button"
                  color="red"
                  variant="soft"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Delete
                </Button>
              )}
              <Button
                type="button"
                variant="soft"
                disabled={busy}
                onClick={() => void save()}
              >
                Save template
              </Button>
              <Button
                type="button"
                color="amber"
                disabled={!canLaunch || busy}
                onClick={() => void launch()}
              >
                <RocketIcon /> {busy ? "Working…" : "Launch workflow"}
              </Button>
            </footer>
          </section>
        )}
      </div>
    </RadixDialog>
  );
}
