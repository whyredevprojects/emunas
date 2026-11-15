/**
 * The Live data emit on the @emunas/corpus mini corpus: every file validates against its contract
 * schema, the tree is complete and consistent, the quick index works, nothing forbidden ships, and
 * the output is deterministic.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";
import { LeakScanner } from "@emunas/corpus-guard";
import { normalizeQuery } from "@emunas/search-core";
import type {
  BuildFile,
  CorpusFile,
  EntityFile,
  FacetsFile,
  QuickIndexFile,
  SeriesFile,
  ShiurFile,
  StoriesFile,
  TodayFile,
  WorkFile,
  WorksFile,
  WriteupFile,
} from "../app/data/types.ts";
import { MOMENT_SHARD_SIZE } from "../app/data/types.ts";
import { readCorpusInput } from "./corpus-input.ts";
import { EMIT_LIMITS, emitLiveData, type EmittedFiles } from "./emit.ts";
import { kindOfFile, validateFile } from "./schemas.ts";
import { GENERATED_AT, MINI_DATA, MINI_POLICY, allKeys, buildCorpusTo, tmp } from "./test-helpers.ts";
import { serialize, writeDataDir } from "./write.ts";

const corpusDir = buildCorpusTo(MINI_DATA, MINI_POLICY);
const input = readCorpusInput(corpusDir);
const files = emitLiveData(input, { generatedAt: GENERATED_AT });
const get = <T>(f: string): T => {
  const x = files.get(f);
  if (x === undefined) throw new Error(`not emitted: ${f}`);
  return x as T;
};

// Built from parts so this file does not itself contain the literals the repo guard greps for.
const FORBIDDEN_KEYS = [
  "heardAs",
  "asrNotes",
  "segs",
  "startSeg",
  "endSeg",
  "questionSegs",
  "answerSegs",
  "segments",
  "transcriptKey",
  "audioKey",
  "asrModel",
  "model",
  "variant",
  "candidateTopics",
  "retelling_x",
];
const FORBIDDEN_SUBSTRINGS = [
  ["transcripts", "/"].join(""),
  ["input", ".txt"].join(""),
  ".vtt",
  ["audit", "s/"].join(""),
];

describe("emitLiveData on the mini corpus", () => {
  it("every emitted file has a contract path and validates against its schema", () => {
    expect(files.size).toBeGreaterThan(100);
    const invalid = [...files].flatMap(([f, body]) => validateFile(f, body) ?? []);
    expect(invalid).toEqual([]);
    for (const f of files.keys()) expect(kindOfFile(f), f).not.toBeNull();
  });

  it("emits one shiur file per shiur and write-ups only for full shiurim", () => {
    const corpus = get<CorpusFile>("corpus.json");
    expect(corpus.shiurim.map((r) => r.id)).toEqual(input.index.shiurim.map((r) => r.id));
    expect(corpus.counts).toEqual(input.info.counts);
    for (const s of input.shiurim) {
      const f = get<ShiurFile>(`shiur/${s.id}.json`);
      expect(f.rev).toBe(s.rev);
      expect(f.recordings).toEqual(s.recordings);
      expect(f).not.toHaveProperty("writeup");
      if (s.status === "full") {
        expect(f.notes?.writeupLangs).toEqual(["en", "yi"]);
        expect(f.notes).not.toHaveProperty("writeup");
        for (const l of ["en", "yi"] as const) {
          const w = get<WriteupFile>(`writeup/${s.id}.${l}.json`);
          expect(w.rev).toBe(s.rev);
          expect(w.blocks).toEqual(s.notes!.writeup[l]);
        }
      } else {
        expect(f.notes).toBeUndefined();
        expect(files.has(`writeup/${s.id}.en.json`)).toBe(false);
        expect(files.has(`writeup/${s.id}.yi.json`)).toBe(false);
      }
    }
    expect([...files.keys()].filter((f) => f.startsWith("shiur/"))).toHaveLength(input.shiurim.length);
  });

  it("related: same occasion and prev/next come from the W2.1 neighbours", () => {
    for (const s of input.shiurim) {
      const f = get<ShiurFile>(`shiur/${s.id}.json`);
      const nb = input.aggregates.neighbours[s.id]!;
      expect(f.related.sameOccasion).toEqual(nb.sameOccasion);
      const nav = nb.series ?? nb.section;
      expect([f.related.prev, f.related.next]).toEqual([nav.prev, nav.next]);
    }
  });

  it("facets label every key used in corpus.json and count rows", () => {
    const corpus = get<CorpusFile>("corpus.json");
    const facets = get<FacetsFile>("facets.json");
    for (const r of corpus.shiurim) {
      for (const k of r.entities.works) expect(facets.work[k], k).toBeDefined();
      for (const k of r.entities.people) expect(facets.person[k], k).toBeDefined();
      for (const k of r.entities.concepts) expect(facets.concept[k], k).toBeDefined();
      for (const k of [r.parsha, r.zman]) if (k !== null) expect(facets.occasion[k], k).toBeDefined();
      for (const y of r.years) expect(facets.year[String(y)]).toBeDefined();
      if (r.series) expect(facets.series[r.series.id]).toBeDefined();
    }
    const total = Object.values(facets.lang).reduce((a, b) => a + b.count, 0);
    expect(total).toBe(corpus.shiurim.length);
    const cats = Object.values(facets.category).reduce((a, b) => a + (b?.count ?? 0), 0);
    expect(cats).toBe(corpus.shiurim.length);
    for (const [k, v] of Object.entries(facets.person)) {
      expect(v.count, k).toBe(corpus.shiurim.filter((r) => r.entities.people.includes(k)).length);
    }
  });

  it("entity files exist exactly for entities with at least two shiurim, with consistent contents", () => {
    const entityFiles = [...files.keys()].filter((f) => f.startsWith("entity/"));
    expect(entityFiles.length).toBeGreaterThan(0);
    for (const f of entityFiles) {
      const e = get<EntityFile>(f);
      expect(f).toBe(`entity/${e.kind}/${e.key}.json`);
      expect(e.shiurIds.length).toBeGreaterThanOrEqual(EMIT_LIMITS.entityFileMin);
      expect(new Set(e.shiurIds).size).toBe(e.shiurIds.length);
      for (const m of e.moments) {
        expect(e.shiurIds).toContain(m.shiurId);
        expect(m.id.startsWith(`${m.shiurId}~`)).toBe(true);
      }
      for (const r of e.related) {
        expect(r.shared).toBeGreaterThanOrEqual(EMIT_LIMITS.relatedMinShared);
        expect(files.has(`entity/${r.kind}/${r.key}.json`)).toBe(true);
      }
      const years = Object.values(e.years).reduce((a, b) => a + b, 0);
      expect(years).toBeGreaterThanOrEqual(e.shiurIds.length);
    }
    // People with ≥2 shiurim in people.json all have a file; people with one do not.
    for (const p of input.aggregates.people.people) {
      expect(files.has(`entity/p/${p.key}.json`), p.key).toBe(p.shiurim.length >= EMIT_LIMITS.entityFileMin);
    }
    // Every browse concept in corpus.json has a page.
    for (const r of get<CorpusFile>("corpus.json").shiurim) {
      for (const k of r.entities.concepts) expect(files.has(`entity/c/${k}.json`), k).toBe(true);
    }
  });

  it("today.json lists the occasions with year-ordered shiurim and timed moment pools", () => {
    const today = get<TodayFile>("today.json");
    expect(Object.keys(today.occasions).length).toBeGreaterThan(5);
    for (const [k, o] of Object.entries(today.occasions)) {
      expect(o.shiurIds.length, k).toBeGreaterThan(0);
      const ys = o.shiurIds.map((id) => input.shiurim.find((s) => s.id === id)!.years[0] ?? Infinity);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
      expect(o.moments.length).toBeLessThanOrEqual(EMIT_LIMITS.todayPoolPerOccasion);
      for (const m of o.moments) {
        expect(["i", "st", "q"]).toContain(m.kind);
        expect(m.t).not.toBeNull();
        expect(o.shiurIds).toContain(m.shiurId);
      }
    }
    // Newly summarized: manifest updatedAt (carried in .corpus/updated.json), newest first, full only.
    const ns = today.newlySummarized;
    expect(ns.length).toBeGreaterThan(0);
    expect(ns[0]).toEqual({ shiurId: expect.any(String), updatedAt: "2026-11-15T04:40:14.798Z" });
    expect([...ns].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))).toEqual(ns);
    for (const n of ns) expect(input.shiurim.find((s) => s.id === n.shiurId)?.status).toBe("full");
  });

  it("series, works and stories follow the aggregates", () => {
    for (const x of input.aggregates.series.series.filter((s) => s.parts.length > 0)) {
      const f = get<SeriesFile>(`series/${x.id}.json`);
      expect(f.parts.map((p) => p.shiurId)).toEqual(x.parts.map((p) => p.id));
      expect(f.sibling).toBe(x.sibling);
    }
    const works = get<WorksFile>("works.json");
    const genre = new Set(input.aggregates.works.works.filter((w) => w.genre).map((w) => w.key));
    for (const w of works.works) expect(genre.has(w.key)).toBe(false);
    for (const w of input.aggregates.works.works.filter((x) => x.shiurCount > 0)) {
      const f = get<WorkFile>(`work/${w.key}.json`);
      expect(f.locations.map((l) => l.sefariaRef)).toEqual(w.refs.map((r) => r.ref));
      const cites = f.locations.reduce((a, l) => a + l.citations.length, 0) + f.unlocated.length;
      expect(cites).toBe(w.refs.reduce((a, r) => a + r.mentions.length, 0) + w.unlocated.length);
    }
    const stories = get<StoriesFile>("stories.json");
    expect(stories.stories.map((s) => s.id)).toEqual(input.aggregates.stories.stories.map((s) => s.id));
    expect(allKeys(stories).has("retelling")).toBe(false);
  });

  it("moment shards cover every timed item once, in both languages, and build.json counts them", () => {
    const build = get<BuildFile>("build.json");
    expect(build.generatedAt).toBe(GENERATED_AT);
    expect(build.counts).toEqual(input.info.counts);
    expect(build.corpusSchemaVersion).toBe(input.info.schemaVersion);
    expect(get<CorpusFile>("corpus.json").buildId).toBe(build.buildId);
    for (const l of ["en", "yi"] as const) {
      const n = build.momentShards[l];
      const rows = Array.from(
        { length: n },
        (_, i) => get<{ moments: { id: string }[] }>(`moments/${l}-${i}.json`).moments,
      ).flat();
      expect(files.has(`moments/${l}-${n}.json`)).toBe(false);
      expect(rows.length).toBeLessThanOrEqual(n * MOMENT_SHARD_SIZE);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      const expected = input.shiurim.reduce((a, s) => {
        const x = s.notes;
        if (!x) return a;
        return (
          a +
          x.chapters.length +
          x.summary.keyPoints.length +
          x.insights.length +
          x.questions.length +
          x.stories.length +
          x.takeaways.length
        );
      }, 0);
      expect(rows.length).toBe(expected);
    }
  });

  it("the quick index loads in MiniSearch and finds shiurim with search-core query folding", () => {
    const q = get<QuickIndexFile>("quick-index.en.json");
    const ms = MiniSearch.loadJSON(JSON.stringify(q.index), q.options);
    expect(ms.documentCount).toBe(input.shiurim.length);
    const hits = (query: string) => ms.search(normalizeQuery(query).tokens.join(" ")).map((r) => r.id);
    // Occasion labels: transliteration and Hebrew spelling find the same shiurim.
    const elul = hits("Elul");
    expect(elul).toContain("yi-zmanim-lvl-01");
    expect(hits("אֱלוּל").sort()).toEqual([...elul].sort());
    // English one-liner words are indexed in the en index.
    const s = input.shiurim.find((x) => x.status === "full" && x.id.startsWith("en-"))!;
    const word = s.notes!.summary.oneLiner.en.split(/\s+/).find((w) => w.replace(/\W/g, "").length > 6)!;
    expect(hits(word)).toContain(s.id);
    // A stored catalog title for display.
    const r = ms.search(normalizeQuery("Elul").tokens.join(" "))[0]!;
    expect(typeof r["name"]).toBe("string");
    // candidateTopics never reach it: the serialized index has no keyword field.
    expect(q.options.fields).not.toContain("keywords");
  });

  it("contains no forbidden key or substring (structural check and corpus-guard scanner)", () => {
    for (const [f, body] of files) {
      const keys = allKeys(body);
      for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `${f}: ${k}`).toBe(false);
      const text = serialize(body);
      for (const s of FORBIDDEN_SUBSTRINGS) expect(text.includes(s), `${f}: ${s}`).toBe(false);
    }
    const out = join(tmp(), "data");
    writeDataDir(out, files);
    const scanner = new LeakScanner({ baseDir: out });
    scanner.scanPaths([out]);
    expect(scanner.result().findings).toEqual([]);
  });

  it("is deterministic", () => {
    const again = emitLiveData(readCorpusInput(corpusDir), { generatedAt: GENERATED_AT });
    expect([...again.keys()].sort()).toEqual([...files.keys()].sort());
    for (const [k, v] of files) expect(serialize(again.get(k)), k).toBe(serialize(v));
  });
});

describe("validateFile", () => {
  const shiurFile = [...files.keys()].find(
    (f) => f.startsWith("shiur/") && (files.get(f) as ShiurFile).status === "full",
  )!;
  const clone = <T>(x: unknown): T => JSON.parse(serialize(x)) as T;

  it("rejects an unknown key anywhere (a field the contract does not publish)", () => {
    const body = clone<ShiurFile & { notes: { chapters: Record<string, unknown>[] } }>(files.get(shiurFile));
    body.notes.chapters[0]!["heardAs"] = "x";
    const r = validateFile(shiurFile, body);
    expect(r?.issues[0]?.path).toBe("notes.chapters.0.heardAs");
    expect(JSON.stringify(r)).not.toContain('"x"');
  });

  it("rejects a wrong type, a wrong schema version and an unknown path", () => {
    const body = clone<Record<string, unknown>>(files.get(shiurFile));
    expect(validateFile(shiurFile, { ...body, duration: "long" })).not.toBeNull();
    expect(validateFile(shiurFile, { ...body, schemaVersion: 99 })).not.toBeNull();
    expect(validateFile("shiur/x/y.json", body)?.issues[0]?.message).toBe("unknown data file path");
    const rec = clone<ShiurFile>(body);
    (rec.recordings[0] as { audioUrl: unknown }).audioUrl = "not a url";
    expect(validateFile(shiurFile, rec)).not.toBeNull();
  });

  it("accepts the committed W2.4 fixtures (the emitter and the fixtures share one contract)", () => {
    const dir = join(import.meta.dirname, "../app/data/fixtures/data");
    const fixtureFiles: EmittedFiles = new Map();
    for (const f of ["corpus.json", "facets.json", "today.json", "stories.json", "works.json", "build.json"]) {
      fixtureFiles.set(f, JSON.parse(readFileSync(join(dir, f), "utf8")) as never);
    }
    for (const [f, body] of fixtureFiles) expect(validateFile(f, body), f).toBeNull();
  });
});
