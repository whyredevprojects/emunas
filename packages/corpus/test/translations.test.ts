/**
 * Translation overlays (P4c): a current overlay is applied, a stale or invalid one is ignored, a
 * missing one leaves the translated language absent; the translated write-up mirrors the Yiddish
 * blocks; corpus entries get their translations in the layer. Fixtures are written into a copy of
 * the mini corpus, with hashes computed from its en/yi text (the hash itself is pinned to the
 * pipeline's in the real-data test at the bottom).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pickLocalized, pickText } from "@emunas/i18n";
import { describe, expect, it } from "vitest";
import type { Extraction, Writeup } from "../../../src/types.ts";
import { projectAndAggregate } from "../src/aggregate/build.ts";
import { projectCorpus } from "../src/build/build.ts";
import { loadShiurFiles } from "../src/build/load.ts";
import { ForbiddenPathError, createDataReader, isAllowedDataPath } from "../src/build/read.ts";
import { corpusEntrySlots, hashSlots, shiurSlots, type CorpusTranslatable } from "../src/build/translations.ts";
import { LAYER_FILES, type LayerConceptsFile, type LayerInfo, type LayerStoriesFile, type LayerTopicsFile } from "../src/public/corpus-layer.ts";
import { parseMomentId } from "../src/public/moment-id.ts";
import type { PublicShiur } from "../src/public/types.ts";
import { MINI_POLICY, REAL_DATA, REPO, miniCopy, readJson, tmp } from "./helpers.ts";

const ID = "yi-zmanim-tv-bb-04";

function sourceOf(dataDir: string, id: string): { x: Extraction; w: Writeup } {
  const dir = join(dataDir, "derived/shiurim", id);
  return { x: readJson<Extraction>(join(dir, "extraction.json")), w: readJson<Writeup>(join(dir, "writeup.json")) };
}

/** Every slot key of the shiur → a recognisable Hebrew stand-in. */
function fullText(x: Extraction, w: Writeup): Record<string, string> {
  return Object.fromEntries(shiurSlots(x, w).map((s) => [s.k, `עברית ${s.k}`]));
}

function writeShiurOverlay(dataDir: string, id: string, overlay: { sourceHash?: string; text?: Record<string, string>; lang?: string; shiurId?: string } = {}): void {
  const { x, w } = sourceOf(dataDir, id);
  const dir = join(dataDir, "derived/shiurim", id, "i18n");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "he.json"),
    JSON.stringify({
      shiurId: overlay.shiurId ?? id,
      lang: overlay.lang ?? "he",
      model: "opus",
      promptVersion: "p4c-v1",
      sourceHash: overlay.sourceHash ?? hashSlots(shiurSlots(x, w)),
      text: overlay.text ?? fullText(x, w),
    }),
  );
}

const project = (dataDir: string, suppressFile?: string) =>
  projectCorpus({ dataDir, policyDir: MINI_POLICY, ...(suppressFile ? { suppressFile } : {}) });
const shiurOf = (p: ReturnType<typeof project>, id = ID): PublicShiur => p.shiurim.find((s) => s.id === id)!;

/** Every `he` key anywhere in a value. */
function heCount(x: unknown): number {
  if (Array.isArray(x)) return x.reduce((a: number, y) => a + heCount(y), 0);
  if (x === null || typeof x !== "object") return 0;
  return Object.entries(x).reduce((a, [k, v]) => a + (k === "he" ? 1 : 0) + heCount(v), 0);
}

