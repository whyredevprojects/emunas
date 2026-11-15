import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The sync runs in Node (CI), not in workerd, so it has its own config: local D1 through
 * Miniflare, in-memory stand-ins for Vectorize and Workers AI.
 * Run: npm run test:sync -w @emunas/api
 */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
