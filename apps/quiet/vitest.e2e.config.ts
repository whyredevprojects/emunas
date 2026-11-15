import base from "@emunas/config/vitest";
import { defineConfig } from "vitest/config";

// Browser end-to-end checks of the design shell (build + static server + headless Chrome + axe).
// Run with `npm run test:e2e -w @emunas/quiet`. Chrome: $CHROME_PATH, else Playwright's own
// Chromium if installed, else /usr/bin/google-chrome.
// (Not mergeConfig: that would concatenate the base `include` and pull in the unit tests.)
export default defineConfig({
  test: {
    ...base.test,
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
