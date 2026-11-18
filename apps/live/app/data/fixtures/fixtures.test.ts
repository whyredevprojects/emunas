/**
 * The committed fixture tree (`./data/**`) is the real W3.6 emitter's output (`data-build/emit.ts`,
 * with W4.4's lexical neighbours) over the `@emunas/corpus` mini corpus
 * (`packages/corpus/test/fixtures/mini`), so the fixtures follow the data contract exactly. This test
 * regenerates the tree in memory and fails when the committed files are stale. To rewrite them after
 * an intended change (to the emitter, the contract or the mini corpus):
 *
 *   UPDATE_LIVE_FIXTURES=1 npx vitest run app/data/fixtures   # from apps/live
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCorpusInput } from "../../../data-build/corpus-input.ts";
import { emitLiveData, type EmittedFiles } from "../../../data-build/emit.ts";
import { buildNeighbors } from "../../../data-build/neighbors.ts";
import { validateFile } from "../../../data-build/schemas.ts";
import { MINI_DATA, MINI_POLICY, buildCorpusTo } from "../../../data-build/test-helpers.ts";
import type { FacetsFile, ShiurFile, TodayFile } from "../types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "data");

/** Fixed inputs, so the tree only changes when the emitter, the contract or the mini corpus does. */
export const FIXTURE_OPTIONS = {
  generatedAt: "2026-11-15T00:00:00.000Z",
  mediaOrigin: "https://media.example.invalid",
} as const;

/** corpus:build (with the W2.1 aggregates) over the mini corpus, then the Live emit. */
async function generate(): Promise<EmittedFiles> {
  const corpusDir = buildCorpusTo(MINI_DATA, MINI_POLICY, { mediaOrigin: FIXTURE_OPTIONS.mediaOrigin });
  const input = readCorpusInput(corpusDir);
  const neighbors = await buildNeighbors(input.shiurim, { mode: "lexical", workers: 1 });
  return emitLiveData(input, { generatedAt: FIXTURE_OPTIONS.generatedAt, neighbors });
}

function listFiles(dir: string, prefix = ""): string[] {
  let out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out = out.concat(listFiles(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

const serialize = (v: unknown): string => `${JSON.stringify(v, null, 1)}\n`;

describe("live data fixtures", async () => {
  const generated = await generate();

  if (process.env["UPDATE_LIVE_FIXTURES"] === "1") {
    rmSync(outDir, { recursive: true, force: true });
    for (const [file, body] of generated) {
      const path = join(outDir, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, serialize(body));
    }
  }

  it("every file passes the emitter's strict contract schemas", () => {
    for (const [file, body] of generated) expect(validateFile(file, body), file).toBeNull();
  });

  it("covers both statuses, both languages, a multi-recording shiur, a series part and neighbours", () => {
    const shiurim = [...generated].filter(([f]) => f.startsWith("shiur/")).map(([, b]) => b as ShiurFile);
    expect(shiurim.length).toBeGreaterThanOrEqual(30);
    expect(new Set(shiurim.map((s) => s.status))).toEqual(new Set(["full", "catalog-only"]));
    expect(new Set(shiurim.map((s) => s.lang))).toEqual(new Set(["en", "yi"]));
    expect(shiurim.some((s) => s.recordings.length > 1)).toBe(true);
    expect(shiurim.some((s) => s.series !== null)).toBe(true);
    expect(shiurim.some((s) => s.related.neighbors.length > 0)).toBe(true);
    // The ids the UI tests use.
    for (const id of ["yi-parshas-hashavua-brshys-01", "en-parsha-en-nch-01", "yi-zmanim-tv-bb-04", "yi-tanya-1-01"]) {
      expect(generated.has(`shiur/${id}.json`), id).toBe(true);
    }
  });

  it("committed fixture files equal the regenerated ones", () => {
    const committed = listFiles(outDir);
    expect(committed).toEqual([...generated.keys()].sort());
    for (const [file, body] of generated) {
      expect(readFileSync(join(outDir, file), "utf8"), file).toBe(serialize(body));
    }
  });

  it("keys occasions the way the real build does (normalize keys, never raw Hebrew)", () => {
    const today = generated.get("today.en.json") as TodayFile;
    const facets = generated.get("facets.json") as FacetsFile;
    const keys = [...Object.keys(today.occasions), ...Object.keys(facets.occasion)];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k, k).toMatch(/^[a-z0-9-]+$/);
    expect(Object.keys(today.occasions)).toEqual(expect.arrayContaining(["noach", "bereishis", "elul"]));
  });

  it("media URLs point at the placeholder host", () => {
    for (const [file, body] of generated) {
      if (!file.startsWith("shiur/")) continue;
      for (const r of (body as ShiurFile).recordings) {
        if (r.audioUrl !== null) expect(r.audioUrl.startsWith(`${FIXTURE_OPTIONS.mediaOrigin}/`)).toBe(true);
      }
    }
  });

  it("is deterministic", async () => {
    const again = await generate();
    expect([...again.keys()].sort()).toEqual([...generated.keys()].sort());
    for (const [k, v] of generated) expect(serialize(again.get(k))).toBe(serialize(v));
  });
});
