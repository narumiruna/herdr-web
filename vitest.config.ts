import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      css: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
  }),
);
