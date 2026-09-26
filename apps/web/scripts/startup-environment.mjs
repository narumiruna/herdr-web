import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";

export function accessToken() {
  return randomBytes(24).toString("hex");
}

function availablePort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const selected =
        typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(selected));
    });
  });
}

export async function findPort(preferred) {
  for (let port = preferred; port < preferred + 100; port += 1) {
    const selected = await availablePort(port);
    if (selected !== false) return selected;
  }
  const selected = await availablePort(0);
  if (selected === false || selected === 0) {
    throw new Error("Could not find an available TCP port");
  }
  return selected;
}

export function lanAddress() {
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter(
      (entry) =>
        entry.family === "IPv4" &&
        !entry.internal &&
        !entry.address.startsWith("169.254."),
    )
    .map(({ address }) => address);
  return (
    addresses.find((address) => address.startsWith("192.168.")) ??
    addresses.find((address) => address.startsWith("10.")) ??
    addresses[0] ??
    "localhost"
  );
}
