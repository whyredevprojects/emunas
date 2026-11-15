import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fold } from "@emunas/normalize";
import type { LayerPeopleFile, LayerShiurRefs, LayerSynonymsFile, PublicShiur } from "@emunas/corpus/public";
import {
  DOC_FACET_FIELDS,
  ENTITY_DOC_FIELDS,
  ENTITY_DOC_FLAG_FIELDS,
  ENTITY_DOC_KINDS,
  ENTITY_DOC_LABEL_FIELDS,
  FORBIDDEN_SEARCH_KEYS,
  KEYWORD_FIELD,
  MOMENT_ENTITY_FIELDS,
  MOMENT_FACET_FIELDS,
  MOMENT_ROW_FIELDS,
  MOMENT_ROW_KINDS,
  SEARCH_DOC_FIELDS,
  SEARCH_DOC_SECTION_FIELDS,
  SEARCH_DOC_SOURCE_FIELDS,
  docSearchText,
  type EntityDoc,
  type MomentRow,
  type SearchDoc,
} from "../src/index.ts";
import {
  MOMENT_TOPIC_SALIENCE,
  buildSearchDoc,
  buildSearchOutputs,
  readCorpusShiurim,
  readSearchLayerInput,
  writeSearchOutputs,
} from "../src/build/index.ts";
import { MINI_POLICY, PKG, allKeys, allStrings, buildCorpusTo, miniCopy, readNdjson } from "./helpers.ts";

/** Planted in an extraction's retired topic list: it must not reach any output. */
const SENTINEL = "zqxvplanted keyword phrase";
const PLANTED_IN = "en-parsha-en-nch-01";

function setup() {
  const data = miniCopy();
  const ex = join(data, "derived/shiurim", PLANTED_IN, "extraction.json");
  const x = JSON.parse(readFileSync(ex, "utf8")) as Record<string, unknown>;
  x["candidateTopics"] = [...(Array.isArray(x["candidateTopics"]) ? (x["candidateTopics"] as string[]) : []), SENTINEL];
  writeFileSync(ex, JSON.stringify(x));
  const corpus = buildCorpusTo(data, MINI_POLICY);
  const result = writeSearchOutputs({ corpusDir: corpus, dataDir: data, policyDir: MINI_POLICY });
  const docs = readNdjson<SearchDoc>(join(corpus, "search/docs.ndjson"));
  const moments = readNdjson<MomentRow>(join(corpus, "search/moments.ndjson"));
  const entities = readNdjson<EntityDoc>(join(corpus, "search/entities.ndjson"));
  const shiurim = readCorpusShiurim(corpus);
  const layerDir = join(corpus, "layer");
  const synonyms = JSON.parse(readFileSync(join(layerDir, "synonyms.json"), "utf8")) as LayerSynonymsFile;
  const people = JSON.parse(readFileSync(join(layerDir, "people.json"), "utf8")) as LayerPeopleFile;
  const refs = (id: string): LayerShiurRefs | null => {
    try {
      return JSON.parse(readFileSync(join(layerDir, "shiur", `${id}.json`), "utf8")) as LayerShiurRefs;
    } catch {
      return null;
    }
  };
  return { data, corpus, result, docs, moments, entities, shiurim, synonyms, people, refs };
}

