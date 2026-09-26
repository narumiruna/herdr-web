import { execFile } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SUMMARY_KEY_SECRET = randomBytes(32);
const MACHINE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_MACHINES = 16;
const MAX_WORKSPACES = 64;
const MAX_AGENTS_PER_WORKSPACE = 32;
const CACHE_MS = 10_000;

export interface SavedMachineAgentSummary {
  key: string;
  label: string;
  status: string;
}

export interface SavedMachineWorkspaceSummary {
  agentCount: number;
  agents: SavedMachineAgentSummary[];
  agentsTruncated: boolean;
  key: string;
  label: string;
  needsInput: number;
}

export interface SavedMachineSummary {
  agentCount: number;
  enabled: boolean;
  error?: string;
  id: string;
  label: string;
  needsInput: number;
  protocol?: number;
  selected: boolean;
  session: string;
  status: "disabled" | "offline" | "online";
  version?: string;
  workspaceCount: number;
  workspaces: SavedMachineWorkspaceSummary[];
  workspacesTruncated: boolean;
}

export interface SavedMachineListResult {
  machineCount: number;
  machines: SavedMachineSummary[];
  machinesTruncated: boolean;
  type: "machine_list";
}

interface MachineProfile {
  enabled: boolean;
  id: string;
  label: string;
  selected: boolean;
  session: string;
}

interface CommandOutput {
  stdout: string;
}

type CommandRunner = (
  args: string[],
  timeoutMs: number,
) => Promise<CommandOutput>;

function text(value: unknown, fallback: string, max = 128): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

function firstText(values: unknown[], fallback: string, max = 128): string {
  for (const value of values) {
    const candidate = text(value, "", max);
    if (candidate) return candidate;
  }
  return fallback;
}

function summaryKey(...parts: string[]): string {
  return createHmac("sha256", SUMMARY_KEY_SECRET)
    .update(JSON.stringify(parts))
    .digest("base64url")
    .slice(0, 22);
}

function parseMachineCatalog(value: string): {
  profiles: MachineProfile[];
  total: number;
} {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new TypeError("Herdr machine list must be a JSON array");
  }
  const profiles = parsed.slice(0, MAX_MACHINES).map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError("Herdr returned an invalid machine profile");
    }
    const profile = entry as Record<string, unknown>;
    const id = text(profile.id, "", 128);
    if (!MACHINE_ID.test(id)) {
      throw new TypeError("Herdr returned an invalid machine profile id");
    }
    return {
      enabled: profile.enabled === true,
      id,
      label: text(profile.label, "Saved machine", 80),
      selected: profile.selected === true,
      session: text(profile.session, "default", 80),
    };
  });
  return { profiles, total: parsed.length };
}

export function parseMachineProfiles(value: string): MachineProfile[] {
  return parseMachineCatalog(value).profiles;
}

function snapshotFromOutput(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Herdr returned an invalid machine snapshot");
  }
  const result = (parsed as Record<string, unknown>).result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new TypeError("Herdr machine snapshot did not include a result");
  }
  const snapshot = (result as Record<string, unknown>).snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("Herdr machine snapshot did not include a snapshot");
  }
  return snapshot as Record<string, unknown>;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}

