/**
 * Repository checks for the design shell: string tables agree, no quotation markup, no `/audio/`
 * route (Amendment A1), Stylelint (logical properties) clean, fonts in sync with @emunas/tokens.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { fontManifest } from "@emunas/tokens";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en.ts";
import { yi } from "../src/i18n/yi.ts";
import { quietFontsCss } from "../src/lib/fonts.ts";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(app, "src");
const repo = join(app, "..", "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const sourceFiles = walk(src).filter((f) => /\.(astro|ts|css)$/.test(f));

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("UI string tables", () => {
  it("have the same keys", () => {
    expect(Object.keys(yi).sort()).toEqual(Object.keys(en).sort());
  });

  it("have the same placeholders per key and no empty strings", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const e = en[key];
      const y = yi[key];
      expect(typeof e === "string" && typeof y === "string", key).toBe(true);
      expect(placeholders(String(y)), key).toEqual(placeholders(String(e)));
      expect(String(e).trim(), key).not.toBe("");
      expect(String(y).trim(), key).not.toBe("");
    }
  });

  it("Yiddish strings are in Hebrew script (except the English switch label)", () => {
    for (const [key, value] of Object.entries(yi)) {
      if (key === "edition.other") continue;
      expect(/[א-ת]/.test(String(value)), key).toBe(true);
    }
  });
});

describe("markup rules", () => {
  it("uses no quotation markup (concept-quiet §5.4: no blockquote, q or pull quotes)", () => {
    for (const f of sourceFiles) {
      const text = readFileSync(f, "utf8");
      expect(/<blockquote\b|<q[\s>]/i.test(text), relative(app, f)).toBe(false);
      // no stylesheet selector for quotation elements or quote marks (comments ignored)
      const css = f.endsWith(".css") ? text.replace(/\/\*[\s\S]*?\*\//g, "") : "";
      expect(/\bblockquote\b|(^|[\s,>+~])q\s*[{,:]|\bquotes\s*:/m.test(css), relative(app, f)).toBe(false);
    }
  });

  it("never builds a site /audio/ route (Amendment A1: audio comes from recording.audioUrl)", () => {
    for (const f of sourceFiles) {
      const text = readFileSync(f, "utf8").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
      expect(text.includes("/audio/") || /\baudioPath\(/.test(text), relative(app, f)).toBe(false);
    }
  });
});

describe("Stylelint (logical properties only)", () => {
  it("is clean on every stylesheet and .astro file of the app", async () => {
    const config = (await import("@emunas/config/stylelint")).default;
    const files = sourceFiles.filter((f) => /\.(css|astro)$/.test(f)).filter((f) => !f.endsWith("fonts.css"));
    expect(files.length).toBeGreaterThan(8);
    const result = await stylelint.lint({ files, config, configBasedir: repo });
    const problems = result.results.flatMap((r) => r.warnings.map((w) => `${relative(app, r.source ?? "")}:${w.line} ${w.text}`));
    expect(problems).toEqual([]);
  });

  it("actually rejects physical properties (guard against a silent config)", async () => {
    const config = (await import("@emunas/config/stylelint")).default;
    const result = await stylelint.lint({ code: ".x { margin-left: 1px; text-align: right; }", config });
    expect(result.results[0]!.warnings.length).toBe(2);
  });
});

describe("fonts", () => {
  const tokensRoot = dirname(createRequire(import.meta.url).resolve("@emunas/tokens/package.json"));

  it("public/fonts holds exactly the tokens subsets, byte for byte", () => {
    const files = readdirSync(join(app, "public", "fonts")).filter((f) => f.endsWith(".woff2")).sort();
    expect(files).toEqual(fontManifest.faces.map((f) => f.file).sort());
    for (const face of fontManifest.faces) {
      const bytes = readFileSync(join(app, "public", "fonts", face.file));
      expect(createHash("sha256").update(bytes).digest("hex"), face.file).toBe(face.sha256);
    }
    const licences = readdirSync(join(app, "public", "fonts", "licenses")).sort();
    expect(licences).toEqual(readdirSync(join(tokensRoot, "fonts", "licenses")).sort());
  });

  it("src/styles/fonts.css is the tokens fonts.css pointed at /fonts/ (run npm run fonts:sync)", () => {
    const expected = quietFontsCss(readFileSync(join(tokensRoot, "css", "fonts.css"), "utf8"));
    expect(readFileSync(join(src, "styles", "fonts.css"), "utf8")).toBe(expected);
  });
});
