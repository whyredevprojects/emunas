/**
 * C1.3: the guard on the corpus layer (corpus-wave-plan §3.4): raw-only keys and raw/ substrings,
 * the raw ban and the alias-key assertion in alias positions, and the verbatim scan of corpus text
 * units under `corpus:` item ids (pre-pass vs. member shiurim, post-pass by attribution).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.ts";
import { AliasRules, aliasTerms, createLeakScanner, readAsrVariants } from "../src/index.ts";
import { corpusItemId, layerFileOf, layerFileUnits, parseCorpusItemId, readLayerUnits } from "../src/layer.ts";
import { createPagefindChecker } from "../src/pagefind.ts";
import { readVerbatimAllow } from "../src/policy.ts";
import { runPrePass } from "../src/pre.ts";
import { FILLER, OTHER_SHIUR, SENTENCE, SHIUR, makeFixture, words, writeFile, type Fixture } from "./fixtures.ts";

const RUN20 = words(2, 20);
const RUN11 = words(5, 11);
const RUN14 = words(8, 14);

const STORY = "the-rebbe-and-the-wagon-driver";
const OTHER_STORY = "the-coachman-at-night";
const THREAD = "hester-panim-as-closeness";
const TOPIC = "emunah-bitachon";
const CONCEPT = "bitachon";
const SERIES = "test-series-yi";

/** An ASR spelling of the person `baal-shem-tov` in the fixture's variant dump. */
const VARIANT = "Bal Shemtoyv";
/** A display alias of the same person. */
const DISPLAY_ALIAS = "the Besht";

interface LayerFx extends Fixture {
  data: string;
  layer: string;
}

let fx: LayerFx | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

/** Corpus data folder (entity display fields and the variant dump), separate from `.corpus`. */
function writeCorpusData(dir: string): void {
  writeFile(join(dir, "topics.json"), JSON.stringify([
    { id: TOPIC, parentId: null, level: 1, label: { en: "Emunah and Bitachon", yi: "אמונה און בטחון", he: "אמונה ובטחון" }, aliases: ["trust in hashem"], description: null, shiurCount: 2, hubShiurIds: [SHIUR] },
  ]));
  writeFile(join(dir, "concepts.json"), JSON.stringify([
    { id: CONCEPT, canonicalHe: "ביטחון", label: { en: "Bitachon", yi: "ביטחון" }, transliterations: ["bitachon", "bitochon"], definition: { en: "d", yi: "d" }, shiurIds: [SHIUR], exampleRefs: [] },
  ]));
  writeFile(join(dir, "people.json"), JSON.stringify([
    { id: "baal-shem-tov", nameHe: "בעל שם טוב", nameEn: "Baal Shem Tov", nameYi: "בעל שם טוב", type: "chassidic_rebbe", aliases: [DISPLAY_ALIAS, "Reb Yisroel Baal Shem Tov"], shiurIds: [SHIUR] },
  ]));
  writeFile(join(dir, "works.json"), JSON.stringify([
    { id: "tanya", titleHe: "תניא", titleEn: "Tanya", aliases: ["Likutei Amarim"], authorPersonId: null, sefariaIndexTitle: "Tanya", shiurIds: [SHIUR] },
  ]));
  writeFile(join(dir, "raw", "asr-variants.json"), JSON.stringify({
    concepts: { [CONCEPT]: ["bitokhn"] },
    people: { "baal-shem-tov": [VARIANT, "באל שעם טויוו"] },
    works: { tanya: ["Tania"] },
  }));
}

