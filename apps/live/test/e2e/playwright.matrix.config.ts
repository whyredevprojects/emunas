import { defineConfig, devices } from "@playwright/test";

/**
 * W5.1 browser matrix for the Live specs: Chromium and WebKit, desktop and mobile. The default
 * `apps/live/playwright.config.ts` (system Chrome, desktop + Pixel 7) stays the quick local run;
 * CI runs this one after `npx playwright install --with-deps chromium webkit`:
 *
 *   npx playwright test -c test/e2e/playwright.matrix.config.ts            (from apps/live)
 *   LIVE_E2E_DATA=build npx playwright test -c … --grep @data              (real-data build)
 *
 * WebKit runs every spec except (each a known gap, see the W5.1 report):
 * - offline.spec.ts: drives the service worker and Cache Storage through Chromium-only hooks;
 * - listening-room.spec.ts, shelf.spec.ts: need real playback, and Playwright's WebKit build on
 *   Linux leaves the stand-in media "loading" (browse.spec.ts checks the queue there, playback in
 *   Chromium);
 * - feedback.spec.ts: the Turnstile stand-in never resolves in WebKit (status stays "Checking…");
 * - the pixel-level mirroring screenshot diff (rasterization differs per engine) and the settings
 *   radio test (react-aria's hidden radio ignores a forced click in WebKit).
 */
const PORT = Number(process.env["LIVE_E2E_PORT"] ?? 4173);
const chromeChannel = process.env["PW_CHANNEL"] ?? "chromium";
const chromium = chromeChannel === "chromium" ? {} : { channel: chromeChannel };
const WEBKIT_SKIP = [/offline\.spec\.ts/u, /listening-room\.spec\.ts/u, /shelf\.spec\.ts/u, /feedback\.spec\.ts/u];
const WEBKIT_GREP_INVERT = /screenshot diff|settings from the query string/u;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never", outputFolder: "../../playwright-report" }]] : "list",
  outputDir: "../../test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...chromium, viewport: { width: 1280, height: 800 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], ...chromium } },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } },
      testIgnore: WEBKIT_SKIP,
      grepInvert: WEBKIT_GREP_INVERT,
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 14"] },
      testIgnore: WEBKIT_SKIP,
      grepInvert: WEBKIT_GREP_INVERT,
    },
  ],
  webServer: {
    command: `node serve.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env["CI"],
  },
});
