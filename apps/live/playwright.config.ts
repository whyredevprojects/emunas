import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the Live app (W2.4 shell; later waves add theirs under test/e2e). Run after a
 * build: `npm run test:e2e -w @emunas/live`. Uses the system Chrome by default
 * (`PW_CHANNEL=chrome`); set `PW_CHANNEL=chromium` after `npx playwright install chromium`.
 */
const PORT = Number(process.env["LIVE_E2E_PORT"] ?? 4173);
const channel = process.env["PW_CHANNEL"] ?? "chrome";

export default defineConfig({
  testDir: "test/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...(channel === "chromium" ? {} : { channel }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node test/e2e/serve.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env["CI"],
  },
});