/** `.corpus/layer/` with corpus text: a 20-token run in the story retelling, 14 in the topic description, 11 in the thread summary. */
function writeLayer(layer: string, o: { retellingEn?: string; synonyms?: { kind: string; id: string; terms: string[] }[] } = {}): void {
  const L = (en: string, yi = "א טעקסט") => ({ en, yi });
  writeFile(join(layer, "stories.json"), JSON.stringify({
    stories: [
      { id: STORY, title: L("The Rebbe and the wagon driver"), retelling: L(o.retellingEn ?? `${FILLER} ${RUN20}`), people: [{ id: "baal-shem-tov" }],
        tellings: [{ shiurId: SHIUR, momentId: `${SHIUR}~st0`, chapterIdx: 0, t: 1, year: 5770, lang: "yi" }], shiurCount: 1, reviewed: false, pages: { quiet: false, live: false } },
      // Its only member is the other shiur, whose transcript does not hold the run.
      { id: OTHER_STORY, title: L("The coachman"), retelling: L(`${FILLER} ${RUN20}`), people: [],
        tellings: [{ shiurId: OTHER_SHIUR, momentId: `${OTHER_SHIUR}~st0`, chapterIdx: 0, t: 1, year: null, lang: "yi" }], shiurCount: 1, reviewed: false, pages: { quiet: false, live: false } },
    ],
  }));
  writeFile(join(layer, "threads.json"), JSON.stringify({
    threads: [{ id: THREAD, label: L("Hester panim"), summary: L(`${FILLER} ${RUN11}`), topicIds: [TOPIC],
      members: [{ shiurId: SHIUR, momentId: `${SHIUR}~i0`, chapterIdx: 0, t: 4, year: 5770, lang: "yi" }, { shiurId: OTHER_SHIUR, momentId: `${OTHER_SHIUR}~i0`, chapterIdx: 0, t: 4, year: null, lang: "yi" }],
      shiurCount: 2, datedCount: 1, years: [5770, 5770], page: false, timeline: false, reviewed: false }],
  }));
  writeFile(join(layer, "topics.json"), JSON.stringify({
    tree: [{ id: TOPIC, parentId: null, level: 1, label: { en: "Emunah and Bitachon", yi: "אמונה און בטחון" }, count: 2, sameAs: null, reviewed: false, pages: { quiet: true, live: true }, gateway: true }],
    detail: [{ id: TOPIC, description: L(`${FILLER} ${RUN14}`), hubs: [OTHER_SHIUR], grades: { main: [{ shiurId: SHIUR, salience: 0.9 }], discussed: [], touched: [] },
      children: [], coTopics: [], threadIds: [THREAD], storyIds: [STORY], occasions: [] }],
  }));
  writeFile(join(layer, "concepts.json"), JSON.stringify({
    concepts: [{ id: CONCEPT, canonicalHe: "ביטחון", label: L("Bitachon", "ביטחון"), transliterations: ["bitachon"], definition: L(FILLER), shiurIds: [SHIUR], count: 1,
      exampleRefs: [{ shiurId: OTHER_SHIUR, sectionIndex: 0, momentId: `${OTHER_SHIUR}~s0`, t: 0 }], passim: false, liveFacetDrop: false, mergedIntoTopic: null, reviewed: false, pages: { quiet: true, live: true } }],
  }));
  writeFile(join(layer, "people.json"), JSON.stringify({
    people: [{ id: "baal-shem-tov", nameHe: "בעל שם טוב", nameEn: "Baal Shem Tov", nameYi: "בעל שם טוב", aliases: [DISPLAY_ALIAS], type: "chassidic_rebbe", typeOrder: 4,
      shiurIds: [SHIUR], count: 1, storyIds: [STORY], worksAuthored: [], sameIdWork: null, sameAsTopic: null, excluded: null, listed: { quiet: true, live: true }, pages: { quiet: false, live: false }, quietAllList: false, reviewed: false }],
  }));
  writeFile(join(layer, "synonyms.json"), JSON.stringify({
    synonyms: o.synonyms ?? [
      { kind: "person", id: "baal-shem-tov", terms: ["baal shem tov", "the besht", "בעל שם טוב"] },
      { kind: "concept", id: CONCEPT, terms: ["bitachon", "ביטחון", "bitochon"] },
      { kind: "topic", id: TOPIC, terms: ["emunah and bitachon", "trust in hashem"] },
      { kind: "work", id: "tanya", terms: ["tanya", "likutei amarim"] },
    ],
  }));
  writeFile(join(layer, "series", `${SERIES}.json`), JSON.stringify({
    seriesId: SERIES, title: L("A series"), overview: L(FILLER), keyThemes: [L("one theme"), L("two theme")],
    arc: [{ shiurId: SHIUR, part: 1, oneLiner: L("Part one.") }, { shiurId: OTHER_SHIUR, part: 2, oneLiner: L("Part two.") }], missing: [], reviewed: false,
  }));
}

