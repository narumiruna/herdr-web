import type { SpawnOptions } from "node:child_process";

interface WorkbenchChild {
  once(event: "error", listener: (error: Error) => void): unknown;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
}

export function npmExecutable(platform?: NodeJS.Platform): string;

export function startWorkbench(options: {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  projectRoot: string;
  spawnProcess?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => WorkbenchChild;
}): Promise<void>;
