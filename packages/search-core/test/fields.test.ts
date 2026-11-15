import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PublicShiur } from "@emunas/corpus/public";
import {
  DOC_FACET_FIELDS,
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
  type MomentRow,
  type SearchDoc,
} from "../src/index.ts";
import { buildSearchOutputs, loadCandidateTopics, readCorpusShiurim, writeSearchOutputs } from "../src/build/index.ts";
import { MINI_POLICY, allKeys, allStrings, buildCorpusTo, miniCopy } from "./helpers.ts";

const SENTINEL = "zqxvplanted keyword phrase";
const PLANTED_IN = "en-parsha-en-nch-01";

function readNdjson<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as T);
}

function setup() {
  const data = miniCopy();
  const ex = join(data, "derived/shiurim", PLANTED_IN, "extraction.json");
  const x = JSON.parse(readFileSync(ex, "utf8")) as { candidateTopics: string[] };
  x.candidateTopics.push(SENTINEL);
  writeFileSync(ex, JSON.stringify(x));
  const corpus = buildCorpusTo(data, MINI_POLICY);
  writeSearchOutputs({ corpusDir: corpus, dataDir: data });
  const docs = readNdjson<SearchDoc>(join(corpus, "search/docs.ndjson"));
  const moments = readNdjson<MomentRow>(join(corpus, "search/moments.ndjson"));
  const shiurim = readCorpusShiurim(corpus);
  return { data, corpus, docs, moments, shiurim };
}

describe("allow-list", () => {
  const { docs, moments, shiurim, data } = setup();
  const byId = new Map<string, PublicShiur>(shiurim.map((s) => [s.id, s]));

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

  it("no forbidden key at any depth", () => {
    const keys = allKeys([docs, moments]);
    for (const k of FORBIDDEN_SEARCH_KEYS) expect(keys.has(k), k).toBe(false);
  });

  it("candidateTopics appear only in the keyword field", () => {
    const hits = allStrings({ docs, moments }).filter((s) => s.value.includes(SENTINEL));
    expect(hits.map((h) => h.path)).toHaveLength(1);
    expect(hits[0]!.path).toMatch(new RegExp(`^docs\\[\\d+\\]\\.${KEYWORD_FIELD}\\[\\d+\\]$`));
    const doc = docs.find((d) => d.id === PLANTED_IN)!;
    expect(doc.keywords).toContain(SENTINEL);
    // folded index text keeps it out of the main content too
    const t = docSearchText(doc);
    expect(t.keywords).toContain(SENTINEL);
    expect(t.content).not.toContain(SENTINEL);
  });

  it("every full shiur's candidateTopics land in its keywords; catalog-only docs have none", () => {
    const topics = loadCandidateTopics(data, shiurim);
    for (const d of docs) {
      const s = byId.get(d.id)!;
      if (s.status === "full") {
        expect(d.keywords.length).toBeGreaterThan(0);
        for (const t of topics.get(d.id) ?? []) expect(d.keywords).toContain(t.trim());
      } else {
        expect(d.keywords).toEqual([]);
        expect(d.oneLiner).toBeNull();
        expect(d.sections).toEqual([]);
      }
    }
  });

  it("keywords are not read for catalog-only shiurim even if offered", () => {
    const catOnly = shiurim.find((s) => s.status === "catalog-only")!;
    const out = buildSearchOutputs([catOnly], new Map([[catOnly.id, ["offered topic"]]]));
    expect(out.docs[0]!.keywords).toEqual([]);
    expect(out.moments).toEqual([]);
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
    // answers and write-up paragraphs are moment-level only
    const answer = s.notes!.questions[0]!.a.en;
    expect(allStrings(d).some((x) => x.value === answer)).toBe(false);
    expect(moments.some((m) => m.kind === "question" && m.body_en === answer)).toBe(true);
    const para = s.notes!.writeup.en[0]!.paragraphs[0]!;
    expect(allStrings(d).some((x) => x.value === para.text)).toBe(false);
    const row = moments.find((m) => m.id === para.id)!;
    expect(row).toMatchObject({ kind: "writeup", body_en: para.text, body_yi: null, t: para.t });
  });
});
