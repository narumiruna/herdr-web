import { describe, expect, test } from "vitest";
import { TerminalTicketStore } from "../server/terminal-tickets";

const input = {
  cols: 120,
  mode: "control" as const,
  paneId: "w5:p1",
  rows: 40,
  takeover: false,
};

describe("TerminalTicketStore", () => {
  test("issues one-use tickets with a bounded lifetime", () => {
    let now = 1_000;
    const store = new TerminalTicketStore({ now: () => now, ttlMs: 500 });
    const issued = store.issue(input);

    expect(issued.ticket).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(issued.expiresAt).toBe(1_500);
    expect(store.consume(issued.ticket)).toMatchObject(input);
    expect(store.consume(issued.ticket)).toBeUndefined();

    const expired = store.issue(input);
    now = 1_500;
    expect(store.consume(expired.ticket)).toBeUndefined();
  });

  test("bounds pending tickets after removing expired entries", () => {
    let now = 0;
    const store = new TerminalTicketStore({
      maxTickets: 1,
      now: () => now,
      ttlMs: 10,
    });
    store.issue(input);
    expect(() => store.issue(input)).toThrow("Too many pending");

    now = 11;
    expect(() => store.issue(input)).not.toThrow();
  });
});
