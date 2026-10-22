import type { SpawnOptions } from "node:child_process";

interface WorkbenchChild {
  kill(signal: NodeJS.Signals): boolean;
  once(event: "error", listener: (error: Error) => void): unknown;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
}

export function npmExecutable(platform?: NodeJS.Platform): string;

interface StartupOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  projectRoot: string;
  spawnProcess?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => WorkbenchChild;
}

export function runNpm(
  args: string[],
  options: StartupOptions,
  label: string,
): Promise<void>;

export function startWorkbench(options: StartupOptions): Promise<void>;
