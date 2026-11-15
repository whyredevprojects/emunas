/**
 * The Live data contract against its fixtures: every fixture file loads through the typed loaders,
 * carries the expected top-level fields, and contains none of the forbidden (transcript/ASR/internal)
 * keys or substrings (integration-plan §0, §5.2, §5.3).
 */
import type { PublicRecording, PublicShiur } from "@emunas/corpus/public";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  DataError,
  clearDataCache,
  configureData,
  dataPaths,
  fetchData,
  loadBuild,
  loadCorpus,
  loadEntity,
  loadFacets,
  loadMomentShard,
  loadQuickIndex,
  loadSeries,
  loadShiur,
  loadStories,
  loadToday,
  loadWork,
  loadWorks,
  loadWriteup,
  notFoundToNull,
  resetDataConfig,
  LIVE_DATA_SCHEMA_VERSION,
  type DataFiles,
  type LiveRecording,
  type ShiurFile,
} from "./index.ts";
import { fixtureFetch, fixtureFileNames } from "./fixtures/fetch.ts";

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
];
// Built from parts so this file does not itself contain the literals the repo guard greps for.
const FORBIDDEN_SUBSTRINGS = [
  ["transcripts", "/"].join(""),
  ["input", ".txt"].join(""),
  ".vtt",
  ["audit", "s/"].join(""),
];

function walkKeys(v: unknown, out: Set<string>): void {
  if (Array.isArray(v)) for (const x of v) walkKeys(x, out);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      walkKeys(x, out);
    }
  }
}

/** Required top-level fields per file kind, checked against the types at compile time. */
const REQUIRED: { [K in keyof DataFiles]: readonly (keyof DataFiles[K])[] } = {
  build: ["schemaVersion", "corpusSchemaVersion", "buildId", "dataSha", "generatedAt", "counts", "momentShards"],
  corpus: ["schemaVersion", "buildId", "counts", "shiurim"],
  facets: ["schemaVersion", "category", "lang", "occasion", "year", "series", "work", "person", "concept"],
  today: ["schemaVersion", "occasions", "newlySummarized"],
  shiur: ["schemaVersion", "id", "rev", "lang", "category", "catalog", "recordings", "status", "related", "duration"],
  writeup: ["schemaVersion", "shiurId", "rev", "lang", "blocks"],
  series: ["schemaVersion", "id", "title", "lang", "sibling", "parts", "perekGroups"],
  works: ["schemaVersion", "works"],
  work: ["schemaVersion", "key", "name", "label", "locations", "unlocated"],
  entity: ["schemaVersion", "kind", "key", "label", "shiurIds", "years", "moments", "related"],
  stories: ["schemaVersion", "stories"],
  moments: ["schemaVersion", "lang", "shard", "moments"],
  quickIndex: ["schemaVersion", "lang", "options", "index"],
};

function kindOf(file: string): keyof DataFiles {
  if (file === "build.json") return "build";
  if (file === "corpus.json") return "corpus";
  if (file === "facets.json") return "facets";
  if (file === "today.json") return "today";
  if (file === "works.json") return "works";
  if (file === "stories.json") return "stories";
  if (file.startsWith("quick-index.")) return "quickIndex";
  const dir = file.split("/")[0];
  switch (dir) {
    case "shiur":
    case "writeup":
    case "series":
    case "work":
    case "entity":
    case "moments":
      return dir;
  }
  throw new Error(`unknown fixture file ${file}`);
}

