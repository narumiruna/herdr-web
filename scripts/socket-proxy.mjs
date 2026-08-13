import { createConnection, createServer } from "node:net";

const socketPath = process.argv[2];
const port = Number.parseInt(process.argv[3] ?? "", 10);
if (!socketPath || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Usage: node scripts/socket-proxy.mjs SOCKET_PATH PORT");
}

const server = createServer((downstream) => {
  const upstream = createConnection(socketPath);
  upstream.once("error", () => downstream.destroy());
  downstream.once("error", () => upstream.destroy());
  downstream.once("close", () => upstream.destroy());
  upstream.once("close", () => downstream.destroy());
  downstream.pipe(upstream);
  upstream.pipe(downstream);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`herdr socket proxy listening on 127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