describe("shiur translation overlays", () => {
  it("a current overlay is applied to every text and the write-up", () => {
    const data = miniCopy();
    writeShiurOverlay(data, ID);
    const p = project(data);
    const s = shiurOf(p);
    const n = s.notes!;
    expect(n.summary.oneLiner.he).toBe("עברית x.summary.oneLiner");
    expect(n.summary.abstract.he).toBe("עברית x.summary.abstract");
    const ch = n.chapters[0]!;
    expect(ch.title.he).toBe(`עברית x.sections.${ch.idx}.title`);
    expect(ch.summary.he).toBe(`עברית x.sections.${ch.idx}.summary`);
    for (const m of n.insights) expect(m.text.he).toBe(`עברית x.insights.${parseMomentId(m.id)!.index}.text`);
    for (const m of n.summary.keyPoints) expect(m.text.he).toBe(`עברית x.summary.keyPoints.${parseMomentId(m.id)!.index}.text`);
    for (const q of n.questions) expect(q.a.he).toBe(`עברית x.questions.${parseMomentId(q.id)!.index}.answer`);
    for (const st of n.stories) expect(st.retelling.he).toBe(`עברית x.stories.${parseMomentId(st.id)!.index}.retelling`);
    // en and yi are untouched.
    const plain = shiurOf(project(miniCopy()));
    expect(n.summary.oneLiner.en).toBe(plain.notes!.summary.oneLiner.en);
    expect(n.writeup.en).toEqual(plain.notes!.writeup.en);
    expect(n.writeup.yi).toEqual(plain.notes!.writeup.yi);

    // The Hebrew write-up mirrors the Yiddish blocks: same sections, sources and times, own ids.
    const he = n.writeup.he!;
    expect(he).toHaveLength(n.writeup.yi.length);
    he.forEach((b, bi) => {
      const yi = n.writeup.yi[bi]!;
      expect(b.sectionIndex).toBe(yi.sectionIndex);
      expect(b.heading).toBe(yi.heading === null ? null : `עברית w.${bi}.heading`);
      expect(b.paragraphs.map((x) => [x.src, x.t, x.end])).toEqual(yi.paragraphs.map((x) => [x.src, x.t, x.end]));
      b.paragraphs.forEach((x, pi) => {
        expect(x.id).toBe(`${ID}~whe${bi}.${pi}`);
        expect(x.text).toBe(`עברית w.${bi}.paragraphs.${pi}.text`);
        expect(parseMomentId(x.id)).toEqual({ shiurId: ID, kind: "whe", index: bi, sub: pi });
      });
    });

    // The index row carries the translated one-liner; the report counts the overlay.
    expect(p.index.shiurim.find((r) => r.id === ID)!.oneLiner!.he).toBe("עברית x.summary.oneLiner");
    const rep = p.report.finish({ total: 0, full: 0, catalogOnly: 0, downgraded: 0, notDone: 0 }, 4, []);
    expect(rep.translations.he).toEqual({ applied: 1, stale: [], invalid: [] });
    // Time warnings are not repeated for the translated paragraphs.
    expect(rep.timeWarnings.some((w) => w.id.includes("~whe"))).toBe(false);

    // The sites' picker: Hebrew readers get the Hebrew text, tagged he/rtl.
    expect(pickText(n.summary.oneLiner, "he")).toMatchObject({ lang: "he", dir: "rtl", fallback: false });
    expect(pickLocalized(n.writeup, "he")?.lang).toBe("he");
  });

  it("a stale overlay (source changed since) is ignored and reported", () => {
    const data = miniCopy();
    writeShiurOverlay(data, ID, { sourceHash: "0000000000000000" });
    const p = project(data);
    const s = shiurOf(p);
    expect(heCount(s)).toBe(0);
    expect(s.notes!.writeup.he).toBeUndefined();
    const rep = p.report.finish({ total: 0, full: 0, catalogOnly: 0, downgraded: 0, notDone: 0 }, 4, []);
    expect(rep.translations.he).toEqual({ applied: 0, stale: [ID], invalid: [] });
    // Editing the source text after translating makes a real overlay stale too.
    const data2 = miniCopy();
    writeShiurOverlay(data2, ID);
    const xPath = join(data2, "derived/shiurim", ID, "extraction.json");
    const x = readJson<Extraction>(xPath);
    x.summary.oneLiner.en += " (revised)";
    writeFileSync(xPath, JSON.stringify(x));
    expect(heCount(shiurOf(project(data2)))).toBe(0);
  });

  it("an overlay for another shiur or language is invalid and ignored", () => {
    const data = miniCopy();
    writeShiurOverlay(data, ID, { shiurId: "yi-tanya-1-01" });
    const p = project(data);
    expect(heCount(shiurOf(p))).toBe(0);
    expect(p.report.finish({ total: 0, full: 0, catalogOnly: 0, downgraded: 0, notDone: 0 }, 4, []).translations.he.invalid).toEqual([ID]);
  });

  it("no overlay: no he anywhere, the write-up has en and yi only", () => {
    const p = project(miniCopy());
    for (const s of p.shiurim) {
      expect(heCount(s)).toBe(0);
      if (s.notes) expect(Object.keys(s.notes.writeup)).toEqual(["en", "yi"]);
    }
    // Readers of Hebrew fall back to Yiddish, tagged as such.
    const n = shiurOf(p).notes!;
    expect(pickText(n.summary.oneLiner, "he")).toMatchObject({ lang: "yi", fallback: true });
    expect(pickLocalized(n.writeup, "he")).toMatchObject({ lang: "yi", fallback: true });
  });

  it("a partial overlay translates what it has; an incomplete write-up stays out whole", () => {
    const data = miniCopy();
    const { x, w } = sourceOf(data, ID);
    const text = fullText(x, w);
    delete text["x.summary.abstract"];
    delete text["w.0.paragraphs.0.text"];
    writeShiurOverlay(data, ID, { text });
    const n = shiurOf(project(data)).notes!;
    expect(n.summary.oneLiner.he).toBeDefined();
    expect(n.summary.abstract.he).toBeUndefined();
    expect(n.writeup.he).toBeUndefined();
  });

  it("suppressing a Yiddish paragraph drops its translation too; suppressed summaries are blank in every language", () => {
    const data = miniCopy();
    writeShiurOverlay(data, ID);
    const sup = join(tmp(), "suppress.json");
    writeFileSync(sup, JSON.stringify({ ids: [`${ID}~wyi0.0`, `${ID}~ol0`] }));
    const n = shiurOf(project(data, sup)).notes!;
    expect(n.writeup.he![0]!.paragraphs.some((p) => p.id === `${ID}~whe0.0`)).toBe(false);
    expect(n.writeup.he![0]!.paragraphs.length).toBe(n.writeup.yi[0]!.paragraphs.length);
    expect(n.summary.oneLiner).toEqual({ en: "", yi: "" });
  });

  it("the overlay is part of the shiur fingerprint", () => {
    const a = miniCopy();
    const b = miniCopy();
    writeShiurOverlay(b, ID);
    const ra = shiurOf(project(a)).rev;
    const rb = shiurOf(project(b)).rev;
    expect(ra).not.toBe(rb);
    expect(shiurOf(project(a), "yi-tanya-1-01").rev).toBe(shiurOf(project(b), "yi-tanya-1-01").rev);
  });
});

