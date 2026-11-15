/**
 * The corpus-layer part of the Live emit (C1.7) on the @emunas/corpus mini corpus: every new file
 * validates strictly, a page file exists exactly when its Live page flag is set, every link target
 * with a page flag has its file, generated layer text stays out of the first-load files, the
 * glossary shards and redirects resolve, nothing pairs shiurim across languages, and the featured
 * mix follows the owner policy (D7).
 */
import { describe, expect, it } from "vitest";
import { glossaryShardFor } from "../app/data/paths.ts";
import type {
  BuildFile,
  CorpusFile,
  DataKind,
  FacetsFile,
  GlossaryShardFile,
  RedirectsFile,
  ShiurFile,
  StoriesIndexFile,
  StoryFile,
  ThreadFile,
  TodayFile,
  TopicFile,
  TopicMomentsFile,
  TopicsFile,
} from "../app/data/types.ts";
import { TOPIC_FIRST_MOMENTS, TOPIC_MOMENTS_PAGE_SIZE } from "../app/data/types.ts";
import { brotliSize } from "./budgets.ts";
import { readCorpusInput, type CorpusInput } from "./corpus-input.ts";
import { CORPUS_LIMITS, shardByPrefix } from "./emit-corpus.ts";
import { emitLiveData, type EmittedFiles } from "./emit.ts";
import { kindOfFile, validateFile } from "./schemas.ts";
import { GENERATED_AT, MINI_DATA, MINI_POLICY, allKeys, buildCorpusTo } from "./test-helpers.ts";

const corpusDir = buildCorpusTo(MINI_DATA, MINI_POLICY);
const input = readCorpusInput(corpusDir);
const layer = input.layer!;
const files = emitLiveData(input, { generatedAt: GENERATED_AT });
const get = <T>(f: string, from: EmittedFiles = files): T => {
  const x = from.get(f);
  if (x === undefined) throw new Error(`not emitted: ${f}`);
  return x as T;
};
const under = (prefix: string, from: EmittedFiles = files) => [...from.keys()].filter((f) => f.startsWith(prefix));
const clone = <T>(x: T): T => structuredClone(x);

/** The mini input with a changed layer (thread pages, an occasion topic), for cases the mini corpus lacks. */
function withLayer(edit: (l: NonNullable<CorpusInput["layer"]>) => void): CorpusInput {
  const copy = { ...input, layer: clone(layer) };
  edit(copy.layer);
  return copy;
}

