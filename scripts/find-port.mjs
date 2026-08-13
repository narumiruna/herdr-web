import { createServer } from "node:net";

const preferred = Number.parseInt(process.argv[2] ?? "0", 10);

function available(port) {
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

let selected = 0;
for (let port = preferred; port < preferred + 100; port += 1) {
  const result = await available(port);
  if (result !== false) {
    selected = result;
    break;
  }
}
if (!selected) selected = (await available(0)) || 0;
if (!selected) throw new Error("Could not find an available TCP port");
process.stdout.write(String(selected));