function makeLayerFixture(opts: { allow?: string[] } = {}): LayerFx {
  const base = makeFixture(opts.allow ? { allow: opts.allow } : {});
  const data = join(base.root, "data", "derived", "corpus");
  const layer = join(base.corpus, "layer");
  writeCorpusData(data);
  writeLayer(layer);
  return { ...base, data, layer };
}

function scanner(f: LayerFx, withVerbatim = true) {
  return createLeakScanner({
    corpusDir: f.corpus,
    transcriptsDir: withVerbatim ? f.transcripts : null,
    corpusDataDir: f.data,
    siteDir: f.site,
    env: {},
    baseDir: f.root,
  });
}

/** No transcript token and no planted variant may appear in a report or a log. */
function expectClean(text: string): void {
  const lower = text.toLowerCase();
  for (const w of SENTENCE) expect(lower).not.toContain(w);
  expect(lower).not.toContain(VARIANT.toLowerCase());
  expect(text).not.toContain("באל שעם");
}

describe("corpus-layer text units", () => {
  it("item ids round-trip; units carry ids, paths and members", () => {
    expect(corpusItemId("story", STORY, "retelling", "en")).toBe(`corpus:story:${STORY}#retelling.en`);
    expect(parseCorpusItemId(`corpus:series:${SERIES}#arc.${SHIUR}.yi`)).toEqual({ kind: "series", entityId: SERIES, field: `arc.${SHIUR}`, lang: "yi" });
    expect(parseCorpusItemId(`${SHIUR}~kp0`)).toBeNull();
    fx = makeLayerFixture();
    const { units, files, unreadable } = readLayerUnits(fx.corpus);
    expect(files).toBe(5);
    expect(unreadable).toEqual([]);
    const ids = units.map((u) => u.id);
    expect(ids).toContain(`corpus:story:${STORY}#retelling.en`);
    expect(ids).toContain(`corpus:thread:${THREAD}#summary.yi`);
    expect(ids).toContain(`corpus:topic:${TOPIC}#description.en`);
    expect(ids).toContain(`corpus:concept:${CONCEPT}#definition.en`);
    expect(ids).toContain(`corpus:series:${SERIES}#keyThemes.1.en`);
    expect(ids).toContain(`corpus:series:${SERIES}#arc.${OTHER_SHIUR}.yi`);
    expect(ids).toContain(`corpus:series:${SERIES}#overview.yi`);
    // Names, aliases and synonyms are not corpus prose.
    expect(units.every((u) => ["stories.json", "threads.json", "topics.json", "concepts.json", `series/${SERIES}.json`].includes(u.file))).toBe(true);
    const topic = units.find((u) => u.id === `corpus:topic:${TOPIC}#description.en`)!;
    expect(topic.members.sort()).toEqual([OTHER_SHIUR, SHIUR].sort());
    expect(topic.path).toEqual(["detail", 0, "description", "en"]);
    const concept = units.find((u) => u.id === `corpus:concept:${CONCEPT}#label.en`)!;
    expect(concept.members.sort()).toEqual([OTHER_SHIUR, SHIUR].sort());
  });

  it("reads defensively and maps layer paths", () => {
    expect(layerFileUnits("stories.json", { stories: [{ id: 3 }, null, { id: "s", title: "x", retelling: { en: "", yi: 7 } }] })).toEqual([]);
    expect(layerFileUnits("people.json", { people: [] })).toEqual([]);
    expect(layerFileOf("/x/.corpus/layer/stories.json")).toBe("stories.json");
    expect(layerFileOf("/x/.corpus/layer/series/a.json")).toBe("series/a.json");
    expect(layerFileOf("/x/.corpus/layer/shiur/a.json")).toBeNull();
    expect(layerFileOf("/x/.corpus/stories.json")).toBeNull();
  });
});

