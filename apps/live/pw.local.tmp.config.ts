import base from "./playwright.config.ts";
import { defineConfig } from "@playwright/test";
const exe = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
export default defineConfig({
  ...base,
  outputDir: process.env["PW_OUT"],
  projects: base.projects!.map((p) => ({ ...p, use: { ...p.use, launchOptions: { executablePath: exe } } })),
});
