import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Cross-site tests (W5.1). Needs both sites built from the same `.corpus/` with
 * EMUNAS_DOMAIN=emunas.example (see sites.ts). Run:
 *   npx vitest run --config tests/cross-site/vitest.config.ts
 */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
