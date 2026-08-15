import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "HERDR_WEB_TOKEN=e2e-token VITE_DEMO_MODE=true VITE_PORT=4173 BRIDGE_PORT=8788 npm run dev",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});
