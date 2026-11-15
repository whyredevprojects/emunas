import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Run: npx vitest run --config apps/live/tests/eval/vitest.config.ts */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
});