describe("corpus-layer files on the mini corpus", () => {
  it("the layer is on and every new file kind is emitted and validates", () => {
    const kinds = new Set([...files.keys()].map((f) => kindOfFile(f)));
    for (const k of ["topics", "topic", "story", "storiesIndex", "glossary", "redirects", "exploreEntities"] as DataKind[]) {
      expect(kinds.has(k), k).toBe(true);
    }
    for (const [f, body] of files) expect(validateFile(f, body), f).toBeNull();
  });

  it("schemas are strict for every new file: an unknown key fails", () => {
    const thread = emitLiveData(withLayer((l) => (l.threads![0]!.page = true)), { generatedAt: GENERATED_AT });
    const samples: [string, unknown][] = [
      ["topics.json", files.get("topics.json")],
      [under("topic/").find((f) => !f.includes(".moments-"))!, null],
      [under("topic/").find((f) => f.includes(".moments-"))!, null],
      [under("story/")[0]!, null],
      ["stories-index.json", null],
      [under("glossary/")[0]!, null],
      ["redirects.json", null],
      ["explore/entities.json", null],
      ["today.json", null],
      ["build.json", null],
    ];
    const threadFile = under("thread/", thread)[0]!;
    for (const [f] of samples) {
      const body = clone(files.get(f)) as unknown as Record<string, unknown>;
      expect(validateFile(f, body), f).toBeNull();
      expect(validateFile(f, { ...body, extra: 1 }), f).not.toBeNull();
    }
    const t = clone(thread.get(threadFile)) as ThreadFile & { members: Record<string, unknown>[] };
    expect(validateFile(threadFile, t)).toBeNull();
    t.members[0]!["heardAs"] = "x";
    expect(validateFile(threadFile, t)?.issues[0]?.path).toBe("members.0.heardAs");
    // A shiur's corpus block is strict too.
    const sf = under("shiur/").find((f) => (files.get(f) as ShiurFile).corpus)!;
    const s = clone(files.get(sf)) as ShiurFile & { corpus: Record<string, unknown> };
    s.corpus["aliases"] = ["x"];
    expect(validateFile(sf, s)?.issues[0]?.path).toBe("corpus.aliases");
  });

  it("a page file exists exactly when the Live page flag is set", () => {
    const topicFiles = new Set(under("topic/").filter((f) => !f.includes(".moments-")));
    expect(topicFiles).toEqual(new Set(layer.topics.filter((t) => t.count > 0 && t.pages.live).map((t) => `topic/${t.id}.json`)));
    expect(new Set(under("story/"))).toEqual(new Set((layer.stories ?? []).filter((s) => s.pages.live).map((s) => `story/${s.id}.json`)));
    expect(under("thread/")).toEqual([]);
    expect((layer.threads ?? []).some((t) => t.page)).toBe(false);
    // With thread pages in the layer, exactly those threads get a file.
    const flipped = withLayer((l) => {
      for (const t of l.threads!.slice(0, 2)) t.page = true;
    });
    const out = emitLiveData(flipped, { generatedAt: GENERATED_AT });
    expect(new Set(under("thread/", out))).toEqual(new Set(flipped.layer!.threads!.filter((t) => t.page).map((t) => `thread/${t.id}.json`)));
    for (const f of under("thread/", out)) {
      const t = get<ThreadFile>(f, out);
      expect(t.members.length).toBeGreaterThan(0);
      for (const m of t.members) expect(m.momentId.startsWith(`${m.shiurId}~i`)).toBe(true);
    }
  });

  it("every link target with a page flag has its file (shiur refs, topics, stories, glossary, redirects)", () => {
    const has = (f: string) => files.has(f);
    for (const f of under("shiur/")) {
      const c = get<ShiurFile>(f).corpus;
      if (!c) continue;
      for (const id of Object.keys(c.topicLabels)) expect(has(`topic/${id}.json`), id).toBe(true);
      for (const t of c.terms) expect(has(`entity/c/${t.id}.json`), t.id).toBe(t.page);
      for (const x of c.sources) expect(has(`work/${x.workId}.json`), x.workId).toBe(x.page);
      for (const x of c.stories) expect(has(`story/${x.storyId}.json`), x.storyId).toBe(x.page);
      for (const x of c.insights) expect(has(`thread/${x.threadId}.json`), x.threadId).toBe(x.page);
    }
    for (const f of under("topic/").filter((x) => !x.includes(".moments-"))) {
      const t = get<TopicFile>(f);
      for (const b of t.breadcrumb) expect(has(`topic/${b.id}.json`)).toBe(true);
      for (const c of t.children) expect(has(`topic/${c.id}.json`)).toBe(true);
      for (const c of t.coTopics) expect(has(`topic/${c.id}.json`)).toBe(true);
      for (const x of t.threads) expect(has(`thread/${x.id}.json`)).toBe(x.page);
      for (const x of t.stories) expect(has(`story/${x.id}.json`)).toBe(x.page);
      if (t.person) expect(has(`entity/p/${t.person.id}.json`)).toBe(true);
      if (t.work) expect(has(`work/${t.work.id}.json`)).toBe(true);
      for (const h of t.hubs) expect(has(`shiur/${h.id}.json`)).toBe(true);
    }
    for (const s of get<StoriesIndexFile>("stories-index.json").stories) {
      expect(has(`story/${s.id}.json`), s.id).toBe(s.page);
      for (const p of s.people) expect(has(`entity/p/${p}.json`), p).toBe(true);
    }
    for (const f of under("story/")) {
      for (const p of get<StoryFile>(f).people) if ("id" in p) expect(has(`entity/p/${p.id}.json`)).toBe(p.page);
    }
    const build = get<BuildFile>("build.json");
    for (const f of under("glossary/")) {
      for (const c of get<GlossaryShardFile>(f).concepts) {
        expect(has(`entity/c/${c.id}.json`), c.id).toBe(c.page);
        if (c.topicId) expect(has(`topic/${c.topicId}.json`)).toBe(true);
        expect(`glossary/${glossaryShardFor(c.id, build.glossaryShards)}.json`).toBe(f);
      }
    }
    const dir = { t: "topic", c: "entity/c", p: "entity/p", seforim: "work", maasios: "story", th: "thread" } as const;
    for (const [route, m] of Object.entries(get<RedirectsFile>("redirects.json").routes)) {
      for (const [from, to] of Object.entries(m)) {
        // The old address is not itself a page; the target is.
        expect(has(`${dir[route as keyof typeof dir]}/${from}.json`), `${route}/${from}`).toBe(false);
        if (to) expect(has(`${dir[to.kind]}/${to.id}.json`), `${route}/${from} → ${to.kind}/${to.id}`).toBe(true);
      }
    }
  });

  it("topic tree, topic files and moment pages are consistent", () => {
    const tree = get<TopicsFile>("topics.json").topics;
    const seen = new Set<string>();
    for (const [id, parent, en, yi, he, count] of tree) {
      if (parent !== null) expect(seen.has(parent), `${id}: parent first`).toBe(true);
      seen.add(id);
      expect(en.length + yi.length).toBeGreaterThan(0);
      expect(he === null || he !== yi).toBe(true);
      const t = get<TopicFile>(`topic/${id}.json`);
      expect(t.count).toBe(count);
      expect(t.label.en).toBe(en);
      expect(t.moments.length).toBeLessThanOrEqual(TOPIC_FIRST_MOMENTS);
      expect(t.momentPages).toBe(Math.ceil(Math.max(0, t.momentTotal - TOPIC_FIRST_MOMENTS) / TOPIC_MOMENTS_PAGE_SIZE));
      const paged: string[] = [];
      for (let n = 1; n <= t.momentPages; n++) paged.push(...get<TopicMomentsFile>(`topic/${id}.moments-${n}.json`).moments.map((m) => m.id));
      expect(files.has(`topic/${id}.moments-${t.momentPages + 1}.json`)).toBe(false);
      const all = [...t.moments.map((m) => m.id), ...paged];
      expect(all).toHaveLength(t.momentTotal);
      expect(new Set(all).size).toBe(all.length);
      // One section per shiur until the pool runs out: the first round has distinct shiurim.
      const first = t.moments.slice(0, t.momentShiurim).map((m) => m.shiurId);
      expect(new Set(first).size).toBe(first.length);
      for (const m of t.moments) expect(m.id).toMatch(new RegExp(`^${m.shiurId}~s\\d+$`, "u"));
    }
    expect(tree.length).toBe(layer.topics.filter((t) => t.count > 0 && t.pages.live).length);
  });

  it("generated layer text stays out of corpus.json, facets.json, today.json and the shiur files", () => {
    const generated = [
      ...[...layer.topicDetail.values()].flatMap((d) => (d.description ? [d.description.en, d.description.yi] : [])),
      ...(layer.stories ?? []).flatMap((s) => [s.retelling.en, s.retelling.yi]),
      ...(layer.threads ?? []).flatMap((t) => [t.summary.en, t.summary.yi]),
      ...layer.concepts.flatMap((c) => [c.definition.en, c.definition.yi]),
      ...[...layer.series.values()].flatMap((x) => [x.overview.en, x.overview.yi]),
    ].filter((x) => x.length > 30);
    // A merged text can equal the shiur's own notes (a story told once is retold as it was told); that
    // is the shiur's text, which its file carries anyway.
    const own = JSON.stringify(input.shiurim.map((x) => x.notes ?? null));
    const layerOnly = generated.filter((g) => !own.includes(JSON.stringify(g).slice(1, -1)));
    expect(layerOnly.length).toBeGreaterThan(50);
    const firstLoad = ["corpus.json", "facets.json", "today.json", ...under("shiur/")];
    for (const f of firstLoad) {
      const text = JSON.stringify(files.get(f));
      for (const g of layerOnly) expect(text.includes(JSON.stringify(g).slice(1, -1)), `${f} carries layer text`).toBe(false);
    }
    // The topic file does carry its description; the glossary carries definitions.
    const withDesc = [...layer.topicDetail.values()].find((d) => d.description)!;
    expect(get<TopicFile>(`topic/${withDesc.id}.json`).description).toEqual(withDesc.description);
  });

  it("publishes no alias, synonym, ASR or pairing field anywhere", () => {
    for (const [f, body] of files) {
      const keys = allKeys(body);
      for (const k of ["aliases", "synonyms", "transliterations", "terms_", "asrVariants", "heardAsSamples", "sibling", "counterpart"]) {
        expect(keys.has(k), `${f}: ${k}`).toBe(false);
      }
    }
  });

  it("the shiur file is self-contained: series title, related titles and labelled corpus refs", () => {
    const corpus = get<CorpusFile>("corpus.json");
    for (const f of under("shiur/")) {
      const s = get<ShiurFile>(f);
      const named = [...s.related.sameOccasion, s.related.prev, s.related.next, ...s.related.neighbors.map((n) => n.shiurId)];
      for (const id of named) if (id && id !== s.id) expect(s.related.titles[id]?.title, `${f} → ${id}`).toBe(corpus.shiurim.find((r) => r.id === id)!.title);
      if (s.series) expect(s.seriesTitle).not.toBeNull();
      if (s.status !== "full") expect(s.corpus).toBeUndefined();
    }
    const full = under("shiur/").map((f) => get<ShiurFile>(f)).filter((s) => s.corpus);
    expect(full.length).toBe(layer.refs.size);
    const sample = full.find((s) => s.corpus!.chapters.length > 0)!;
    for (const c of sample.corpus!.chapters) for (const id of c.topicIds) expect(sample.corpus!.topicLabels[id]?.label.en).toBeTruthy();
    expect(full.some((s) => s.corpus!.terms.length > 0)).toBe(true);
    expect(full.some((s) => s.corpus!.stories.length > 0)).toBe(true);
  });

  it("glossary shards hold every concept with shiurim once, by longest prefix, each under its budget", () => {
    const build = get<BuildFile>("build.json");
    const ids = under("glossary/").flatMap((f) => get<GlossaryShardFile>(f).concepts.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(layer.concepts.filter((c) => c.count > 0).map((c) => c.id)));
    expect(build.glossaryShards.map((s) => `glossary/${s}.json`).sort()).toEqual(under("glossary/").sort());
    for (const f of under("glossary/")) {
      expect(brotliSize(JSON.stringify(files.get(f)))).toBeLessThanOrEqual(8 * 1024);
      for (const c of get<GlossaryShardFile>(f).concepts) expect(c.examples.length).toBeLessThanOrEqual(CORPUS_LIMITS.glossaryExamples);
    }
  });

  it("redirects: retired corpus ids, merged concepts and legacy keys, in one hop", () => {
    const r = get<RedirectsFile>("redirects.json").routes;
    // The pipeline's story redirect (plan C1.2 acceptance 4).
    expect(r.maasios["the-sanzer-rav-and-the-business-competitor"]).toEqual(
      files.has("story/the-divrei-chaim-and-the-man-who-shamed.json")
        ? { kind: "maasios", id: "the-divrei-chaim-and-the-man-who-shamed" }
        : null,
    );
    // A concept merged into a topic: /c/<id> goes to the topic page.
    const merged = layer.concepts.find((c) => c.mergedIntoTopic && files.has(`topic/${c.mergedIntoTopic}.json`))!;
    expect(r.c[merged.id]).toEqual({ kind: "t", id: merged.mergedIntoTopic });
    // Legacy keys go to a page or (null) to the index; never to themselves.
    expect(Object.keys(r.p).length + Object.keys(r.c).length + Object.keys(r.seforim).length).toBeGreaterThan(10);
    for (const m of Object.values(r)) for (const [from, to] of Object.entries(m)) if (to) expect(to.id === from && to.kind === "p").toBe(false);
    expect(Object.values(r.p).some((x) => x === null)).toBe(true);
  });

  it("explore/entities.json holds corpus-id arrays per summarized shiur; corpus.json keeps them until C3.1", () => {
    const ex = get<{ shiurim: Record<string, { topics: string[]; people: string[]; concepts: string[]; works: string[] }> }>("explore/entities.json");
    const facets = get<FacetsFile>("facets.json");
    const corpus = get<CorpusFile>("corpus.json");
    expect(Object.keys(ex.shiurim).length).toBeGreaterThan(10);
    for (const [id, e] of Object.entries(ex.shiurim)) {
      for (const t of e.topics) expect(files.has(`topic/${t}.json`)).toBe(true);
      for (const p of e.people) expect(facets.person[p]).toBeDefined();
      for (const c of e.concepts) expect(facets.concept[c]).toBeDefined();
      for (const w of e.works) expect(facets.work[w]).toBeDefined();
      const row = corpus.shiurim.find((r) => r.id === id)!;
      expect(row.entities).toEqual({ works: e.works, people: e.people, concepts: e.concepts });
    }
    // No type-other person and no below-threshold entity is a facet.
    for (const p of layer.people) if (p.type === "other" || !p.pages.live) expect(facets.person[p.id], p.id).toBeUndefined();
  });

  it("no layer: the emit still works, with empty corpus-layer files", () => {
    const out = emitLiveData({ ...input, layer: null }, { generatedAt: GENERATED_AT });
    for (const [f, body] of out) expect(validateFile(f, body), f).toBeNull();
    expect(get<TopicsFile>("topics.json", out).topics).toEqual([]);
    expect(get<StoriesIndexFile>("stories-index.json", out).stories).toEqual([]);
    expect(get<BuildFile>("build.json", out).glossaryShards).toEqual([]);
    expect(Object.keys(get<FacetsFile>("facets.json", out).person)).toEqual([]);
    expect(under("entity/p/", out)).toEqual([]);
    expect(under("shiur/", out).every((f) => get<ShiurFile>(f, out).corpus === undefined)).toBe(true);
  });
});