describe("pre-pass over corpus units", () => {
  it("suppresses a 20-token run in a story retelling as corpus:story:<id>#retelling.en, reports 14, passes 11", () => {
    fx = makeLayerFixture();
    const r = runPrePass(fx.corpus, { transcriptsDir: fx.transcripts, allow: readVerbatimAllow(fx.site) });
    const id = `corpus:story:${STORY}#retelling.en`;
    expect(r.suppress.map((s) => s.id)).toEqual([id]);
    expect(r.suppress[0]).toMatchObject({ reason: "verbatim-run", shiurId: SHIUR, runLength: 20, fields: ["layer/stories.json:stories[].retelling.en"] });
    const reported = new Map(r.report.map((e) => [e.id, e.runLength]));
    expect(reported.get(`corpus:topic:${TOPIC}#description.en`)).toBe(14);
    expect(reported.has(`corpus:thread:${THREAD}#summary.en`)).toBe(false); // 11 tokens: silent
    // The same run, written from a shiur whose transcript does not hold it: not attributed, not reported.
    expect(reported.has(`corpus:story:${OTHER_STORY}#retelling.en`)).toBe(false);
    expect(r.counts).toMatchObject({ corpusUnitsScanned: r.counts.corpusUnits, corpusUnitsUnchecked: 0, corpusReported: 2, corpusSuppressed: 1 });
    expect(r.counts.corpusUnits).toBeGreaterThan(20);
    expectClean(JSON.stringify(r));
  });

  it("allow-listed corpus ids move to allowed[]; units without a member transcript are counted", () => {
    const id = `corpus:story:${STORY}#retelling.en`;
    fx = makeLayerFixture({ allow: [id] });
    writeFile(join(fx.layer, "threads.json"), JSON.stringify({ threads: [{ id: "t", label: { en: "x y z", yi: "" }, summary: { en: FILLER, yi: "" }, members: [{ shiurId: "en-not-in-corpus-01" }] }] }));
    const r = runPrePass(fx.corpus, { transcriptsDir: fx.transcripts, allow: readVerbatimAllow(fx.site) });
    expect(r.suppress).toEqual([]);
    expect(r.allowed.map((a) => a.id)).toEqual([id]);
    expect(r.counts.corpusUnitsUnchecked).toBe(2);
  });

  it("CLI writes the corpus id to suppress.json and prints counts, ids only", () => {
    fx = makeLayerFixture();
    const out = join(fx.root, "suppress.json");
    const logs: string[] = [];
    expect(main(["pre", "--corpus", fx.corpus, "--transcripts", fx.transcripts, "--out", out, "--site-policy", fx.site], (s) => logs.push(s))).toBe(0);
    const text = readFileSync(out, "utf8");
    expect((JSON.parse(text) as { suppress: { id: string }[] }).suppress.map((s) => s.id)).toEqual([`corpus:story:${STORY}#retelling.en`]);
    expect(logs.join("\n")).toMatch(/corpus layer \d+ text units/);
    expectClean(text);
    expectClean(logs.join("\n"));
  });
});

describe("post-pass: raw-only keys and raw/ substrings", () => {
  it("fails a planted asrVariants key (JSON, NDJSON, JS bare and quoted) and the other raw-only keys", () => {
    fx = makeLayerFixture();
    const d = join(fx.root, "dist");
    writeFile(join(d, "a.json"), JSON.stringify({ id: "x", asrVariants: ["y"] }));
    writeFile(join(d, "b.ndjson"), `${JSON.stringify({ id: "x", heardAsSamples: ["y"] })}\n`);
    writeFile(join(d, "c.js"), `const e={asrVariants:["y"]};export default e;`);
    writeFile(join(d, "d.js"), `const e={"nullWork":1,"fromPeople":2,"sampleTitles":[],"resolutionTotals":{},"fromStories":0};export default e;`);
    writeFile(join(d, "e.js"), `const e={nullWork:1};export default e;`); // not distinctive: bare form allowed
    const s = scanner(fx, false);
    s.scanPaths([d]);
    const keys = s.result().findings.flatMap((f) => (f.kind === "key" ? [`${f.source}:${f.key}`] : []));
    expect(keys.sort()).toEqual(
      ["dist/a.json:asrVariants", "dist/b.ndjson:1:heardAsSamples", "dist/c.js:asrVariants", "dist/d.js:fromPeople", "dist/d.js:fromStories", "dist/d.js:nullWork", "dist/d.js:resolutionTotals", "dist/d.js:sampleTitles"].sort(),
    );
  });

  it("fails raw/ folder and file names in any text file", () => {
    fx = makeLayerFixture();
    const d = join(fx.root, "dist2");
    writeFile(join(d, "a.html"), `<p>see data/derived/corpus/raw/people.json</p>`);
    writeFile(join(d, "b.js"), `fetch("/x/people-alias-map.json")`);
    writeFile(join(d, "c.json"), JSON.stringify({ file: "asr-variants.json" }));
    const s = scanner(fx, false);
    s.scanPaths([d]);
    const subs = s.result().findings.flatMap((f) => (f.kind === "substring" ? [f.substring] : []));
    expect(subs.sort()).toEqual(["alias-map", "asr-variants", "corpus/raw/"]);
  });
});

