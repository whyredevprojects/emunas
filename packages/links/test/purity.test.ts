import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** The package must stay pure and browser-safe (W1.8 brief). */
describe("browser safety", () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith(".ts"));

  it("has source files", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  for (const f of files) {
    it(`${f} uses no Node, DOM or environment globals and imports only package-local modules and @emunas/i18n`, () => {
      // Comments may mention globals (e.g. "pass process.env"); code may not.
      const text = readFileSync(join(SRC, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(text).not.toMatch(/from\s+["']node:/);
      expect(text).not.toMatch(/\b(?:process|window|document|globalThis|localStorage|location)\s*[.[]/);
      // @emunas/i18n (itself pure) is the one place the language set lives.
      for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) expect(m[1]).toMatch(/^(?:\.\/|@emunas\/i18n$)/);
    });
  }
});
