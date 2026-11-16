/**
 * Loose schemas and the failure policy of the corpus-layer input (corpus-wave-plan §3.1).
 */
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FatalDataError } from "../../../src/build/load.ts";
import { createDataReader } from "../../../src/build/read.ts";
import { KNOWN_CORPUS_VERSIONS, isForbiddenInputKey, readCorpusInput, type CorpusInputResult } from "../../../src/layer/input/load.ts";
import { DEFAULT_CORPUS_POLICY, type CorpusPolicy } from "../../../src/layer/policy.ts";
import { MINI_CORPUS_SYNTHETIC, POISON_CANARY, readMiniCorpusPicks } from "../../../scripts/make-mini-corpus.ts";
import { MINI_DATA, editJson, miniCopy, readJson } from "../../helpers.ts";

type Json = Record<string, unknown>;
const CORPUS = "derived/corpus";
const S = MINI_CORPUS_SYNTHETIC;

function read(dataDir: string, policy: Pick<CorpusPolicy, "unknownVersion"> = DEFAULT_CORPUS_POLICY): CorpusInputResult {
  return readCorpusInput(createDataReader(dataDir), { policy });
}
function corpusFile(dataDir: string, rel: string): string {
  return join(dataDir, CORPUS, rel);
}

describe("mini fixture read", () => {
  const { input, report } = read(MINI_DATA);
  const picks = readMiniCorpusPicks();

  it("reads every public file and every listed series and shiur-tags file", () => {
    expect(report.read).toEqual([
      "index.json",
      "topics.json",
      "concepts.json",
      "people.json",
      "works.json",
      "stories.json",
      "teaching-clusters.json",
      "redirects.json",
    ]);
    const idx = readJson<{ files: string[]; shiurIds: string[] }>(corpusFile(MINI_DATA, "index.json"));
    expect(report.seriesRead).toBe(idx.files.filter((f) => f.startsWith("series/")).length);
    expect(input.shiurTags.size).toBe(idx.shiurIds.length);
    expect(report.disabled).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("ignores unknown fields and never copies them", () => {
    const t = input.topics[S.unknownFieldTopicIndex]!;
    expect(t).not.toHaveProperty(S.unknownField);
    expect(t).not.toHaveProperty("shiurCount");
  });

  it("drops asrVariants / heardAs* keys on read and counts them", () => {
    expect(report.droppedKeys).toEqual({ "concepts.json": { asrVariants: 1 }, "works.json": { heardAsSamples: 1 } });
    const all = JSON.stringify({ ...input, series: [...input.series], shiurTags: [...input.shiurTags] });
    expect(all).not.toContain(POISON_CANARY);
    expect(all).not.toMatch(/"asrVariants"|"heardAs/);
  });

  it("lists unknown index files by name as not read; denied names are only counted", () => {
    expect(report.notRead).toEqual([S.unknownFile]);
    expect(report.notReadDenied).toBe(1); // search/sections.jsonl
  });

  it("reads the optional fields when present", () => {
    expect(input!.topics.filter((t) => t.sameAs).length).toBeGreaterThan(0);
    expect(input!.works.find((w) => w.id === picks.unknownKindWorkId)?.kind).toBe("sefer");
    expect(report.coercedWorkKinds).toEqual([{ id: picks.unknownKindWorkId, kind: "future-kind" }]);
    expect(input!.works.find((w) => w.id === picks.childWorkId)?.parentWorkId).toEqual(expect.any(String));
    expect(input!.works.filter((w) => w.order !== null).length).toBeGreaterThan(0);
    expect(input!.stories!.find((s) => s.id === picks.attributionVariesStoryId)?.attributionVaries).toBe(true);
    expect(input!.people.find((p) => p.id === S.individualId)).toMatchObject({ type: "individual", description: { en: expect.any(String) } });
    expect(input!.topics.some((t) => t.parsha.length > 0) && input!.topics.some((t) => t.zman.length > 0)).toBe(true);
    expect(input!.people.find((p) => p.id === S.mergedPersonId)?.mergedInto).toBe(picks.mergedIntoPersonId);
    expect(input!.people.find((p) => p.id === S.otherOneShiurId)).toMatchObject({ type: "other", shiurIds: [expect.any(String)] });
    expect(input!.people.find((p) => p.id === S.familyPersonId)?.nameEn).toMatch(/the Rav's father/);
    const c = (id: string) => ({ kind: "concepts", id });
    expect(input!.redirects?.concepts).toEqual({ "syn-chain-a": c("syn-chain-b"), "syn-chain-b": c(picks.chainTargetConceptId) });
    expect(input!.redirects?.people).toMatchObject({
      "syn-cycle-x": { kind: "people", id: "syn-cycle-y" },
      "syn-cycle-y": { kind: "people", id: "syn-cycle-x" },
      [S.crossKindPersonId]: c(picks.chainTargetConceptId),
      moshiach: c("mashiach"),
    });
    expect(input!.redirects?.stories).toBeDefined();
    for (const t of input!.shiurTags.values()) expect(typeof t.otherSpeakerShare).toBe("number");
  });
});

describe("failure policy", () => {
  it("corpus absent → layer off with a warning", () => {
    const d = miniCopy();
    rmSync(join(d, CORPUS), { recursive: true });
    const r = read(d);
    expect(r.input).toBeNull();
    expect(r.report.present).toBe(false);
    expect(r.report.warnings.join(" ")).toMatch(/absent/);
  });

  it("index missing while core files exist → fatal", () => {
    const d = miniCopy();
    rmSync(corpusFile(d, "index.json"));
    expect(() => read(d)).toThrow(FatalDataError);
  });

  it("index not valid JSON / wrong shape → fatal", () => {
    const d = miniCopy();
    writeFileSync(corpusFile(d, "index.json"), "{");
    expect(() => read(d)).toThrow(FatalDataError);
    writeFileSync(corpusFile(d, "index.json"), JSON.stringify({ version: "one", shiurIds: [] }));
    expect(() => read(d)).toThrow(/index\.json is invalid/);
  });

  it("an unknown version warns (default) or fails (policy)", () => {
    const d = miniCopy();
    const next = Math.max(...KNOWN_CORPUS_VERSIONS) + 1;
    editJson<Json>(corpusFile(d, "index.json"), (x) => void (x["version"] = next));
    const r = read(d);
    expect(r.input).not.toBeNull();
    expect(r.report.knownVersion).toBe(false);
    expect(r.report.version).toBe(next);
    expect(r.report.warnings.join(" ")).toMatch(new RegExp(`version ${next}`));
    expect(() => read(d, { unknownVersion: "fail" })).toThrow(FatalDataError);
  });

  it("a missing stories.json disables stories only", () => {
    const d = miniCopy();
    rmSync(corpusFile(d, "stories.json"));
    const r = read(d);
    expect(r.input.stories).toBeNull();
    expect(r.report.disabled).toEqual([{ file: "stories.json", reason: "missing" }]);
    expect(r.input.teachingClusters!.length).toBeGreaterThan(0);
    expect(r.input.topics.length).toBeGreaterThan(0);
    expect(r.input.redirects).not.toBeNull();
  });

  it("an invalid optional file turns that feature off", () => {
    const d = miniCopy();
    writeFileSync(corpusFile(d, "teaching-clusters.json"), JSON.stringify({ not: "an array" }));
    writeFileSync(corpusFile(d, "redirects.json"), JSON.stringify({ concepts: ["x"] }));
    const r = read(d);
    expect(r.input.teachingClusters).toBeNull();
    expect(r.input.redirects).toBeNull();
    expect(r.report.disabled.map((x) => x.file)).toEqual(["teaching-clusters.json", "redirects.json"]);
    expect(r.input.stories).not.toBeNull();
  });

  it("a broken topics.json is fatal", () => {
    const d = miniCopy();
    writeFileSync(corpusFile(d, "topics.json"), "[{");
    expect(() => read(d)).toThrow(FatalDataError);
  });

  it("a topics.json whose records lost a required field is fatal", () => {
    const d = miniCopy();
    editJson<Json[]>(corpusFile(d, "topics.json"), (xs) => xs.map(({ label: _label, ...rest }) => rest));
    expect(() => read(d)).toThrow(/topics\.json is invalid: most records fail/);
  });

  it.each(["topics.json", "concepts.json", "people.json", "works.json"])("a missing core file (%s) is fatal", (f) => {
    const d = miniCopy();
    rmSync(corpusFile(d, f));
    expect(() => read(d)).toThrow(FatalDataError);
  });

  it("a single invalid record is dropped and reported; a duplicate id too", () => {
    const d = miniCopy();
    let dropId = "";
    let dupId = "";
    editJson<Json[]>(corpusFile(d, "concepts.json"), (xs) => {
      dropId = String(xs[1]!["id"]);
      delete xs[1]!["canonicalHe"];
      dupId = String(xs[2]!["id"]);
      xs.push({ ...xs[2]! });
    });
    const before = read(MINI_DATA).input.concepts.length;
    const r = read(d);
    expect(r.input.concepts.length).toBe(before - 1);
    expect(r.input.concepts.some((c) => c.id === dropId)).toBe(false);
    expect(r.report.droppedRecords).toEqual([
      { file: "concepts.json", ref: dropId, reason: expect.stringMatching(/canonicalHe/) },
      { file: "concepts.json", ref: dupId, reason: expect.stringMatching(/duplicate/) },
    ]);
  });

  it("a record with a non-slug id is dropped (ids become addresses)", () => {
    const d = miniCopy();
    editJson<Json[]>(corpusFile(d, "works.json"), (xs) => void (xs[0]!["id"] = "Not A Slug"));
    const r = read(d);
    expect(r.report.droppedRecords).toEqual([{ file: "works.json", ref: "Not A Slug", reason: expect.stringMatching(/^id:/) }]);
  });

  it("an unknown person type is read as other and reported; the version-2 types are known", () => {
    const d = miniCopy();
    let id = "";
    editJson<Json[]>(corpusFile(d, "people.json"), (xs) => {
      id = String(xs[0]!["id"]);
      xs[0]!["type"] = "angel";
      xs[1]!["type"] = "malach";
      xs[2]!["type"] = "ruler";
      xs[3]!["type"] = "individual";
    });
    const r = read(d);
    expect(r.input.people.find((p) => p.id === id)?.type).toBe("other");
    expect(r.input.people.slice(1, 4).map((p) => p.type)).toEqual(["malach", "ruler", "individual"]);
    expect(r.report.coercedPersonTypes).toEqual([{ id, type: "angel" }]);
  });

  it("knows index.json version 2 only", () => {
    expect(KNOWN_CORPUS_VERSIONS).toEqual([2]);
    const d = miniCopy();
    editJson<Json>(corpusFile(d, "index.json"), (x) => void (x["version"] = 1));
    expect(read(d).report.knownVersion).toBe(false);
  });

  it("reads optional upstream fields (parsha/zman, person flags, reviewStatus)", () => {
    const d = miniCopy();
    editJson<Json[]>(corpusFile(d, "topics.json"), (xs) => {
      xs[0]!["parsha"] = ["נח"];
      xs[1]!["zman"] = ["פסח", "שבועות"];
      delete xs[2]!["parsha"];
      delete xs[4]!["parsha"];
      xs[3]!["reviewStatus"] = "reviewed";
    });
    editJson<Json[]>(corpusFile(d, "people.json"), (xs) => {
      xs[0]!["private"] = true;
      xs[0]!["contemporary"] = true;
      xs[1]!["family"] = true;
    });
    const { input } = read(d);
    expect(input.topics[0]!.parsha).toEqual(["נח"]);
    expect(input.topics[1]!.zman).toEqual(["פסח", "שבועות"]);
    expect(input.topics[2]!.parsha).toEqual([]);
    expect(input.topics[3]!.reviewStatus).toBe("reviewed");
    expect(input.topics[4]!.parsha).toEqual([]);
    expect(input.people[0]).toMatchObject({ private: true, contemporary: true });
    expect(input.people[1]!.family).toBe(true);
  });

  it("forbidden keys are dropped at any depth, even inside nested objects", () => {
    const d = miniCopy();
    editJson<Json[]>(corpusFile(d, "stories.json"), (xs) => {
      (xs[0]!["title"] as Json)["heardAs"] = POISON_CANARY;
      xs[1]!["asrVariants"] = [POISON_CANARY];
    });
    const { input, report } = read(d);
    expect(report.droppedKeys["stories.json"]).toEqual({ heardAs: 1, asrVariants: 1 });
    expect(JSON.stringify(input.stories)).not.toContain(POISON_CANARY);
    expect(isForbiddenInputKey("heardAsSamples")).toBe(true);
    expect(isForbiddenInputKey("aliases")).toBe(false);
  });

  it("a missing or mismatched shiur-tags file leaves that shiur untagged", () => {
    const d = miniCopy();
    const ids = readJson<{ shiurIds: string[] }>(corpusFile(d, "index.json")).shiurIds;
    rmSync(corpusFile(d, `shiur-tags/${ids[0]}.json`));
    editJson<Json>(corpusFile(d, `shiur-tags/${ids[1]}.json`), (x) => void (x["shiurId"] = ids[2]));
    writeFileSync(corpusFile(d, `shiur-tags/${ids[2]}.json`), JSON.stringify({ shiurId: ids[2], topics: [{ id: "x", salience: 7 }] }));
    const { input, report } = read(d);
    expect(input.shiurTags.has(ids[0]!)).toBe(false);
    expect(input.shiurTags.has(ids[1]!)).toBe(false);
    expect(input.shiurTags.has(ids[2]!)).toBe(false);
    expect(input.shiurTags.size).toBe(ids.length - 3);
    expect(report.untagged.map((u) => u.shiurId)).toEqual(ids.slice(0, 3));
    expect(report.untagged[0]!.reason).toBe("missing");
  });

  it("an invalid series file turns that series off", () => {
    const d = miniCopy();
    const f = readJson<{ files: string[] }>(corpusFile(d, "index.json")).files.find((x) => x.startsWith("series/"))!;
    editJson<Json>(corpusFile(d, f), (x) => void delete x["overview"]);
    const { input, report } = read(d);
    expect(report.disabled).toEqual([{ file: f, reason: expect.stringMatching(/overview/) }]);
    expect(input.series.has(f.slice("series/".length, -".json".length))).toBe(false);
  });

  it("redirects: unknown kinds, self-redirects, non-slug ids and unknown target kinds are dropped; cross-kind targets are kept", () => {
    const d = miniCopy();
    editJson<Json>(corpusFile(d, "redirects.json"), (x) => {
      x["widgets"] = { a: "b" };
      x["works"] = {
        "same-id": "same-id",
        "Bad Id": "tanya",
        "old-work": "tanya",
        "to-concept": { kind: "concepts", id: "emunah" },
        "to-gadget": { kind: "gadgets", id: "x" },
        "no-id": { kind: "concepts" },
      };
    });
    const { input, report } = read(d);
    expect(input.redirects!.works).toEqual({ "old-work": { kind: "works", id: "tanya" }, "to-concept": { kind: "concepts", id: "emunah" } });
    expect(input.redirects).not.toHaveProperty("widgets");
    expect(report.droppedRecords.map((r) => r.ref)).toEqual(["works:same-id", "works:#invalid", "works:to-gadget", "works:no-id", "widgets"]);
    expect(JSON.stringify(report)).not.toContain("Bad Id");
  });

  it("the fixture poison is really there", () => {
    expect(existsSync(join(MINI_DATA, CORPUS, "people-alias-map.json"))).toBe(true);
  });
});
