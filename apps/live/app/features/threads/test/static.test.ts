/**
 * Static checks for the thread feature (C3.3): the class list matches the stylesheet, every Yiddish
 * string is filled in with the same placeholders, and no module reaches recordings' text, the
 * pipeline's files, or a corpus-wide file (a thread page loads its own file only).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { threadsEn, threadsYi, type ThreadsKey } from "../strings.ts";
import { THREADS_CLASSES } from "../styles.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FEATURE = join(here, "..");
const ROUTE = join(here, "../../../routes/th.$threadId.tsx");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "test" ? [] : sources(p);
    return /\.(ts|tsx)$/u.test(f) ? [p] : [];
  });
}

describe("threads feature", () => {
  it("class list matches the stylesheet", () => {
    const css = readFileSync(join(FEATURE, "Threads.module.css"), "utf8");
    const classes = [...new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]!))].sort();
    expect(classes).toEqual([...THREADS_CLASSES].sort());
  });

  it("every string exists in both languages, not empty, with the same placeholders", () => {
    const ph = (m: unknown) => [...JSON.stringify(m).matchAll(/\{([a-z]+)\}/gu)].map((x) => x[1]).sort();
    for (const k of Object.keys(threadsEn) as ThreadsKey[]) {
      const yi = threadsYi[k];
      for (const v of typeof yi === "string" ? [yi] : Object.values(yi)) expect(v.trim(), k).not.toBe("");
      expect(new Set(ph(yi)), k).toEqual(new Set(ph(threadsEn[k])));
    }
  });

  it("shipped modules never reach recordings' text, the pipeline's files or a corpus-wide file", () => {
    const files = [...sources(FEATURE), ROUTE];
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/transcript|heardAs|asrNotes|asrVariants|input\.txt|audioKey|corpus\/raw/iu);
      expect(text, f).not.toMatch(/from "(\.\.\/)+(src|scripts|config|data\/derived)\//u);
      expect(text, f).not.toMatch(/node:fs/u);
      // One file per page: no corpus-wide or index files.
      expect(text, f).not.toMatch(/loadCorpus\b|loadFacets\b|loadTopics\b|loadStoriesIndex\b|loadGlossaryShard\b|loadExploreEntities\b|teaching-clusters/u);
    }
  });
});
