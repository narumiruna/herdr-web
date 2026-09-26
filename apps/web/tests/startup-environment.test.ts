import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:net";
import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  accessToken,
  findPort,
  lanAddress,
} from "../scripts/startup-environment.mjs";

vi.mock("node:net", () => {
  const createServer = vi.fn();
  return { createServer, default: { createServer } };
});
vi.mock("node:os", () => {
  const networkInterfaces = vi.fn();
  return { networkInterfaces, default: { networkInterfaces } };
});

const probes: number[] = [];
let blocked: Set<number>;
let closed: number;

beforeEach(() => {
  probes.length = 0;
  blocked = new Set();
  closed = 0;
  vi.mocked(networkInterfaces).mockReturnValue({});
  vi.mocked(createServer).mockImplementation(() => {
    const server = new EventEmitter();
    let selected = 0;
    return Object.assign(server, {
      unref: vi.fn(),
      listen(port: number, host: string, ready: () => void) {
        expect(host).toBe("127.0.0.1");
        probes.push(port);
        if (blocked.has(port))
          server.emit("error", new Error("port unavailable"));
        else {
          selected = port || 49152;
          ready();
        }
      },
      address: () => ({ port: selected }),
      close(done: () => void) {
        closed += 1;
        done();
      },
    }) as unknown as Server;
  });
});

function address(
  value: string,
  internal = false,
  family = "IPv4",
): NetworkInterfaceInfo {
  return {
    address: value,
    internal,
    family,
    cidr: null,
    mac: "",
    netmask: "",
  } as NetworkInterfaceInfo;
}

describe("startup environment", () => {
  test("generates independent 24-byte hex tokens", () => {
    const first = accessToken();
    expect(first).toMatch(/^[a-f0-9]{48}$/);
    expect(accessToken()).not.toBe(first);
  });

  test("probes loopback ports in order and closes the successful listener", async () => {
    blocked.add(5173);
    blocked.add(5174);
    await expect(findPort(5173)).resolves.toBe(5175);
    expect(probes).toEqual([5173, 5174, 5175]);
    expect(closed).toBe(1);
  });

  test("tries exactly 100 preferred ports before falling back to an ephemeral port", async () => {
    blocked = new Set(Array.from({ length: 100 }, (_, i) => 8787 + i));
    await expect(findPort(8787)).resolves.toBe(49152);
    expect(probes).toEqual([...blocked, 0]);
    expect(closed).toBe(1);
  });

  test("reports failure when the ephemeral fallback is unavailable", async () => {
    blocked = new Set([...Array.from({ length: 100 }, (_, i) => 8787 + i), 0]);
    await expect(findPort(8787)).rejects.toThrow(
      "Could not find an available TCP port",
    );
    expect(closed).toBe(0);
  });

  test("supports direct ephemeral selection", async () => {
    await expect(findPort(0)).resolves.toBe(49152);
    expect(probes).toEqual([0]);
  });

  test("prefers private LAN addresses and ignores internal, link-local and IPv6 interfaces", () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      absent: undefined,
      loopback: [
        address("127.0.0.1", true),
        address("::1", false, "IPv6"),
        address("169.254.1.2"),
      ],
      ethernet: [
        address("172.16.1.2"),
        address("10.1.2.3"),
        address("192.168.1.2"),
        address("192.168.1.3"),
      ],
    });
    expect(lanAddress()).toBe("192.168.1.2");
    vi.mocked(networkInterfaces).mockReturnValue({
      ethernet: [address("172.16.1.2"), address("10.1.2.3")],
    });
    expect(lanAddress()).toBe("10.1.2.3");
    vi.mocked(networkInterfaces).mockReturnValue({
      ethernet: [address("172.16.1.2"), address("172.16.1.3")],
    });
    expect(lanAddress()).toBe("172.16.1.2");
    vi.mocked(networkInterfaces).mockReturnValue({
      loopback: [address("127.0.0.1", true)],
    });
    expect(lanAddress()).toBe("localhost");
  });
});
