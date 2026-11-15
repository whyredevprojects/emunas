import base from "@emunas/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

// The data build's tests (Node only). `npm test -w @emunas/live` runs them after the app tests.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      root: import.meta.dirname,
      include: ["**/*.test.ts"],
      testTimeout: 300_000,
    },
  }),
);
