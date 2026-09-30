import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      css: true,
      environment: "jsdom",
      // Bound DOM-heavy workers so contention does not starve test timers.
      maxWorkers: 2,
      setupFiles: "./tests/setup.ts",
    },
  }),
);