describe("reading overlays", () => {
  it("allows the overlay paths and lists only the corpus translation folders", () => {
    expect(isAllowedDataPath(`derived/shiurim/${ID}/i18n/he.json`)).toBe(true);
    expect(isAllowedDataPath("derived/corpus/i18n/he/concepts-001.json")).toBe(true);
    expect(isAllowedDataPath(`derived/shiurim/${ID}/i18n/../meta.json`)).toBe(false);
    expect(isAllowedDataPath(`derived/shiurim/${ID}/i18n/he.txt`)).toBe(false);
    expect(isAllowedDataPath("derived/corpus/i18n/he/raw/x.json")).toBe(false);
    const reader = createDataReader(miniCopy());
    expect(reader.list("derived/corpus/i18n/he")).toEqual([]);
    expect(() => reader.list("derived/corpus")).toThrow(ForbiddenPathError);
    expect(() => reader.list(["trans", "cripts"].join(""))).toThrow(ForbiddenPathError);
    expect(() => reader.list(`derived/shiurim/${ID}/i18n`)).toThrow(ForbiddenPathError);
  });
});

// ---------------------------------------------------------------- corpus layer

function corpusSource(dataDir: string): CorpusTranslatable {
  const dir = join(dataDir, "derived/corpus");
  const opt = <T>(f: string): T[] => (existsSync(join(dir, f)) ? readJson<T[]>(join(dir, f)) : []);
  const seriesDir = join(dir, "series");
  return {
    concepts: opt("concepts.json"),
    stories: opt("stories.json"),
    topics: opt("topics.json"),
    teachingClusters: opt("teaching-clusters.json"),
    people: opt("people.json"),
    series: existsSync(seriesDir) ? readdirSync(seriesDir).filter((f) => f.endsWith(".json")).map((f) => readJson(join(seriesDir, f))) : [],
  };
}