export function summarizeMachineSnapshot(
  profile: MachineProfile,
  value: string,
): SavedMachineSummary {
  const snapshot = snapshotFromOutput(value);
  const agents = records(snapshot.agents);
  const snapshotWorkspaces = records(snapshot.workspaces);
  const workspaces = snapshotWorkspaces
    .slice(0, MAX_WORKSPACES)
    .map((workspace, workspaceIndex) => {
      const workspaceId = text(workspace.workspace_id, "", 128);
      const workspaceKey = summaryKey(
        "workspace",
        profile.id,
        workspaceId || `missing:${workspaceIndex}`,
      );
      const members = agents.filter(
        (agent) => text(agent.workspace_id, "", 128) === workspaceId,
      );
      const agentSummaries = members
        .slice(0, MAX_AGENTS_PER_WORKSPACE)
        .map((agent, agentIndex) => ({
          key: summaryKey(
            "agent",
            profile.id,
            text(agent.pane_id, "", 128) ||
              `${workspaceKey}:missing:${agentIndex}`,
          ),
          label: firstText(
            [
              agent.label,
              agent.title,
              agent.terminal_title_stripped,
              agent.display_agent,
              agent.agent,
            ],
            "Agent",
            80,
          ),
          status: text(agent.agent_status, "unknown", 24),
        }));
      return {
        agentCount: members.length,
        agents: agentSummaries,
        agentsTruncated: members.length > agentSummaries.length,
        key: workspaceKey,
        label: text(workspace.label, "Space", 80),
        needsInput: members.filter((agent) => agent.agent_status === "blocked")
          .length,
      };
    });
  return {
    agentCount: agents.length,
    enabled: profile.enabled,
    id: profile.id,
    label: profile.label,
    needsInput: agents.filter((agent) => agent.agent_status === "blocked")
      .length,
    protocol:
      typeof snapshot.protocol === "number" &&
      Number.isInteger(snapshot.protocol) &&
      snapshot.protocol > 0
        ? snapshot.protocol
        : undefined,
    selected: profile.selected,
    session: profile.session,
    status: "online",
    version: text(snapshot.version, "", 40) || undefined,
    workspaceCount: snapshotWorkspaces.length,
    workspaces,
    workspacesTruncated: snapshotWorkspaces.length > workspaces.length,
  };
}

function failureMessage(error: unknown): string {
  const commandError = error as {
    killed?: unknown;
    message?: unknown;
    stderr?: unknown;
  };
  const details = [commandError.stderr, commandError.message]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  if (commandError.killed === true || /timed?\s*out/iu.test(details)) {
    return "Remote snapshot timed out";
  }
  if (
    /--machine/u.test(details) &&
    /(unknown|unexpected|unrecognized|unsupported)/iu.test(details)
  ) {
    return "Installed Herdr does not support machine-routed snapshots";
  }
  return "Remote snapshot is unavailable";
}

function unavailableMachine(
  profile: MachineProfile,
  error: unknown,
): SavedMachineSummary {
  return {
    agentCount: 0,
    enabled: profile.enabled,
    error: failureMessage(error),
    id: profile.id,
    label: profile.label,
    needsInput: 0,
    selected: profile.selected,
    session: profile.session,
    status: "offline",
    workspaceCount: 0,
    workspaces: [],
    workspacesTruncated: false,
  };
}

export class SavedMachineService {
  private cached?: { at: number; result: SavedMachineListResult };
  private inFlight?: Promise<SavedMachineListResult>;

  constructor(
    command = "herdr",
    private readonly run: CommandRunner = async (args, timeoutMs) => {
      const { stdout } = await execFileAsync(command, args, {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: timeoutMs,
      });
      return { stdout };
    },
  ) {}

  list(forceRefresh = false): Promise<SavedMachineListResult> {
    if (
      !forceRefresh &&
      this.cached &&
      Date.now() - this.cached.at < CACHE_MS
    ) {
      return Promise.resolve(this.cached.result);
    }
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.load().then((result) => {
      this.cached = { at: Date.now(), result };
      return result;
    });
    return this.inFlight.finally(() => {
      this.inFlight = undefined;
    });
  }

  private async load(): Promise<SavedMachineListResult> {
    const catalog = parseMachineCatalog(
      (await this.run(["machine", "list", "--json"], 5_000)).stdout,
    );
    const machines = await Promise.all(
      catalog.profiles.map(async (profile): Promise<SavedMachineSummary> => {
        if (!profile.enabled) {
          return {
            agentCount: 0,
            enabled: false,
            id: profile.id,
            label: profile.label,
            needsInput: 0,
            selected: profile.selected,
            session: profile.session,
            status: "disabled",
            workspaceCount: 0,
            workspaces: [],
            workspacesTruncated: false,
          };
        }
        try {
          const output = await this.run(
            ["--machine", profile.id, "api", "snapshot"],
            12_000,
          );
          return summarizeMachineSnapshot(profile, output.stdout);
        } catch (error) {
          return unavailableMachine(profile, error);
        }
      }),
    );
    return {
      machineCount: catalog.total,
      machines,
      machinesTruncated: catalog.total > machines.length,
      type: "machine_list",
    };
  }
}