describe("search outputs on the corpus layer (mini corpus)", () => {
  const { corpus, result, docs, moments, entities, shiurim, synonyms, people, refs } = setup();
  const byId = new Map<string, PublicShiur>(shiurim.map((s) => [s.id, s]));
  const synonymsOf = new Map(synonyms.synonyms.map((s) => [`${s.kind}:${s.id}`, s.terms]));
  const topicTree = (
    JSON.parse(readFileSync(join(corpus, "layer/topics.json"), "utf8")) as { tree: { id: string; label: { en: string; yi: string; he?: string } }[] }
  ).tree;
  const topicLabels = new Map(topicTree.map((t) => [t.id, [t.label.en, t.label.yi, t.label.he ?? ""].map(fold)]));

  it("used the layer and checked its synonyms", () => {
    expect(result.layer).toBe(true);
    expect(result.synonymsChecked).toBe(true);
    expect(result.entities).toBeGreaterThan(50);
    expect(result.keywordsFrom).toBeGreaterThan(10);
  });

  it("one doc per in-scope shiur, moments only for full shiurim", () => {
    expect(docs.map((d) => d.id).sort()).toEqual(shiurim.map((s) => s.id).sort());
    expect(moments.length).toBeGreaterThan(100);
    for (const m of moments) expect(byId.get(m.shiurId)?.status).toBe("full");
  });

  it("every SearchDoc has exactly the allow-listed fields, at every level", () => {
    for (const d of docs) {
      expect(Object.keys(d)).toEqual([...SEARCH_DOC_FIELDS]);
      expect(Object.keys(d.facets)).toEqual([...DOC_FACET_FIELDS]);
      for (const s of d.sections) expect(Object.keys(s)).toEqual([...SEARCH_DOC_SECTION_FIELDS]);
      for (const s of d.sources) expect(Object.keys(s)).toEqual([...SEARCH_DOC_SOURCE_FIELDS]);
      for (const l of [d.oneLiner, d.abstract, ...d.keyPoints, ...d.storyTitles, ...d.questions, ...d.sections.flatMap((s) => [s.title, s.summary])]) {
        if (l !== null) expect(Object.keys(l)).toEqual(["en", "yi"]);
      }
    }
  });

  it("every MomentRow has exactly the allow-listed fields", () => {
    const kinds = new Set<string>();
    for (const m of moments) {
      expect(Object.keys(m)).toEqual([...MOMENT_ROW_FIELDS]);
      expect(Object.keys(m.entities)).toEqual([...MOMENT_ENTITY_FIELDS]);
      expect(Object.keys(m.facets)).toEqual([...MOMENT_FACET_FIELDS]);
      expect(typeof m.t).toBe("number");
      expect(m.id.startsWith(`${m.shiurId}~`)).toBe(true);
      kinds.add(m.kind);
    }
    expect([...kinds].sort()).toEqual([...MOMENT_ROW_KINDS].sort());
    expect(new Set(moments.map((m) => m.id)).size).toBe(moments.length);
  });

  it("every EntityDoc has exactly the allow-listed fields, at every level", () => {
    expect(entities.length).toBeGreaterThan(50);
    for (const e of entities) {
      expect(Object.keys(e)).toEqual([...ENTITY_DOC_FIELDS]);
      expect(Object.keys(e.labels)).toEqual([...ENTITY_DOC_LABEL_FIELDS]);
      expect(Object.keys(e.listed)).toEqual([...ENTITY_DOC_FLAG_FIELDS]);
      expect(Object.keys(e.pages)).toEqual([...ENTITY_DOC_FLAG_FIELDS]);
      expect(ENTITY_DOC_KINDS).toContain(e.kind);
      expect(e.listed.quiet || e.listed.live).toBe(true);
      expect(e.count).toBeGreaterThan(0);
    }
    expect(new Set(entities.map((e) => `${e.kind}:${e.id}`)).size).toBe(entities.length);
    expect(new Set(entities.map((e) => e.kind))).toEqual(new Set(ENTITY_DOC_KINDS));
  });

  it("no forbidden key at any depth, and no candidateTopics anywhere", () => {
    const keys = allKeys([docs, moments, entities]);
    for (const k of FORBIDDEN_SEARCH_KEYS) expect(keys.has(k), k).toBe(false);
    expect(allStrings({ docs, moments, entities }).filter((s) => s.value.includes(SENTINEL))).toEqual([]);
    for (const f of readdirSync(join(corpus, "search"))) {
      expect(readFileSync(join(corpus, "search", f), "utf8"), f).not.toContain("candidateTopics");
      expect(readFileSync(join(corpus, "search", f), "utf8"), f).not.toContain(SENTINEL);
    }
  });

  it("keywords are the shiur's topic labels and topic aliases only", () => {
    let withKeywords = 0;
    for (const d of docs) {
      const s = byId.get(d.id)!;
      if (s.status !== "full") {
        expect(d.keywords).toEqual([]);
        expect(d.oneLiner).toBeNull();
        expect(d.sections).toEqual([]);
        continue;
      }
      if (d.keywords.length > 0) withKeywords++;
      const allowed = new Set(d.facets.topics.flatMap((id) => [...(topicLabels.get(id) ?? []), ...(synonymsOf.get(`topic:${id}`) ?? [])]));
      for (const k of d.keywords) expect(allowed.has(fold(k)), `${d.id}: ${k}`).toBe(true);
      // every topic of the shiur contributes its label
      for (const id of d.facets.topics) expect(d.keywords.map(fold)).toContain(fold(topicTree.find((t) => t.id === id)!.label.en));
      // keywords are deduplicated after folding
      expect(new Set(d.keywords.map(fold)).size).toBe(d.keywords.length);
    }
    expect(withKeywords).toBeGreaterThan(10);
  });

  it("keywords reach only the keyword field (and the low-weight keyword text)", () => {
    const d = docs.find((x) => x.keywords.length > 0)!;
    const alias = d.keywords[d.keywords.length - 1]!;
    const hits = allStrings({ docs: [d], moments: moments.filter((m) => m.shiurId === d.id) }).filter((s) => s.value === alias);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.path).toMatch(new RegExp(`^docs\\[0\\]\\.${KEYWORD_FIELD}\\[\\d+\\]$`));
    expect(docSearchText(d).keywords).toContain(fold(alias));
  });

  it("facets and moment entities are corpus ids from the layer refs, with topics", () => {
    const ids = new Set(entities.map((e) => `${e.kind}:${e.id}`));
    const kindOf = { works: "work", people: "person", concepts: "concept", topics: "topic" } as const;
    let checked = 0;
    for (const d of docs) {
      const s = byId.get(d.id)!;
      const r = refs(d.id);
      if (s.status !== "full" || r === null) {
        expect([d.facets.works, d.facets.people, d.facets.concepts, d.facets.topics]).toEqual([[], [], [], []]);
        continue;
      }
      checked++;
      for (const k of ["works", "people", "concepts", "topics"] as const) {
        for (const id of d.facets[k]) expect(ids.has(`${kindOf[k]}:${id}`), `${d.id} ${k} ${id}`).toBe(true);
      }
      expect(d.facets.works).toEqual(r.workIds.filter((id) => ids.has(`work:${id}`)).sort());
      expect(d.facets.topics).toEqual(
        [...new Set([...r.topics.map((t) => t.id), ...r.chapters.flatMap((c) => c.topicIds)])].filter((id) => ids.has(`topic:${id}`)).sort(),
      );
    }
    expect(checked).toBeGreaterThan(10);
    for (const m of moments) {
      for (const k of ["works", "people", "concepts", "topics"] as const) {
        for (const id of m.entities[k]) expect(ids.has(`${kindOf[k]}:${id}`), `${m.id} ${k} ${id}`).toBe(true);
      }
      const r = refs(m.shiurId);
      if (r === null) continue;
      if (m.kind === "section") {
        const idx = Number(m.id.split("~s")[1]);
        const ch = r.chapters.find((c) => c.idx === idx);
        expect(m.entities.topics).toEqual((ch?.topicIds ?? []).filter((id) => ids.has(`topic:${id}`)).sort());
      } else {
        expect(m.entities.topics).toEqual(
          r.topics.filter((t) => t.salience >= MOMENT_TOPIC_SALIENCE && ids.has(`topic:${t.id}`)).map((t) => t.id).sort(),
        );
      }
    }
    expect(moments.some((m) => m.kind === "section" && m.entities.topics.length > 0)).toBe(true);
    expect(moments.some((m) => m.kind === "story" && m.entities.people.length > 0)).toBe(true);
    expect(moments.some((m) => m.kind === "writeup" && m.entities.works.length > 0)).toBe(true);
    expect(moments.some((m) => m.kind === "section" && m.entities.concepts.length > 0)).toBe(true);
  });

  it("EntityDoc synonyms are the layer's synonyms.json terms, and never other or excluded people", () => {
    for (const e of entities) expect(e.synonyms).toEqual(synonymsOf.get(`${e.kind}:${e.id}`) ?? []);
    const personById = new Map(people.people.map((p) => [p.id, p]));
    for (const e of entities.filter((x) => x.kind === "person")) {
      const p = personById.get(e.id)!;
      expect(p.type).not.toBe("other");
      expect(p.excluded).toBeNull();
      expect(e.listed).toEqual(p.listed);
    }
    const others = people.people.filter((p) => p.type === "other" || p.excluded !== null).map((p) => p.id);
    expect(others.length).toBeGreaterThan(0);
    for (const id of others) expect(entities.some((e) => e.kind === "person" && e.id === id), id).toBe(false);
    // a concept merged into a topic stays findable, pointing at the topic, with no page of its own
    const merged = entities.filter((e) => e.kind === "concept" && e.mergedInto !== null);
    expect(merged.length).toBeGreaterThan(0);
    for (const e of merged) {
      expect(entities.some((t) => t.kind === "topic" && t.id === e.mergedInto)).toBe(true);
      expect(e.pages).toEqual({ quiet: false, live: false });
    }
  });

  it("catalog-only shiurim get no keywords or rows even with a layer", () => {
    const catOnly = shiurim.find((s) => s.status === "catalog-only")!;
    const out = buildSearchOutputs([catOnly], readSearchLayerInput(corpus, shiurim));
    expect(out.docs[0]!.keywords).toEqual([]);
    expect(out.docs[0]!.facets.topics).toEqual([]);
    expect(out.moments).toEqual([]);
  });

  it("the old call shape (no layer, a legacy extra key) still builds, ignoring the extra key", () => {
    const s = shiurim.find((x) => x.id === PLANTED_IN)!;
    const legacy = { shiur: s, ["candidate" + "Topics"]: [SENTINEL] };
    const d = buildSearchDoc(legacy);
    expect(d.keywords).toEqual([]);
    expect(allStrings(d).some((x) => x.value.includes(SENTINEL))).toBe(false);
    expect(d.hash).toBe(buildSearchDoc({ shiur: s }).hash);
  });

  it("indexes the catalog, labels and notes text it should", () => {
    const d = docs.find((x) => x.id === "yi-parshas-hashavua-brshys-01")!;
    const s = byId.get(d.id)!;
    expect(d.titleOriginal).toBe(s.catalog.titleOriginal);
    expect(d.parsha).toEqual(expect.arrayContaining(["בראשית", "Bereishis"]));
    expect(d.years).toEqual(expect.arrayContaining(["5736", 'תשל"ו']));
    expect(d.sections).toHaveLength(s.notes!.chapters.length);
    expect(d.questions[0]).toEqual(s.notes!.questions[0]!.q);
    expect(d.people).toContain("the Rambam");
    expect(d.sources[0]).toEqual({ work: "Mishnah Sukkah", ref: "Mishnah Sukkah 2:9" });
    const answer = s.notes!.questions[0]!.a.en;
    expect(allStrings(d).some((x) => x.value === answer)).toBe(false);
    expect(moments.some((m) => m.kind === "question" && m.body_en === answer)).toBe(true);
    const para = s.notes!.writeup.en[0]!.paragraphs[0]!;
    expect(allStrings(d).some((x) => x.value === para.text)).toBe(false);
    const row = moments.find((m) => m.id === para.id)!;
    expect(row).toMatchObject({ kind: "writeup", body_en: para.text, body_yi: null, t: para.t });
  });
});

describe("no candidateTopics in the package (grep)", () => {
  it("src names it only in the forbidden-key list; nothing reads extraction.json", () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    for (const f of walk(join(PKG, "src"))) {
      const text = readFileSync(f, "utf8");
      const lines = text.split("\n").filter((l) => l.includes("candidateTopics"));
      if (f.endsWith("/src/types.ts")) expect(lines.map((l) => l.trim())).toEqual(['"candidateTopics",']);
      else expect(lines, f).toEqual([]);
      expect(text, f).not.toMatch(/extraction\.json|loadShiurFiles|createDataReader/);
      // (the corpus raw folder itself is an ESLint-restricted literal outside corpus-guard)
      expect(text, f).not.toMatch(/asr-variants|alias-map|sections\.jsonl/);
    }
  });
});
