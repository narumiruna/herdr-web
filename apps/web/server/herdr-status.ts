import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HerdrStatus {
  client?: {
    binary?: string;
    protocol?: number;
    version?: string;
  };
  server?: {
    compatible?: boolean;
    protocol?: number;
    running?: boolean;
    socket?: string;
    version?: string;
  };
}

export function parseHerdrStatus(value: string): HerdrStatus {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Herdr status must be a JSON object");
  }
  return parsed as HerdrStatus;
}

export async function readHerdrStatus(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HerdrStatus> {
  try {
    const { stdout } = await execFileAsync(command, ["status", "--json"], {
      encoding: "utf8",
      env,
      timeout: 5_000,
    });
    return parseHerdrStatus(stdout);
  } catch (error) {
    const stdout = (error as { stdout?: unknown }).stdout;
    if (typeof stdout === "string" && stdout.trim()) {
      return parseHerdrStatus(stdout);
    }
    throw error;
  }
}

export function statusSocketPath(status: HerdrStatus | undefined): string {
  return typeof status?.server?.socket === "string"
    ? status.server.socket.trim()
    : "";
}

export function parseHerdrProtocol(
  value: string | undefined,
): number | undefined {
  if (!value?.trim()) return undefined;
  const protocol = Number(value);
  return Number.isInteger(protocol) && protocol > 0 ? protocol : undefined;
}

export function terminalProtocolReason(
  serverProtocol: number,
  clientProtocol?: number,
): string {
  if (serverProtocol < 19) {
    return `Herdr protocol ${serverProtocol || "unknown"} does not provide terminal sessions; Herdr 0.8 or newer is required.`;
  }
  if (
    clientProtocol !== undefined &&
    Number.isInteger(clientProtocol) &&
    clientProtocol !== serverProtocol
  ) {
    return `The Herdr CLI uses protocol ${clientProtocol}, but the running server uses protocol ${serverProtocol}. Restart or hand off the Herdr server before opening an interactive terminal.`;
  }
  return "";
}
