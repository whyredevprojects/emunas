import base from "@emunas/config/vitest";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

// Service worker unit tests (Node, with an in-memory Cache Storage). Run from apps/live:
//   vitest run --config sw/vitest.config.ts
export default mergeConfig(
  base,
  defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    test: { include: ["test/**/*.test.{ts,tsx}"] },
  }),
);