describe("post-pass: raw ban and alias-key assertion", () => {
  it("reads the display fields and the variant dump", () => {
    fx = makeLayerFixture();
    expect(readAsrVariants(fx.data).sort()).toEqual(["Tania", VARIANT, "bitokhn", "באל שעם טויוו"].sort());
    const rules = AliasRules.read(fx.data);
    expect(rules.check({ kind: "person", id: "baal-shem-tov" }, "The  BESHT")).toBeNull();
    expect(rules.check({ kind: "person", id: "baal-shem-tov" }, VARIANT)).toEqual({ rule: "asr-variant" });
    expect(rules.check({ kind: "person", id: "baal-shem-tov" }, "Besht of Mezhibuzh")).toEqual({ rule: "not-display-field" });
    expect(rules.check({ kind: "person", id: "nobody" }, "x")).toEqual({ rule: "unknown-entity" });
    expect(rules.check(null, VARIANT)).toEqual({ rule: "asr-variant" });
    expect(rules.check(null, "Besht of Mezhibuzh")).toBeNull();
    expect(aliasTerms("a|b\nc")).toEqual(["a", "b", "c"]);
    const missing = join(fx.root, "missing");
    expect(() => AliasRules.read(missing)).toThrow(/not found/);
  });

  it("the shipped layer (display fields only) passes, including the layer entity files", () => {
    fx = makeLayerFixture();
    const s = scanner(fx, false);
    s.scanPaths([fx.corpus]);
    const r = s.result();
    expect(r.findings).toEqual([]);
    expect(r.aliasesChecked).toBe(true);
    expect(r.counts.aliasTermsChecked).toBeGreaterThan(10);
  });

  it("a planted ASR variant inside a synonyms list fails post", () => {
    fx = makeLayerFixture();
    writeLayer(fx.layer, { synonyms: [{ kind: "person", id: "baal-shem-tov", terms: ["baal shem tov", "bal shemtoyv"] }] });
    const s = scanner(fx, false);
    s.scanPaths([join(fx.layer, "synonyms.json")]);
    expect(s.result().findings).toEqual([
      { kind: "alias", source: ".corpus/layer/synonyms.json", rule: "asr-variant", entity: "person:baal-shem-tov", field: "synonyms[].terms", count: 1 },
    ]);
  });

  it("a synonym that is not a display field fails post", () => {
    fx = makeLayerFixture();
    writeLayer(fx.layer, { synonyms: [{ kind: "work", id: "tanya", terms: ["tanya", "sefer shel beinonim"] }, { kind: "topic", id: "no-such-topic", terms: ["x"] }] });
    const s = scanner(fx, false);
    s.scanPaths([join(fx.layer, "synonyms.json")]);
    expect(s.result().findings.map((f) => (f.kind === "alias" ? `${f.rule} ${f.entity}` : f.kind))).toEqual([
      "not-display-field work:tanya",
      "unknown-entity topic:no-such-topic",
    ]);
  });

  it("checks layer entity files by file kind, entity docs by kind/id, and Pagefind entity records", () => {
    fx = makeLayerFixture();
    const d = join(fx.root, "out");
    const people = JSON.parse(readFileSync(join(fx.layer, "people.json"), "utf8")) as { people: { aliases: string[] }[] };
    people.people[0]!.aliases.push(VARIANT);
    writeFile(join(d, "layer", "people.json"), JSON.stringify(people));
    writeFile(join(d, "search", "entities.ndjson"), [
      JSON.stringify({ kind: "concept", id: CONCEPT, labels: { en: "Bitachon" }, synonyms: ["bitachon", "bitokhn"] }),
      JSON.stringify({ kind: "work", id: "tanya", labels: { en: "Tanya" }, synonyms: ["Likutei Amarim"] }),
    ].join("\n"));
    // An app's own index row without kind: the raw ban still applies (any entity's display names pass).
    writeFile(join(d, "quick.json"), JSON.stringify([{ k: "p:baal-shem-tov", aliases: ["Tania", "Tanya"] }]));
    // The legacy site-derived aggregate: its names are extraction spellings, not corpus aliases.
    writeFile(join(fx.corpus, "people.json"), JSON.stringify({ people: [{ key: "x", names: [VARIANT] }] }));
    const s = scanner(fx, false);
    s.scanPaths([d, join(fx.corpus, "people.json")]);
    const r = s.result();
    expect(r.findings.map((f) => (f.kind === "alias" ? `${f.source} ${f.rule} ${f.entity ?? "-"} ${f.field}` : f.kind)).sort()).toEqual([
      "out/layer/people.json asr-variant person:baal-shem-tov people[].aliases",
      "out/quick.json asr-variant - [].aliases",
      "out/search/entities.ndjson:1 asr-variant concept:bitachon synonyms",
    ]);
    expect(r.counts.aliasTermsLegacy).toBe(1);

    const check = createPagefindChecker({ aliases: AliasRules.read(fx.data) });
    const rec = (syn: string) => ({ url: "/en/people/baal-shem-tov/", content: "Baal Shem Tov", meta: { title: "Baal Shem Tov", synonyms: syn } });
    expect(check(rec("the Besht|Reb Yisroel Baal Shem Tov"), { kind: "person", id: "baal-shem-tov" })).toEqual([]);
    expect(check(rec(`the Besht|${VARIANT}`), { kind: "person", id: "baal-shem-tov" }).map((f) => (f.kind === "alias" ? f.rule : f.kind))).toEqual(["asr-variant"]);
    expect(check(rec("Mezhibuzh"), { kind: "person", id: "baal-shem-tov" }).map((f) => (f.kind === "alias" ? f.rule : f.kind))).toEqual(["not-display-field"]);
  });

  it("checkEntityAliases checks an emitter's terms directly", () => {
    fx = makeLayerFixture();
    const s = scanner(fx, false);
    s.checkEntityAliases({ kind: "concept", id: CONCEPT }, ["bitochon", "ביטחון"], "emit:concept");
    expect(s.findings).toEqual([]);
    s.checkEntityAliases({ kind: "concept", id: CONCEPT }, ["bitokhn"], "emit:concept");
    expect(s.findings.map((f) => f.kind === "alias" && f.rule)).toEqual(["asr-variant"]);
  });

  it("without the corpus data the alias checks are off and say so", () => {
    fx = makeLayerFixture();
    writeLayer(fx.layer, { synonyms: [{ kind: "person", id: "baal-shem-tov", terms: [VARIANT] }] });
    const s = createLeakScanner({ corpusDir: fx.corpus, transcriptsDir: null, siteDir: fx.site, env: {}, baseDir: fx.root });
    s.scanPaths([fx.layer]);
    const r = s.result();
    expect(r.aliasesChecked).toBe(false);
    expect(r.findings).toEqual([]);
  });
});