describe("data contract", () => {
  beforeEach(() => configureData({ fetch: fixtureFetch }));
  afterEach(() => resetDataConfig());

  it("types are built on @emunas/corpus/public", () => {
    expectTypeOf<ShiurFile["catalog"]>().toEqualTypeOf<PublicShiur["catalog"]>();
    expectTypeOf<ShiurFile["status"]>().toEqualTypeOf<PublicShiur["status"]>();
    expectTypeOf<LiveRecording["offset"]>().toEqualTypeOf<PublicRecording["offset"]>();
    expectTypeOf<LiveRecording["audioUrl"]>().toEqualTypeOf<string | null>();
    expectTypeOf<LiveRecording>().not.toHaveProperty("audio");
    expectTypeOf<NonNullable<ShiurFile["notes"]>>().not.toHaveProperty("writeup");
  });

  it("every fixture file loads, has its fields and no forbidden keys or substrings", async () => {
    const names = fixtureFileNames();
    expect(names.length).toBeGreaterThan(20);
    for (const file of names) {
      const body = await fetchData<Record<string, unknown>>(`/data/${file}`);
      expect(body["schemaVersion"], file).toBe(LIVE_DATA_SCHEMA_VERSION);
      for (const k of REQUIRED[kindOf(file)]) expect(body, `${file} lacks ${String(k)}`).toHaveProperty(String(k));
      const keys = new Set<string>();
      walkKeys(body, keys);
      for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `${file} has key ${k}`).toBe(false);
      const text = JSON.stringify(body);
      for (const s of FORBIDDEN_SUBSTRINGS) expect(text.includes(s), `${file} contains ${s}`).toBe(false);
    }
  });

  it("typed loaders return the files", async () => {
    const build = await loadBuild();
    const corpus = await loadCorpus();
    expect(corpus.shiurim.length).toBe(build.counts.total);
    expect(corpus.counts).toEqual(build.counts);

    const full = corpus.shiurim.find((r) => r.status === "full" && r.id === "yi-zmanim-tv-bb-04")!;
    const shiur = await loadShiur(full.id);
    expect(shiur.recordings).toHaveLength(2);
    for (const r of shiur.recordings) expect(r.audioUrl).toMatch(/^https:\/\/media\.example\.invalid\/.+\.mp3$/);
    expect(shiur.recordings[1]!.offset).toBe(shiur.recordings[0]!.duration);
    expect(shiur.notes?.writeupLangs).toEqual(["en", "yi"]);
    const w = await loadWriteup(full.id, "yi");
    expect(w.rev).toBe(shiur.rev);
    expect(w.blocks.length).toBeGreaterThan(0);

    const catOnly = await loadShiur("yi-tanya-1-01");
    expect(catOnly.status).toBe("catalog-only");
    expect(catOnly.notes).toBeUndefined();
    expect(catOnly.recordings[0]!.audioUrl).not.toBeNull();

    const facets = await loadFacets();
    expect(Object.keys(facets.occasion).length).toBeGreaterThan(0);
    const today = await loadToday();
    for (const key of Object.keys(today.occasions)) {
      const e = await loadEntity("o", key);
      expect(e.shiurIds).toEqual(today.occasions[key]!.shiurIds);
    }
    const series = await loadSeries("tanya-yi");
    expect(series.parts[0]!.shiurId).toBe("yi-tanya-1-01");
    expect(series.perekGroups[0]).toEqual({ perek: "א", shiurIds: ["yi-tanya-1-01"] });

    const works = await loadWorks();
    const first = works.works[0]!;
    const work = await loadWork(first.key);
    expect(work.locations.length + work.unlocated.length).toBe(first.mentions);

    const person = Object.keys(facets.person)[0]!;
    expect((await loadEntity("p", person)).kind).toBe("p");
    const concept = Object.keys(facets.concept).find((k) => /[א-ת]/u.test(k))!;
    expect((await loadEntity("c", concept)).key).toBe(concept);

    expect((await loadStories()).stories.length).toBeGreaterThan(0);
    for (const lang of ["en", "yi"] as const) {
      for (let i = 0; i < build.momentShards[lang]; i++) {
        const shard = await loadMomentShard(lang, i);
        expect(shard.lang).toBe(lang);
        expect(shard.moments.length).toBeGreaterThan(0);
      }
      expect((await loadQuickIndex(lang)).lang).toBe(lang);
    }
  });

  it("maps a missing file to a 404 DataError, and notFoundToNull to null", async () => {
    await expect(loadShiur("no-such-shiur")).rejects.toMatchObject({ name: "DataError", status: 404 });
    expect(await notFoundToNull(loadShiur("no-such-shiur"))).toBeNull();
  });

  it("rejects a schema version mismatch and invalid JSON", async () => {
    configureData({
      fetch: async (url) =>
        url.endsWith("corpus.json")
          ? new Response(JSON.stringify({ schemaVersion: 999 }), { status: 200 })
          : new Response("{oops", { status: 200 }),
    });
    await expect(loadCorpus()).rejects.toBeInstanceOf(DataError);
    await expect(loadFacets()).rejects.toThrow(/invalid JSON/);
  });

  it("shares in-flight requests and memoizes shared files, but not failures", async () => {
    let calls = 0;
    let fail = true;
    configureData({
      fetch: async (url, init) => {
        calls++;
        if (fail) return new Response("", { status: 503 });
        return fixtureFetch(url, init);
      },
    });
    await expect(loadCorpus()).rejects.toMatchObject({ status: 503 });
    fail = false;
    const [a, b] = await Promise.all([loadCorpus(), loadCorpus()]);
    expect(a).toBe(b);
    await loadCorpus();
    expect(calls).toBe(2);
    clearDataCache();
    await loadCorpus();
    expect(calls).toBe(3);
  });

  it("builds paths with one encoded segment per id and refuses traversal", () => {
    expect(dataPaths.shiur("yi-tanya-1-01")).toBe("/data/shiur/yi-tanya-1-01.json");
    expect(dataPaths.writeup("x", "yi")).toBe("/data/writeup/x.yi.json");
    expect(dataPaths.entity("c", "תורה-לשמה")).toBe(`/data/entity/c/${encodeURIComponent("תורה-לשמה")}.json`);
    expect(dataPaths.moments("en", 3)).toBe("/data/moments/en-3.json");
    expect(() => dataPaths.shiur("../build")).toThrow();
    expect(() => dataPaths.shiur("a/b")).toThrow();
    expect(() => dataPaths.shiur("")).toThrow();
    expect(() => dataPaths.moments("en", -1)).toThrow();
    expect(() => dataPaths.entity("x" as "p", "k")).toThrow();
  });
});
