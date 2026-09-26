// Dependency-free catalog shared by the browser and the Herdr bridge.
export const AGENT_RUNTIMES = {
  "Claude Code": { args: [], command: "claude", kind: "claude" },
  Codex: { args: ["--full-auto"], command: "codex --full-auto", kind: "codex" },
  Muse: { args: [], command: "muse", kind: "muse" },
  OpenCode: { args: [], command: "opencode", kind: "opencode" },
  Pi: { args: [], command: "pi", kind: "pi" },
  "Qwen Code": { args: [], command: "qwen", kind: "qwen" },
} as const;

export type RuntimeName = keyof typeof AGENT_RUNTIMES;

export const RUNTIME_COMMAND = Object.fromEntries(
  Object.entries(AGENT_RUNTIMES).map(([name, preset]) => [
    name,
    preset.command,
  ]),
) as Record<RuntimeName, string>;

export function isAgentRuntime(value: string): value is RuntimeName {
  return Object.hasOwn(AGENT_RUNTIMES, value);
}