describe("the occasion mix in today.json (D7)", () => {
  // The mini corpus maps no occasion to a topic; give Noach the topic with the most tagged sections.
  const topicId = [...layer.topicDetail.values()].sort((a, b) => b.grades.main.length - a.grades.main.length)[0]!.id;
  const mapped = withLayer((l) => {
    l.occasionTopics = [{ key: "noach", kind: "parsha", topicId, source: "derived", share: 0.6 }];
  });

  it("carries the first sections of the occasion's topic, with titles, and a card for each shiur", () => {
    const today = get<TodayFile>("today.json", emitLiveData(mapped, { generatedAt: GENERATED_AT }));
    const mix = today.occasions["noach"]!.mix!;
    expect(mix.topicId).toBe(topicId);
    expect(mix.first.length).toBeGreaterThan(0);
    expect(mix.first.length).toBeLessThanOrEqual(3);
    for (const m of mix.first) {
      expect(m.title.en.length).toBeGreaterThan(0);
      expect(today.cards[m.id.split("~")[0]!]).toBeDefined();
    }
    expect(mix.sections).toBeGreaterThanOrEqual(mix.first.length);
    for (const [k, o] of Object.entries(today.occasions)) if (k !== "noach") expect(o.mix).toBeNull();
  });

  it("leaves out excluded topics and shiurim mostly by another speaker", () => {
    const excluded = emitLiveData(mapped, { generatedAt: GENERATED_AT, featured: { maxOtherSpeakerShare: 0.5, excludeTopicIds: [topicId] } });
    expect(get<TodayFile>("today.json", excluded).occasions["noach"]!.mix).toBeNull();
    const base = get<TodayFile>("today.json", emitLiveData(mapped, { generatedAt: GENERATED_AT })).occasions["noach"]!.mix!;
    const firstShiur = base.first[0]!.id.split("~")[0]!;
    const speaker = withLayer((l) => {
      l.occasionTopics = [{ key: "noach", kind: "parsha", topicId, source: "derived", share: 0.6 }];
      l.refs.get(firstShiur)!.otherSpeakerShare = 0.9;
    });
    const mix = get<TodayFile>("today.json", emitLiveData(speaker, { generatedAt: GENERATED_AT })).occasions["noach"]!.mix;
    for (const m of mix?.first ?? []) expect(m.id.startsWith(`${firstShiur}~`)).toBe(false);
  });
});

describe("shardByPrefix", () => {
  const items = ["a", "ab", "abc", "abd", "b", "ba", "bb", "c"].map((id) => ({ id }));

  it("keeps one-character shards when they fit", () => {
    expect(shardByPrefix(items, () => true).map(([p, xs]) => [p, xs.map((x) => x.id)])).toEqual([
      ["a", ["a", "ab", "abc", "abd"]],
      ["b", ["b", "ba", "bb"]],
      ["c", ["c"]],
    ]);
  });

  it("splits a shard that does not fit into longer prefixes; an id equal to its prefix stays", () => {
    const shards = shardByPrefix(items, (xs) => xs.length <= 2);
    const ids = shards.flatMap(([, xs]) => xs.map((x) => x.id));
    expect(ids.sort()).toEqual(items.map((x) => x.id).sort());
    for (const [p, xs] of shards) {
      expect(xs.length).toBeLessThanOrEqual(2);
      for (const x of xs) expect(glossaryShardFor(x.id, shards.map(([s]) => s))).toBe(p);
    }
  });
});
