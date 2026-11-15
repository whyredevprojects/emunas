import { defineConfig } from "vitest/config";

/**
 * Shared Vitest settings for every site workspace. A workspace's
 * vitest.config.ts merges this with `mergeConfig(base, defineConfig({...}))`.
 */
const base = defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.corpus/**"],
    environment: "node",
    passWithNoTests: false,
    restoreMocks: true,
    testTimeout: 30_000,
  },
});

export default base;