function writeCorpusPart(dataDir: string, name: string, entries: [string, Record<string, string>, string?][]): void {
  const slots = corpusEntrySlots(corpusSource(dataDir));
  const dir = join(dataDir, "derived/corpus/i18n/he");
  mkdirSync(dir, { recursive: true });
  const sourceHashes: Record<string, string> = {};
  const text: Record<string, string> = {};
  for (const [entry, fields, hash] of entries) {
    sourceHashes[entry] = hash ?? hashSlots(slots.get(entry)!);
    for (const [f, t] of Object.entries(fields)) text[`${entry}.${f}`] = t;
  }
  writeFileSync(join(dir, name), JSON.stringify({ lang: "he", model: "opus", promptVersion: "p4c-v1", sourceHashes, text }));
}

describe("corpus translation overlays", () => {
  const plain = projectAndAggregate({ dataDir: miniCopy(), policyDir: MINI_POLICY }).layer.files;
  const plainConcepts = (plain[LAYER_FILES.concepts] as LayerConceptsFile).concepts;
  const plainStories = (plain[LAYER_FILES.stories] as LayerStoriesFile).stories;
  const plainTopics = (plain[LAYER_FILES.topics] as LayerTopicsFile).tree;
  const seriesName = Object.keys(plain).find((k) => k.startsWith(`${LAYER_FILES.seriesDir}/`));

  it("no overlay: no translated text, only native topic names", () => {
    expect(heCount(plainConcepts)).toBe(0);
    expect(heCount(plainStories)).toBe(0);
    const info = plain[LAYER_FILES.layer] as LayerInfo;
    expect(info.translations.he).toMatchObject({ files: 0, current: 0, stale: 0 });
    expect(info.translations.he.entries).toBeGreaterThan(0);
  });

  it("applies current entries, ignores stale ones, and keeps a topic's own Hebrew name", () => {
    expect(plainConcepts.length).toBeGreaterThan(1);
    expect(plainStories.length).toBeGreaterThan(0);
    const [c1, c2] = plainConcepts;
    const st = plainStories[0]!;
    const withHe = plainTopics.find((t) => t.label.he !== undefined)!;
    const data = miniCopy();
    writeCorpusPart(data, "concepts-001.json", [
      [`concepts:${c1!.id}`, { label: "מושג", definition: "הגדרה" }],
      [`concepts:${c2!.id}`, { label: "ישן" }, "ffffffffffffffff"],
    ]);
    writeCorpusPart(data, "stories-001.json", [[`stories:${st.id}`, { title: "כותרת", retelling: "סיפור" }]]);
    writeCorpusPart(data, "topics-001.json", [[`topics:${withHe.id}`, { label: "תרגום" }]]);
    const series = seriesName ? readJson<{ seriesId: string; arc: { shiurId: string }[] }>(join(data, "derived/corpus", `${seriesName}`)) : null;
    if (series) {
      const sid = series.seriesId;
      writeCorpusPart(data, "series-001.json", [[`series:${sid}`, { title: "סדרה", "keyThemes.0": "נושא", [`arc.${series.arc[0]!.shiurId}.oneLiner`]: "שורה" }]]);
    }
    const files = projectAndAggregate({ dataDir: data, policyDir: MINI_POLICY }).layer.files;
    const concepts = (files[LAYER_FILES.concepts] as LayerConceptsFile).concepts;
    expect(concepts.find((c) => c.id === c1!.id)!.label).toEqual({ ...c1!.label, he: "מושג" });
    expect(concepts.find((c) => c.id === c1!.id)!.definition.he).toBe("הגדרה");
    expect(concepts.find((c) => c.id === c2!.id)!.label.he).toBeUndefined();
    const story = (files[LAYER_FILES.stories] as LayerStoriesFile).stories.find((s) => s.id === st.id)!;
    expect([story.title.he, story.retelling.he]).toEqual(["כותרת", "סיפור"]);
    const topic = (files[LAYER_FILES.topics] as LayerTopicsFile).tree.find((t) => t.id === withHe.id)!;
    expect(topic.label.he).toBe(withHe.label.he);
    if (series && seriesName) {
      const s = files[seriesName] as { title: { he?: string }; overview: { he?: string }; keyThemes: { he?: string }[]; arc: { shiurId: string; oneLiner: { he?: string } }[] };
      expect(s.title.he).toBe("סדרה");
      expect(s.overview.he).toBeUndefined();
      if (s.keyThemes.length > 0) expect(s.keyThemes[0]!.he).toBe("נושא");
      const a = s.arc.find((x) => x.shiurId === series.arc[0]!.shiurId);
      if (a) expect(a.oneLiner.he).toBe("שורה");
    }
    const info = files[LAYER_FILES.layer] as LayerInfo;
    expect(info.translations.he.files).toBe(series ? 4 : 3);
    expect(info.translations.he.stale).toBe(1);
    expect(info.translations.he.current).toBe(series ? 4 : 3);
  });

  it("a part file that is not a translation is counted invalid and not used", () => {
    const data = miniCopy();
    const dir = join(data, "derived/corpus/i18n/he");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "concepts-001.json"), JSON.stringify({ lang: "yi", sourceHashes: {}, text: {} }));
    writeFileSync(join(dir, "concepts-002.json"), "not json");
    const files = projectAndAggregate({ dataDir: data, policyDir: MINI_POLICY }).layer.files;
    const info = files[LAYER_FILES.layer] as LayerInfo;
    expect(info.translations.he).toMatchObject({ files: 2, invalidFiles: 2, current: 0 });
    expect(info.warnings).toContain("2 corpus translation part(s) for he are not valid (not used)");
  });
});

