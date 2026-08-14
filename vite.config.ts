import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const webPort = Number.parseInt(process.env.VITE_PORT ?? "5173", 10);
const bridgePort = Number.parseInt(process.env.BRIDGE_PORT ?? "8787", 10);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: webPort,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${bridgePort}`,
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    css: true,
  },
});
