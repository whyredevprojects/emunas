import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the real-data chain script (C3.8): step order, the workflows' order, argument
 * parsing, the self-test exit rule and the planted leaks (against a small synthetic layer). Run:
 *   npx vitest run --config tests/chain/vitest.config.ts
 */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
  },
});