// ---------------------------------------------------------------- the pipeline's hash

describe.skipIf(!existsSync(join(REAL_DATA, "derived/manifest.json")))("hash agrees with the pipeline (scripts/lib/translate.ts) on real data", () => {
  it("shiur and corpus source hashes are the pipeline's", () => {
    const reader = createDataReader(REAL_DATA);
    const manifest = readJson<{ entries: { shiurId: string; status: string }[] }>(join(REAL_DATA, "derived/manifest.json"));
    const ids = manifest.entries.filter((e) => e.status === "done").map((e) => e.shiurId).slice(0, 5);
    const ours: Record<string, string> = {};
    for (const id of ids) {
      const f = loadShiurFiles(reader, id);
      if (f.extraction && f.writeup) ours[id] = hashSlots(shiurSlots(f.extraction, f.writeup));
    }
    const corpus = [...corpusEntrySlots(corpusSource(REAL_DATA))].map(([e, s]) => [e, hashSlots(s)] as const);
    const script = `
      import { corpusEntries, hashSlots, shiurSlots } from "./scripts/lib/translate.ts";
      const ids = ${JSON.stringify(Object.keys(ours))};
      const shiurim = Object.fromEntries(ids.map((id) => [id, hashSlots(shiurSlots(id))]));
      const corpus = Object.fromEntries([...corpusEntries()].map(([e, s]) => [e, hashSlots(s)]));
      console.log(JSON.stringify({ shiurim, corpus }));
    `;
    const out = execFileSync(join(REPO, "node_modules/.bin/tsx"), ["--eval", script], { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20 });
    const theirs = JSON.parse(out) as { shiurim: Record<string, string>; corpus: Record<string, string> };
    expect(Object.keys(ours).length).toBeGreaterThan(0);
    expect(ours).toEqual(theirs.shiurim);
    expect(Object.fromEntries(corpus)).toEqual(theirs.corpus);
  });
});
