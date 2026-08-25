import { describe, expect, test } from "vitest";
import {
  parseHerdrStatus,
  statusSocketPath,
  terminalProtocolReason,
} from "../server/herdr-status";

describe("Herdr status compatibility", () => {
  test("parses protocol and platform-native socket metadata", () => {
    const status = parseHerdrStatus(
      JSON.stringify({
        client: { binary: "herdr.exe", protocol: 20, version: "0.8.2" },
        server: {
          protocol: 20,
          running: true,
          socket: "\\\\.\\pipe\\herdr",
          version: "0.8.2",
        },
      }),
    );

    expect(status.client?.protocol).toBe(20);
    expect(statusSocketPath(status)).toBe("\\\\.\\pipe\\herdr");
  });

  test("accepts terminal protocols 19 and 20 when the CLI matches", () => {
    expect(terminalProtocolReason(19, 19)).toBe("");
    expect(terminalProtocolReason(20, 20)).toBe("");
  });

  test("explains unsupported and mismatched terminal protocols", () => {
    expect(terminalProtocolReason(18, 18)).toContain("does not provide");
    expect(terminalProtocolReason(20, 19)).toContain("CLI uses protocol 19");
    expect(terminalProtocolReason(20, 19)).toContain("server uses protocol 20");
  });
});
