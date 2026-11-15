/**
 * Package-level guarantees: browser-safe source, review status on every table, and seed
 * snapshots that carry only allow-listed derived values (never transcript-derived fields).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function files(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const TRANSCRIPT_DIR = ["data", "transcripts"].join("/");
const FORBIDDEN_FIELDS = ["heardAs", "asrNotes", "segments", "transcriptKey", "audioKey", "startSeg", "endSeg", "questionSegs", "answerSegs"];

describe("browser-safe source", () => {
  const src = files(join(pkgDir, "src"), ".ts");

  it("imports nothing from node or outside the package", () => {
    for (const f of src) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1] as string;
        expect(spec.startsWith("./") || spec.startsWith("../"), `${f}: ${spec}`).toBe(true);
        expect(spec.includes("node:"), `${f}: ${spec}`).toBe(false);
        expect(resolve(dirname(f), spec).startsWith(join(pkgDir, "src")), `${f}: ${spec}`).toBe(true);
      }
      expect(text.includes("process."), f).toBe(false);
    }
  });

  it("never mentions the transcript folder", () => {
    for (const f of [...src, ...files(join(pkgDir, "scripts"), ".ts")]) {
      expect(readFileSync(f, "utf8").includes(TRANSCRIPT_DIR), f).toBe(false);
    }
  });
});

describe("tables", () => {
  it("are all marked unreviewed", () => {
    const statuses = Object.entries(api).filter(([k]) => k.endsWith("ReviewStatus"));
    expect(statuses.length).toBeGreaterThanOrEqual(9);
    for (const [k, v] of statuses) expect(v, k).toBe("unreviewed");
  });
});

describe("seed snapshots", () => {
  const seeds = files(join(pkgDir, "seed"), ".json");

  it("exist for every table input", () => {
    const names = seeds.map((f) => f.slice(f.lastIndexOf("/") + 1)).sort();
    expect(names).toEqual(["concepts.json", "parsha.json", "people.json", "sefaria-refs.json", "works.json", "zman.json"]);
  });

  it("hold only {value, shiurim, count} rows and no transcript-derived field names", () => {
    for (const f of seeds) {
      const text = readFileSync(f, "utf8");
      for (const k of FORBIDDEN_FIELDS) expect(text.includes(`"${k}"`), `${f}: ${k}`).toBe(false);
      const parsed = JSON.parse(text) as { values: Record<string, unknown>[] };
      for (const row of parsed.values) expect(Object.keys(row).sort()).toEqual(["count", "shiurim", "value"]);
    }
  });
});
