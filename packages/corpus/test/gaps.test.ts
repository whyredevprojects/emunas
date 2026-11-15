/**
 * Catalog gaps (W4.9; concept-quiet decision 3): guide rows without audio are listed in index.json
 * with catalog fields only, placed after the preceding in-scope shiur of their section.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { IngestOutput, Shiur } from "../../../src/types.ts";
import { buildCorpus, projectCorpus } from "../src/build/build.ts";
import { catalogGaps, gapReason, isCatalogGap } from "../src/build/gaps.ts";
import { identitySlugKeyer } from "../src/build/keyer.ts";
import { ReportCollector } from "../src/build/report.ts";
import type { CorpusIndex } from "../src/public/types.ts";
import { FORBIDDEN_KEYS, MINI_DATA, MINI_POLICY, REAL_DATA, REAL_POLICY, allKeys, readJson, tmp } from "./helpers.ts";

const BASE_CATALOG: Shiur["catalog"] = {
  source: "pocket-guide-2012",
  sectionId: "zmanim",
  sectionTitle: "זמנים",
  n: "1",
  page: 1,
  titleOriginal: "t",
  subTitle: null,
  derived: "catalog",
  note: "a catalog note",
};

const row = (over: Partial<Shiur> & { id: string }): Shiur => ({
  lang: "yi",
  category: "zman",
  seriesId: null,
  seriesOrder: null,
  catalog: BASE_CATALOG,
  parsha: null,
  zman: null,
  perek: null,
  hebrewYears: [],
  recordingIds: ["r"],
  inScope: true,
  outOfScopeReason: null,
  pathNotes: [],
  ...over,
});

describe("catalogGaps", () => {
  it("lists out-of-scope rows without audio, skips Purim rows and rows with recordings", () => {
    const rows: Shiur[] = [
      row({ id: "a" }),
      row({ id: "g1", inScope: false, recordingIds: [], outOfScopeReason: "not on disk (listed in the 2012 guide, no audio)" }),
      row({ id: "b" }),
      row({ id: "g2", inScope: false, recordingIds: [], outOfScopeReason: "audio not in R2 bucket" }),
      row({ id: "purim", category: "purim", inScope: false, recordingIds: [], outOfScopeReason: "gramen" }),
      row({ id: "seudah", category: "purim", inScope: false, outOfScopeReason: "Purim seudah (out of scope)" }),
      row({
        id: "g0",
        inScope: false,
        recordingIds: [],
        outOfScopeReason: "audio not in R2 bucket",
        catalog: { ...BASE_CATALOG, sectionId: "other" },
      }),
    ];
    const gaps = catalogGaps(rows, identitySlugKeyer, new ReportCollector());
    expect(gaps.map((g) => [g.id, g.after, g.reason, g.sectionKey])).toEqual([
      ["g1", "a", "not-on-disk", "pocket-guide-2012:zmanim"],
      ["g2", "b", "not-in-bucket", "pocket-guide-2012:zmanim"],
      ["g0", null, "not-in-bucket", "pocket-guide-2012:other"],
    ]);
    expect(isCatalogGap(rows[4]!)).toBe(false);
    expect(isCatalogGap(rows[5]!)).toBe(false);
    expect(gapReason(rows[1]!)).toBe("not-on-disk");
    // Catalog fields only: no note, no recordings.
    expect(JSON.stringify(gaps)).not.toContain("a catalog note");
    expect(Object.keys(gaps[0]!)).not.toContain("recordingIds");
  });
});

describe("index.json gaps", () => {
  it("mini corpus: both no-audio guide rows, in their sections, never as shiur files", () => {
    const out = join(tmp(), ".corpus");
    buildCorpus({ dataDir: MINI_DATA, outDir: out, policyDir: MINI_POLICY, dataSha: null });
    const index = readJson<CorpusIndex>(join(out, "index.json"));
    expect(index.gaps!.map((g) => g.id)).toEqual(["yi-zmanim-tv-bshbt-02", "en-zmanim-en-chnvkh-01"]);
    const ids = new Set(index.shiurim.map((r) => r.id));
    const keys = new Set(index.sections.map((s) => s.key));
    for (const g of index.gaps!) {
      expect(ids.has(g.id)).toBe(false);
      expect(keys.has(g.sectionKey)).toBe(true);
      expect(g.after === null || ids.has(g.after)).toBe(true);
      expect(g.reason).toBe("not-on-disk");
    }
    expect(index.gaps![0]!.zman?.raw).toBe('ט"ו בשבט');
    const text = readFileSync(join(out, "index.json"), "utf8");
    for (const k of allKeys(JSON.parse(text))) expect(FORBIDDEN_KEYS as readonly string[]).not.toContain(k);
  });

  it("real data: the guide rows with no audio (11 today: 3 not on disk, 8 not in the bucket)", () => {
    const ingest = readJson<IngestOutput>(join(REAL_DATA, "derived/ingest.json"));
    const expected = ingest.shiurim.filter((s) => !s.inScope && s.recordingIds.length === 0 && s.category !== "purim");
    const p = projectCorpus({ dataDir: REAL_DATA, policyDir: REAL_POLICY });
    expect(p.index.gaps!.map((g) => g.id)).toEqual(expected.map((s) => s.id));
    expect(p.index.gaps!.length).toBeGreaterThanOrEqual(11);
    const keys = new Set(p.index.sections.map((s) => s.key));
    for (const g of p.index.gaps!) expect(keys.has(g.sectionKey)).toBe(true);
  });
});
