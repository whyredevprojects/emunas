/**
 * Static checks for the W4.2 features: the class list matches the stylesheet, every Yiddish string is
 * filled in, and no browse module imports a transcript path or a pipeline file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { browseEn, browseYi, type BrowseKey } from "../strings.ts";
import { BROWSE_CLASSES } from "../styles.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FEATURES = join(here, "../..");

function classesIn(file: string): string[] {
  const css = readFileSync(file, "utf8");
  return [...new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]!))].sort();
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "test" ? [] : sources(p);
    return /\.(ts|tsx)$/u.test(f) ? [p] : [];
  });
}

describe("browse features", () => {
  it("class list matches the stylesheet", () => {
    expect(classesIn(join(here, "../Browse.module.css"))).toEqual([...BROWSE_CLASSES].sort());
  });

  it("every string exists in both languages and is not empty", () => {
    for (const k of Object.keys(browseEn) as BrowseKey[]) {
      const yi = browseYi[k];
      const values = typeof yi === "string" ? [yi] : Object.values(yi);
      for (const v of values) expect(v.trim(), k).not.toBe("");
      // placeholders survive translation
      const ph = (m: unknown) => [...JSON.stringify(m).matchAll(/\{([a-z]+)\}/gu)].map((x) => x[1]).sort();
      expect(new Set(ph(yi)), k).toEqual(new Set(ph(browseEn[k])));
    }
  });

  it("shipped modules never reach transcripts or the pipeline's files", () => {
    const files = ["entities", "seforim", "maasios"].flatMap((d) => sources(join(FEATURES, d)));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/transcript|heardAs|asrNotes|input\.txt|audioKey/iu);
      expect(text, f).not.toMatch(/from "(\.\.\/)+(src|scripts|config)\//u);
      expect(text, f).not.toMatch(/node:fs/u);
    }
  });
});
