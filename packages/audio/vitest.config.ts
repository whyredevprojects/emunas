import base from "@emunas/config/vitest";
import { defineConfig } from "vitest/config";

/**
 * Node tests: URL scheme, table, ranges/conditionals, publish plan and CLI (mocked S3).
 * `include` replaces the base globs (mergeConfig would concatenate them and pull in
 * the workerd-only tests under test/edge, which run via vitest.workers.config.ts).
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["test/node/**/*.test.ts"],
  },
});