describe("post-pass: verbatim corpus text", () => {
  it("fails the 20-token retelling in stories.json by its corpus id and member shiur; 14 is reported, 11 silent", () => {
    fx = makeLayerFixture();
    const s = scanner(fx);
    s.scanPaths([fx.layer]);
    const r = s.result();
    expect(r.findings).toEqual([
      { kind: "verbatim", source: ".corpus/layer/stories.json", itemId: `corpus:story:${STORY}#retelling.en`, shiurId: SHIUR, field: "stories[].retelling.en", runLength: 20 },
    ]);
    const reported = new Map(r.verbatim.map((v) => [v.itemId, v.runLength]));
    expect(reported.get(`corpus:topic:${TOPIC}#description.en`)).toBe(14);
    expect(reported.has(`corpus:thread:${THREAD}#summary.en`)).toBe(false);
    // The other story's members do not hold the run: compared with its member only, it passes.
    expect(reported.has(`corpus:story:${OTHER_STORY}#retelling.en`)).toBe(false);
    expect(r.counts.corpusUnits).toBeGreaterThan(20);
  });

  it("text on an HTML page is checked against the whole corpus; an allow-listed corpus id passes there and in JSON", () => {
    const id = `corpus:story:${STORY}#retelling.en`;
    fx = makeLayerFixture({ allow: [id] });
    const d = join(fx.root, "dist3");
    writeFile(join(d, "en", "stories", STORY, "index.html"), `<p>${FILLER} ${RUN20}</p>`);
    const s = scanner(fx);
    s.scanPaths([d, join(fx.layer, "stories.json")]);
    expect(s.result().findings).toEqual([]);

    fx.cleanup();
    const f2 = makeLayerFixture();
    fx = f2;
    const s2 = scanner(f2);
    writeFile(join(f2.root, "dist4", "en", "stories", STORY, "index.html"), `<p>${FILLER} ${RUN20}</p>`);
    s2.scanPaths([join(f2.root, "dist4")]);
    expect(s2.result().findings.map((f) => f.kind)).toEqual(["verbatim"]);
  });

  it("after pre-pass + suppression (field blanked), the whole .corpus passes and the report greps clean", () => {
    fx = makeLayerFixture();
    const pre = runPrePass(fx.corpus, { transcriptsDir: fx.transcripts, allow: readVerbatimAllow(fx.site) });
    writeFile(join(fx.corpus, "suppress.json"), JSON.stringify(pre));
    // What corpus:build --suppress does to the listed id (packages/corpus/src/layer/suppress.ts).
    const stories = JSON.parse(readFileSync(join(fx.layer, "stories.json"), "utf8")) as { stories: { id: string; retelling: { en: string } }[] };
    stories.stories.find((x) => x.id === STORY)!.retelling.en = "";
    writeFile(join(fx.layer, "stories.json"), JSON.stringify(stories));
    const report = join(fx.root, "post.json");
    const logs: string[] = [];
    const code = main(
      ["post", "--scan", fx.corpus, "--corpus", fx.corpus, "--transcripts", fx.transcripts, "--corpus-data", fx.data, "--site-policy", fx.site, "--report", report],
      (l) => logs.push(l),
    );
    expect(logs.filter((l) => l.includes("FAIL"))).toEqual([]);
    expect(code).toBe(0);
    const text = readFileSync(report, "utf8");
    expectClean(text);
    expectClean(logs.join("\n"));
    expect(logs.join("\n")).toMatch(/alias terms checked/);
  });

  it("CLI fails a planted synonym and prints ids and field paths only", () => {
    fx = makeLayerFixture();
    writeLayer(fx.layer, { synonyms: [{ kind: "person", id: "baal-shem-tov", terms: [VARIANT] }] });
    const logs: string[] = [];
    const report = join(fx.root, "post.json");
    const code = main(["post", "--scan", fx.layer, "--no-verbatim", "--corpus-data", fx.data, "--site-policy", fx.site, "--report", report], (l) => logs.push(l));
    expect(code).toBe(1);
    expect(logs.join("\n")).toMatch(/alias is an ASR variant ×1 of person:baal-shem-tov at synonyms\[\]\.terms/);
    expectClean(logs.join("\n"));
    expectClean(readFileSync(report, "utf8"));
    expect(main(["post", "--scan", fx.layer, "--no-verbatim", "--no-aliases", "--site-policy", fx.site], () => {})).toBe(0);
    expect(main(["post", "--scan", fx.layer, "--no-verbatim", "--corpus-data", join(fx.root, "nope"), "--site-policy", fx.site], () => {})).toBe(2);
  });
});
