import { resolve } from "node:path";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import { configDir, repoRoot } from "./helpers.ts";

const configFile = resolve(configDir, "stylelint.config.js");

async function lintCss(code: string, file = "apps/quiet/src/styles/x.css") {
  const { results } = await stylelint.lint({ code, codeFilename: resolve(repoRoot, file), configFile });
  return results[0]?.warnings ?? [];
}

describe("stylelint: logical properties only", () => {
  it.each([
    "a { margin-left: 1rem; }",
    "a { padding-right: 1rem; }",
    "a { left: 0; }",
    "a { border-right-width: 1px; }",
    "a { border-top-left-radius: 2px; }",
    "a { text-align: left; }",
    "a { float: right; }",
  ])("rejects %s", async (css) => {
    const warnings = await lintCss(css);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("accepts logical properties", async () => {
    const warnings = await lintCss(
      "a { margin-inline-start: 1rem; padding-inline-end: 1rem; inset-inline-start: 0; text-align: start; float: inline-end; border-start-start-radius: 2px; }",
    );
    expect(warnings).toEqual([]);
  });

  it("checks <style> blocks in .astro files", async () => {
    const warnings = await lintCss(
      "---\nconst x = 1;\n---\n<p>{x}</p>\n<style>\n  p { margin-right: 1rem; }\n</style>\n",
      "apps/quiet/src/pages/x.astro",
    );
    expect(warnings.length).toBeGreaterThan(0);
  });
});
