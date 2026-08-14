import { randomBytes } from "node:crypto";

export type TerminalMode = "control" | "observe";

export interface TerminalTicketInput {
  cols: number;
  mode: TerminalMode;
  paneId: string;
  rows: number;
  takeover: boolean;
}

export interface TerminalTicket extends TerminalTicketInput {
  expiresAt: number;
}

interface TerminalTicketStoreOptions {
  maxTickets?: number;
  now?: () => number;
  ttlMs?: number;
}

export class TerminalTicketStore {
  private readonly tickets = new Map<string, TerminalTicket>();
  private readonly maxTickets: number;
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: TerminalTicketStoreOptions = {}) {
    this.maxTickets = options.maxTickets ?? 256;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 30_000;
  }

  issue(input: TerminalTicketInput): { expiresAt: number; ticket: string } {
    this.removeExpired();
    if (this.tickets.size >= this.maxTickets) {
      throw new RangeError("Too many pending terminal connections");
    }
    const ticket = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + this.ttlMs;
    this.tickets.set(ticket, { ...input, expiresAt });
    return { expiresAt, ticket };
  }

  consume(ticket: string): TerminalTicket | undefined {
    const value = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!value || value.expiresAt <= this.now()) return undefined;
    return value;
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [ticket, value] of this.tickets) {
      if (value.expiresAt <= now) this.tickets.delete(ticket);
    }
  }
}
