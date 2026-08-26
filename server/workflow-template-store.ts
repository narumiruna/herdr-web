import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const WORKFLOW_RUNTIMES = [
  "Claude Code",
  "Codex",
  "OpenCode",
  "Pi",
  "Qwen Code",
] as const;

export type WorkflowRuntime = (typeof WORKFLOW_RUNTIMES)[number];

export interface ProjectWorkflowStep {
  cwd: string;
  id: string;
  label: string;
  order: number;
  prompt: string;
  runtime: WorkflowRuntime;
  waitForPrevious: boolean;
}

export interface ProjectWorkflowTemplate {
  id: string;
  name: string;
  projectKey: string;
  scope: "project";
  steps: ProjectWorkflowStep[];
  version: 1;
}

interface StoredWorkflows {
  templates: ProjectWorkflowTemplate[];
  version: 1;
}

export class WorkflowTemplateStore {
  private mutations: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async read(): Promise<StoredWorkflows> {
    try {
      const parsed = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as StoredWorkflows;
      return parsed?.version === 1 && Array.isArray(parsed.templates)
        ? parsed
        : { templates: [], version: 1 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { templates: [], version: 1 };
      }
      throw error;
    }
  }

  private async write(value: StoredWorkflows): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, this.filePath);
  }

  async list(projectKey: string): Promise<ProjectWorkflowTemplate[]> {
    const store = await this.read();
    return store.templates.filter(
      (template) => template.projectKey === projectKey,
    );
  }

  private mutate<T>(run: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(run, run);
    this.mutations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  save(template: ProjectWorkflowTemplate): Promise<void> {
    return this.mutate(async () => {
      const store = await this.read();
      const existing = store.templates.findIndex(
        ({ id, projectKey }) =>
          id === template.id && projectKey === template.projectKey,
      );
      if (existing < 0 && store.templates.length >= 100) {
        throw new RangeError(
          "At most 100 project workflow templates may be stored",
        );
      }
      const templates = [...store.templates];
      if (existing >= 0) templates[existing] = template;
      else templates.push(template);
      await this.write({ templates, version: 1 });
    });
  }

  delete(projectKey: string, id: string): Promise<boolean> {
    return this.mutate(async () => {
      const store = await this.read();
      const templates = store.templates.filter(
        (template) => template.id !== id || template.projectKey !== projectKey,
      );
      if (templates.length === store.templates.length) return false;
      await this.write({ templates, version: 1 });
      return true;
    });
  }
}
