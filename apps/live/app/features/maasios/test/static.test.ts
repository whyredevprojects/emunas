/**
 * Static checks for the Maasios feature (C2.7): the class list matches the stylesheet, every Yiddish
 * string is filled in with the same placeholders, and no module reaches the pipeline's files or
 * anything recorded.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { maasiosEn, maasiosYi, type MaasiosKey } from "../strings.ts";
import { MAASIOS_CLASSES } from "../styles.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FEATURE = join(here, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "test" ? [] : sources(p);
    return /\.(ts|tsx)$/u.test(f) ? [p] : [];
  });
}

describe("maasios feature", () => {
  it("class list matches the stylesheet", () => {
    const css = readFileSync(join(FEATURE, "Maasios.module.css"), "utf8");
    const classes = [...new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]!))].sort();
    expect(classes).toEqual([...MAASIOS_CLASSES].sort());
  });

  it("every string exists in both languages, not empty, with the same placeholders", () => {
    const ph = (m: unknown) => [...JSON.stringify(m).matchAll(/\{([a-z]+)\}/gu)].map((x) => x[1]).sort();
    for (const k of Object.keys(maasiosEn) as MaasiosKey[]) {
      const yi = maasiosYi[k];
      for (const v of typeof yi === "string" ? [yi] : Object.values(yi)) expect(v.trim(), k).not.toBe("");
      expect(new Set(ph(yi)), k).toEqual(new Set(ph(maasiosEn[k])));
    }
  });

  it("shipped modules never reach recordings' text or the pipeline's files", () => {
    const files = sources(FEATURE);
    expect(files.length).toBeGreaterThan(6);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/transcript|heardAs|asrNotes|asrVariants|input\.txt|audioKey/iu);
      expect(text, f).not.toMatch(/from "(\.\.\/)+(src|scripts|config|data\/derived)\//u);
      expect(text, f).not.toMatch(/node:fs/u);
      // The library never loads the retired site-derived stories list.
      expect(text, f).not.toMatch(/loadStories\b|stories\.json/u);
    }
  });
});
