/**
 * Quiet search (W3.5, corpus-wave-plan C3.7): the Pagefind records (scripts/build-search.ts) and the
 * pure parts of the glue (src/scripts/search.ts). Browser behaviour (no-JS fallback, לג בעומר = lag
 * baomer, glue size, axe) is in test/e2e/search.test.ts.
 *
 * Runs on the @emunas/corpus mini corpus, built with its corpus layer, so there are topic keywords
 * and entity records. The Pagefind index cannot be queried from Node, so `localPagefind` stands in
 * for it over the very records the build writes: a record matches when every folded query token
 * is one of its content tokens, like Pagefind's AND of whole words, filtered by `filters`.
 *
 * The transcript folder and the corpus data folder are reached through @emunas/corpus-guard (the
 * only site package that reads them); no test here reads the ASR variant dump.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCorpus } from "@emunas/corpus/build";
import { buildCorpusWithAggregates } from "@emunas/corpus/build/aggregate";
import { AliasRules, DEFAULT_TRANSCRIPTS_DIR, LeakScanner, createLeakScanner } from "@emunas/corpus-guard";
import { formatHebrewYears } from "@emunas/i18n";
import { fold } from "@emunas/normalize";
import {
  FORBIDDEN_SEARCH_KEYS,
  buildSynonymTable,
  docSearchText,
  normalizeQuery,
  type EntityDoc,
  type NormalizedQuery,
  type SearchDoc,
  type SynonymTable,
} from "@emunas/search-core";
import {
  ENTITY_FILTER_FIELDS,
  ENTITY_META_FIELDS,
  RECORD_FILTER_FIELDS,
  RECORD_LANGUAGE,
  RECORD_META_FIELDS,
  SYNONYMS_FILE,
  UNUSED_PAGEFIND_FILES,
  buildEntityRecord,
  buildRecord,
  buildRecords,
  buildSearch,
  ensureDocs,
  entityGroups,
  entityLookup,
  entityMember,
  entityTerms,
  guardRecords,
  guardSynonymTable,
  readCitations,
  readDocs,
  readEntities,
  recordUrl,
  synonymRow,
  type EntityMember,
  type GuardItem,
  type QuietEntityRecord,
  type QuietSearchRecord,
  type SynonymTableRow,
} from "../scripts/build-search.ts";
import {
  MAX_ENTRIES,
  countText,
  entryLabel,
  parseSynonymRows,
  pickHeadwords,
  renderEntry,
  renderResult,
  resultHref,
  searchAll,
  searchVariants,
  type Pagefind,
  type PagefindSearchOptions,
  type ResultData,
} from "../src/scripts/search.ts";
import { SEARCH_STRINGS } from "../src/pages/[ed]/search/_strings.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MINI = join(REPO, "packages/corpus/test/fixtures/mini");
const MINI_DATA = join(MINI, "data");
const MINI_CORPUS_DATA = join(MINI_DATA, "derived/corpus");
const SITE_POLICY = join(REPO, "site-policy");
const transcripts = join(REPO, DEFAULT_TRANSCRIPTS_DIR);
const haveTranscripts = existsSync(transcripts);

const tmpDirs: string[] = [];
const tmp = (p = "quiet-search-test-") => {
  const d = mkdtempSync(join(tmpdir(), p));
  tmpDirs.push(d);
  return d;
};
afterAll(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

let corpus = "";
let docs: SearchDoc[] = [];
let entities: EntityDoc[] = [];
let items: GuardItem[] = [];
let records: { record: QuietSearchRecord; shiurId: string }[] = [];
let entityRecords: { record: QuietEntityRecord; entities: EntityMember[] }[] = [];
let synonymRows: SynonymTableRow[] = [];
let table: SynonymTable;

beforeAll(() => {
  corpus = join(tmp(), ".corpus");
  buildCorpusWithAggregates({ dataDir: MINI_DATA, outDir: corpus, policyDir: join(MINI, "site-policy"), dataSha: null });
  const { file, entitiesFile, rebuilt } = ensureDocs(corpus, MINI_DATA);
  expect(rebuilt).toBe(true);
  docs = readDocs(file);
  entities = readEntities(entitiesFile);
  const built = buildRecords(docs, entities, readCitations(corpus));
  items = built.items;
  synonymRows = built.synonyms;
  records = items.flatMap((i) => (i.entities === undefined ? [i] : []));
  entityRecords = items.flatMap((i) => (i.entities !== undefined ? [i] : []));
  table = buildSynonymTable(parseSynonymRows(JSON.parse(JSON.stringify(synonymRows))));
});

function allKeys(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) for (const v of x) allKeys(v, out);
  else if (x && typeof x === "object")
    for (const [k, v] of Object.entries(x)) {
      out.add(k);
      allKeys(v, out);
    }
  return out;
}

// ---------------------------------------------------------------- a stand-in for Pagefind

type AnyRecord = QuietSearchRecord | QuietEntityRecord;

/** Pagefind-like search over records: AND of whole folded tokens, `filters` as exact matches. */
function localPagefind(recs: readonly AnyRecord[]): Pagefind & { searched: string[] } {
  const indexed = recs.map((r, i) => ({ r, id: String(i), tokens: new Set(r.content.split(/\s+/).filter((t) => t !== "")) }));
  const searched: string[] = [];
  return {
    searched,
    async search(term: string, options?: PagefindSearchOptions) {
      searched.push(term);
      const want = term.split(/\s+/).filter((t) => t !== "");
      const filters = Object.entries(options?.filters ?? {});
      const results = indexed
        .filter(({ r, tokens }) => {
          const f = r.filters as Record<string, string[]>;
          return want.length > 0 && want.every((t) => tokens.has(t)) && filters.every(([k, v]) => (Array.isArray(v) ? v : [v]).some((x) => f[k]?.includes(x)));
        })
        // longer content scores lower, as with Pagefind's length normalisation
        // Pagefind returns urls rooted at the bundle's site
        .map(({ r, id }) => ({ id, score: 1 / Math.log2(2 + r.content.length), data: async (): Promise<ResultData> => ({ url: `/${r.url}`, meta: { ...r.meta } }) }));
      return { results };
    },
  };
}

const allRecords = (): AnyRecord[] => items.map((i) => i.record);
const query = (q: string): NormalizedQuery => normalizeQuery(q, table);
const find = (q: string) => searchAll(localPagefind(allRecords()), query(q));

// ---------------------------------------------------------------- shiur records

describe("shiur records", () => {
  it("one record per SearchDoc, edition-less url, language unknown", () => {
    expect(docs.length).toBeGreaterThan(50);
    expect(records).toHaveLength(docs.length);
    for (const { record, shiurId } of records) {
      expect(record.url).toBe(`shiur/${shiurId}/`);
      expect(record.url.startsWith("/")).toBe(false);
      expect(record.language).toBe(RECORD_LANGUAGE);
    }
    expect(recordUrl("a b")).toBe("shiur/a%20b/");
  });

  it("has exactly the allowed top-level, meta and filter keys", () => {
    for (const { record } of records) {
      expect(Object.keys(record).sort()).toEqual(["content", "filters", "language", "meta", "url"]);
      for (const k of Object.keys(record.meta)) expect(RECORD_META_FIELDS).toContain(k);
      expect(Object.keys(record.filters).sort()).toEqual([...RECORD_FILTER_FIELDS].sort());
      expect(record.filters.type).toEqual(["shiur"]);
      for (const v of Object.values(record.meta)) expect(typeof v).toBe("string");
      for (const v of Object.values(record.filters)) expect(v.every((x) => typeof x === "string")).toBe(true);
    }
  });

  it("content is search-core's folded text of the SearchDoc, then its topic keywords, and nothing else", () => {
    for (const [i, doc] of docs.entries()) {
      const t = docSearchText(doc);
      const want = t.keywords === "" ? t.content : `${t.content}\n${t.keywords}`;
      expect(records[i]!.record.content).toBe(want);
    }
  });

  it("carries the shiur's topic keywords (labels and topic aliases from the layer)", () => {
    const withKw = docs.filter((d) => d.keywords.length > 0);
    expect(withKw.length).toBeGreaterThan(10);
    const doc = withKw[0]!;
    const rec = records.find((r) => r.shiurId === doc.id)!.record;
    for (const k of doc.keywords) expect(rec.content.split("\n")).toContain(fold(k));
    // the topic label reaches the record even where the notes never use the word
    const topicDoc = docs.find((d) => d.facets.topics.includes("hashgacha-pratis"))!;
    expect(records.find((r) => r.shiurId === topicDoc.id)!.record.content).toContain(fold("Hashgacha Pratis"));
  });

  it("meta copies title, one-liners, lang and status from the doc, and the occasion and year from the catalog", () => {
    const cites = readCitations(corpus);
    for (const [i, doc] of docs.entries()) {
      const { meta, filters } = records[i]!.record;
      expect(meta.titleOriginal).toBe(doc.titleOriginal);
      expect(meta.lang).toBe(doc.lang);
      expect(meta.status).toBe(doc.status);
      expect(meta.oneLinerEn).toBe(doc.oneLiner?.en || undefined);
      expect(meta.oneLinerYi).toBe(doc.oneLiner?.yi || undefined);
      const row = cites.get(doc.id)!;
      const occasion = (row.parsha?.raw ?? row.zman?.raw ?? "").trim();
      expect(meta.occasion).toBe(occasion !== "" && occasion !== doc.titleOriginal.trim() ? occasion : undefined);
      expect(meta.year).toBe(row.years.length > 0 ? formatHebrewYears(row.years, "en", { civil: false }) : undefined);
      expect(meta).not.toHaveProperty("citation");
      expect(meta).not.toHaveProperty("n");
      expect(filters).toEqual({ type: ["shiur"], lang: [doc.lang], category: [doc.category], status: [doc.status] });
      if (doc.status === "catalog-only") expect(meta.oneLinerEn ?? meta.oneLinerYi).toBeUndefined();
    }
    expect(docs.some((d) => d.status === "full")).toBe(true);
    expect(docs.some((d) => d.status === "catalog-only")).toBe(true);
  });

  it("keywords reach the content only, never meta or filters", () => {
    const doc = docs.find((d) => d.status === "full")!;
    const planted: SearchDoc = { ...doc, keywords: [...doc.keywords, "zzplantedtopiczz"] };
    const r = buildRecord(planted, undefined);
    expect(r.content).toContain("zzplantedtopiczz");
    expect(JSON.stringify(r.meta)).not.toContain("zzplantedtopiczz");
    expect(JSON.stringify(r.filters)).not.toContain("zzplantedtopiczz");
    expect(r.content.indexOf("zzplantedtopiczz")).toBeGreaterThan(r.content.indexOf(docSearchText(doc).content.slice(-5)));
  });

  it("no candidateTopics and no forbidden key in any record or in the synonym table", () => {
    const all = [...items.map((i) => i.record), synonymRows];
    const keys = allKeys(all);
    for (const k of FORBIDDEN_SEARCH_KEYS) expect(keys.has(k), k).toBe(false);
    expect(JSON.stringify(all)).not.toMatch(/candidateTopics|asrVariants|heardAs/);
  });
});

// ---------------------------------------------------------------- entity records

/** The entity record whose members include `kind:id`. */
const recOf = (kind: string, id: string) => entityRecords.find((r) => r.entities.some((m) => m.entity.kind === kind && m.entity.id === id))!.record;
const keysOf = (r: { entities: EntityMember[] }) => r.entities.map((m) => `${m.entity.kind}:${m.entity.id}`);

describe("entity records", () => {
  it("one per Quiet address of the EntityDocs listed on Quiet, and every kind is there", () => {
    expect(entities.length).toBeGreaterThan(50);
    const quiet = entities.filter((e) => e.listed.quiet);
    // every listed entity is in exactly one record
    expect(entityRecords.flatMap(keysOf).sort()).toEqual(quiet.map((e) => `${e.kind}:${e.id}`).sort());
    // one record per address (Pagefind keeps one record per URL)
    expect(new Set(entityRecords.map((r) => r.record.url)).size).toBe(entityRecords.length);
    // only concepts merged into a topic share a record, with that topic
    const shared = entityRecords.filter((r) => r.entities.length > 1);
    expect(shared.length).toBeGreaterThan(0);
    for (const r of shared) {
      expect(r.entities[0]!.entity.kind).toBe("topic");
      for (const m of r.entities.slice(1)) {
        expect(m.entity.kind).toBe("concept");
        expect(entities.find((e) => e.kind === "concept" && e.id === m.entity.id)!.mergedInto).toBe(r.entities[0]!.entity.id);
      }
    }
    expect(entityRecords.length).toBe(quiet.length - quiet.filter((e) => e.mergedInto !== null).length);
    expect(new Set(entityRecords.map((r) => r.record.meta.kind))).toEqual(new Set(["topic", "concept", "person", "work"]));
    expect(synonymRows.map((r) => `${r.kind}:${r.id}`)).toEqual(quiet.map((e) => `${e.kind}:${e.id}`));
    expect(entityGroups(entities, entityLookup(entities))).toHaveLength(entityRecords.length);
  });

  it("has exactly the allowed keys, a type and a kind filter, and no synonyms in meta", () => {
    for (const r of entityRecords) {
      const { record } = r;
      expect(Object.keys(record).sort()).toEqual(["content", "filters", "language", "meta", "url"]);
      expect(record.language).toBe(RECORD_LANGUAGE);
      for (const k of Object.keys(record.meta)) expect(ENTITY_META_FIELDS).toContain(k);
      expect(Object.keys(record.filters).sort()).toEqual([...ENTITY_FILTER_FIELDS].sort());
      expect(record.filters.type).toEqual(["entry"]);
      expect(record.filters.kind).toEqual([record.meta.kind]);
      expect(record.meta.entity).toBe(keysOf(r).join(" "));
      expect(record.url.startsWith("/")).toBe(false);
    }
    expect(JSON.stringify(recOf("person", "divrei-chaim").meta)).not.toContain(fold("the Sanzer Rav"));
  });

  it("content is the members' folded labels and clean synonyms, one per line", () => {
    for (const { record, entities: members } of entityRecords) {
      const want = [...new Set(members.flatMap((m) => entityTerms(entities.find((x) => x.kind === m.entity.kind && x.id === m.entity.id)!)))];
      expect(record.content.split("\n")).toEqual(want);
      for (const m of members) {
        const e = entities.find((x) => x.kind === m.entity.kind && x.id === m.entity.id)!;
        for (const syn of e.synonyms) expect(record.content.split("\n")).toContain(fold(syn));
      }
    }
  });

  it("url: the Quiet page, else the index anchor; a merged concept shares its topic's record", () => {
    const person = entities.find((e) => e.id === "chiddushei-harim" && e.kind === "person")!;
    expect(person.pages.quiet).toBe(true);
    expect(recOf("person", "chiddushei-harim").url).toBe("people/chiddushei-harim/");
    const divrei = entities.find((e) => e.id === "divrei-chaim")!;
    expect(divrei.pages.quiet).toBe(false);
    expect(recOf("person", "divrei-chaim").url).toBe("people/#divrei-chaim");
    expect(recOf("topic", "hashgacha-pratis").url).toBe("inyanim/hashgacha-pratis/");
    expect(recOf("work", "chiddushei-harim").url).toMatch(/^sources\/(chiddushei-harim\/|#chiddushei-harim)$/);
    // the concept merged into the topic: found by its own terms, shown as and linked to the topic
    const merged = recOf("concept", "hashgacha-pratis");
    expect(merged).toBe(recOf("topic", "hashgacha-pratis"));
    expect(merged.meta).toMatchObject({ entity: "topic:hashgacha-pratis concept:hashgacha-pratis", kind: "topic", labelEn: "Hashgacha Pratis" });
    expect(merged.filters.kind).toEqual(["topic"]);
    expect(merged.content.split("\n")).toContain(fold("Hashgacha pratis (individual Divine providence)"));
    for (const { record } of entityRecords) {
      if (record.url.includes("#")) expect(record.url).toMatch(/^(inyanim|erachim|people|sources)\/#[^/]+$/);
      else expect(record.url).toMatch(/^(inyanim|erachim|people|sources)\/[^/#]+\/$/);
    }
  });

  it("meta carries the shown labels and visible count for the headword line", () => {
    const topic = recOf("topic", "hashgacha-pratis");
    const doc = entities.find((e) => e.kind === "topic" && e.id === "hashgacha-pratis")!;
    expect(topic.meta).toEqual({
      entity: "topic:hashgacha-pratis concept:hashgacha-pratis",
      kind: "topic",
      count: String(doc.count),
      labelHe: "השגחה פרטית",
      labelEn: "Hashgacha Pratis",
      labelYi: "השגחה פרטית",
    });
  });

  it("the synonym table rows hold each entity's labels and its other folded terms", () => {
    const row = synonymRows.find((r) => r.kind === "person" && r.id === "divrei-chaim")!;
    expect(row.synonyms).toContain(fold("the Sanzer Rav"));
    for (const l of [row.labels.he, row.labels.en, row.labels.yi]) if (l) expect(row.synonyms).not.toContain(fold(l));
    expect(parseSynonymRows([row, { kind: "story", id: "x" }, null, { kind: "topic" }])).toHaveLength(1);
  });

  it("readEntities reads defensively (unknown kinds, missing ids and fields); a missing file fails", () => {
    const f = join(tmp(), "entities.ndjson");
    writeFileSync(
      f,
      [
        JSON.stringify({ kind: "story", id: "s" }),
        JSON.stringify({ kind: "topic" }),
        JSON.stringify({ kind: "topic", id: "t", labels: { en: "T" }, futureField: 1 }),
        "",
      ].join("\n"),
    );
    const got = readEntities(f);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: "topic", id: "t", labels: { he: null, en: "T", yi: null }, synonyms: [], count: 0, listed: { quiet: false, live: false }, mergedInto: null });
    expect(() => readEntities(join(tmp(), "missing.ndjson"))).toThrow(/the corpus layer is required/);
  });
});

// ---------------------------------------------------------------- the acceptance queries

describe("search: synonyms and headword results", () => {
  const entryKeys = (r: { entries: ResultData[] }) => r.entries.map((d) => d.meta["entity"]);

  it("'Chidushei HaRim' and 'Chiddushei HaRim' find the same person record, first", async () => {
    const a = await find("Chidushei HaRim");
    const b = await find("Chiddushei HaRim");
    expect(entryKeys(a)[0]).toBe("person:chiddushei-harim");
    expect(entryKeys(b)[0]).toBe("person:chiddushei-harim");
    expect(a.entries[0]).toEqual(b.entries[0]);
    expect(a.entries[0]!.url).toBe("/people/chiddushei-harim/");
  });

  it("'Sanzer Rav' finds the Divrei Chaim, and expands to shiurim that name him", async () => {
    const q = query("Sanzer Rav");
    expect(q.entities.map((e) => `${e.kind}:${e.id}`)).toContain("person:divrei-chaim");
    const r = await find("Sanzer Rav");
    expect(entryKeys(r)).toContain("person:divrei-chaim");
    expect(r.entries.find((d) => d.meta["entity"] === "person:divrei-chaim")!.url).toBe("/people/#divrei-chaim");
    // the variants carry the canonical names, so a shiur that says "Divrei Chaim" is found
    expect(q.variants.some((v) => v.includes(fold("Divrei Chaim")))).toBe(true);
    expect(r.shiurim.length).toBeGreaterThan(0);
  });

  it("a headword query returns the entry first, then shiurim; the merged concept does not repeat it", async () => {
    for (const q of ["Hashgacha Pratis", "השגחה פרטית", "hashgachah pratis"]) {
      const r = await find(q);
      expect(r.entries[0]!.meta["entity"], q).toBe("topic:hashgacha-pratis concept:hashgacha-pratis");
      expect(r.entries[0]!.url).toBe("/inyanim/hashgacha-pratis/");
      expect(r.entries.filter((d) => d.url === "/inyanim/hashgacha-pratis/")).toHaveLength(1);
      expect(r.entries.length).toBeLessThanOrEqual(MAX_ENTRIES);
      expect(r.shiurim.length).toBeGreaterThan(0);
      expect(r.total).toBe(r.shiurim.length);
      for (const s of r.shiurim) expect(s.url).toMatch(/^\/shiur\//);
    }
  });

  it("a word the entry only shares is not a headword", async () => {
    // "providence" is inside some synonyms but names no entity on its own
    const r = await find("providence");
    expect(r.entries).toEqual([]);
  });

  it("no entry from an ASR mishearing: 'Hashem Tov' names nothing", async () => {
    expect(query("Hashem Tov").entities.map((e) => e.id)).not.toContain("baal-shem-tov");
    const r = await find("Hashem Tov");
    expect(entryKeys(r)).not.toContain("person:baal-shem-tov");
  });

  it("without the synonym table the shiurim are still found, and no entry is shown", async () => {
    const r = await searchAll(localPagefind(allRecords()), normalizeQuery("Hashgacha Pratis"));
    expect(r.entries).toEqual([]);
    expect(r.shiurim.length).toBeGreaterThan(0);
  });

  it("shiur and entity records are searched apart (type filter)", async () => {
    const pf = localPagefind(allRecords());
    const r = await searchAll(pf, query("Hashgacha Pratis"));
    for (const s of r.shiurim) expect(s.meta["entity"]).toBeUndefined();
    for (const e of r.entries) expect(e.meta["entity"]).toBeDefined();
  });
});

// ---------------------------------------------------------------- guard

describe("corpus-guard on the records", () => {
  const scanner = (variants: string[] = []) => {
    const rules = AliasRules.read(MINI_CORPUS_DATA);
    return new LeakScanner({ aliases: new AliasRules(rules.display as ConstructorParameters<typeof AliasRules>[0], variants) });
  };

  it("is clean on the mini corpus with the alias checks on", () => {
    const s = createLeakScanner({ corpusDir: corpus, corpusDataDir: MINI_CORPUS_DATA, siteDir: SITE_POLICY, env: {} });
    const g = guardRecords(items, s);
    expect(g.records).toBe(items.length);
    expect(g.findings).toEqual([]);
    expect(guardSynonymTable(synonymRows, s).findings).toEqual([]);
    expect(s.result().aliasesChecked).toBe(true);
    expect(s.result().counts.aliasTermsChecked).toBeGreaterThan(entityRecords.length);
  });

  it.runIf(haveTranscripts)("is clean on the mini corpus with the verbatim scan on", () => {
    const s = createLeakScanner({ corpusDir: corpus, transcriptsDir: transcripts, corpusDataDir: MINI_CORPUS_DATA, siteDir: SITE_POLICY, env: {} });
    const g = guardRecords(items, s);
    expect(g.findings).toEqual([]);
    expect(s.result().verbatimChecked).toBe(true);
    expect(s.result().counts.unitsMappedToShiur).toBeGreaterThan(0);
  });

  it("a planted ASR synonym fails the checker (raw ban), and nothing of it is reported", () => {
    const bst = entities.find((e) => e.kind === "person" && e.id === "baal-shem-tov")!;
    const planted: EntityDoc = { ...bst, synonyms: [...bst.synonyms, "hashem tov"] };
    const lookup = entityLookup(entities);
    const item: GuardItem = { record: buildEntityRecord([planted], lookup), entities: [entityMember(planted)] };
    const g = guardRecords([item], scanner(["Hashem Tov"]));
    expect(g.findings.map((f) => f.detail)).toEqual([expect.stringMatching(/^alias asr-variant ×1 of person:baal-shem-tov/)]);
    expect(JSON.stringify(g)).not.toMatch(/hashem tov/i);
    // the same planted term in the synonym table fails too
    const t = guardSynonymTable([synonymRow(planted)], scanner(["Hashem Tov"]));
    expect(t.findings.map((f) => f.detail)).toEqual([expect.stringMatching(/^alias asr-variant/)]);
  });

  it("a planted synonym that is not a display field of its entity fails the checker", () => {
    const bst = entities.find((e) => e.kind === "person" && e.id === "baal-shem-tov")!;
    const planted: EntityDoc = { ...bst, synonyms: [...bst.synonyms, "zzq not a display name"] };
    const g = guardRecords([{ record: buildEntityRecord([planted], entityLookup(entities)), entities: [entityMember(planted)] }], scanner());
    expect(g.findings.map((f) => f.detail)).toEqual([expect.stringMatching(/^alias not-display-field ×1 of person:baal-shem-tov/)]);
  });

  it("a content line that no member brings is a finding", () => {
    const e = entityRecords.find((r) => r.entities.length === 1)!;
    const bad = { ...e, record: { ...e.record, content: `${e.record.content}\nzz stray term` } };
    const g = guardRecords([bad], scanner());
    expect(g.findings.map((f) => f.detail)).toContain("alias unaccounted ×1 at content");
  });

  it("refuses entity records when the alias checks cannot run", () => {
    const e = entityRecords[0]!;
    const g = guardRecords([e], new LeakScanner({}));
    expect(g.findings).toHaveLength(1);
    expect(g.findings[0]!.detail).toMatch(/alias checks off/);
    expect(guardRecords([records[0]!], new LeakScanner({})).findings).toEqual([]);
  });

  it("flags a forbidden key, a forbidden substring and reports no shipped text", () => {
    const base = records[0]!.record;
    const bad: QuietSearchRecord = {
      ...base,
      content: `${base.content}\nsee transcripts/x.json`,
      meta: { ...base.meta, ...({ heardAs: "secret words" } as object) },
    };
    const g = guardRecords([{ record: bad, shiurId: records[0]!.shiurId }], new LeakScanner({}));
    // "transcripts/" is also a remark on the transcript (meta-comment); its context is shipped text, never the planted value.
    expect(g.findings.map((f) => f.kind).sort()).toEqual(["key", "meta-comment", "substring"]);
    expect(JSON.stringify(g)).not.toContain("secret words");
  });
});

// ---------------------------------------------------------------- buildSearch

describe("buildSearch", () => {
  it("writes a Pagefind bundle with shiur and entity records, the synonym table and no prebuilt UI", async () => {
    const out = join(tmp(), "pagefind");
    const r = await buildSearch({ corpusDir: corpus, outDir: out, transcriptsDir: null, siteDir: SITE_POLICY, dataDir: null, corpusDataDir: MINI_CORPUS_DATA, env: {} });
    expect(r).toMatchObject({ records: docs.length + entityRecords.length, entityRecords: entityRecords.length, rebuiltDocs: false, written: true });
    expect(r.guard.findings).toEqual([]);
    const entry = JSON.parse(readFileSync(join(out, "pagefind-entry.json"), "utf8")) as {
      languages: Record<string, { page_count: number }>;
    };
    expect(Object.keys(entry.languages)).toEqual([RECORD_LANGUAGE]);
    expect(entry.languages[RECORD_LANGUAGE]!.page_count).toBe(docs.length + entityRecords.length);
    expect(existsSync(join(out, "pagefind.js"))).toBe(true);
    const files = readdirSync(out);
    for (const f of UNUSED_PAGEFIND_FILES) expect(files).not.toContain(f);
    const syn = JSON.parse(readFileSync(join(out, SYNONYMS_FILE), "utf8")) as unknown;
    expect(syn).toEqual(synonymRows);
    expect(parseSynonymRows(syn)).toHaveLength(synonymRows.length);
    // the post-pass reads the table like any published file: clean
    const post = createLeakScanner({ corpusDataDir: MINI_CORPUS_DATA, siteDir: SITE_POLICY, env: {}, baseDir: out });
    post.scanPaths([join(out, SYNONYMS_FILE)]);
    expect(post.result().findings).toEqual([]);
    expect(post.result().counts.aliasTermsChecked).toBeGreaterThan(0);
  }, 60_000);

  it("refuses entity records without the corpus data folder: nothing written", async () => {
    const out = join(tmp(), "pagefind");
    const r = await buildSearch({ corpusDir: corpus, outDir: out, transcriptsDir: null, siteDir: SITE_POLICY, dataDir: null, corpusDataDir: null, env: {} });
    expect(r.written).toBe(false);
    expect(r.guard.findings.length).toBe(entityRecords.length + 1);
    expect(existsSync(out)).toBe(false);
  });

  it("fails without the corpus layer (it is required): nothing written", async () => {
    const c = join(tmp(), ".corpus");
    buildCorpus({ dataDir: MINI_DATA, outDir: c, policyDir: join(MINI, "site-policy"), dataSha: null });
    const out = join(tmp(), "pagefind");
    await expect(
      buildSearch({ corpusDir: c, outDir: out, transcriptsDir: null, siteDir: SITE_POLICY, dataDir: null, corpusDataDir: null, env: {} }),
    ).rejects.toThrow(/the corpus layer is required/);
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  it("writes nothing when the guard finds a leak", async () => {
    const c2 = join(tmp(), ".corpus");
    cpSync(corpus, c2, { recursive: true });
    const docsFile = join(c2, "search", "docs.ndjson");
    const planted = readDocs(docsFile).map((d, i) => (i === 0 ? { ...d, titleOriginal: "path transcripts/abc.json" } : d));
    writeFileSync(docsFile, planted.map((d) => JSON.stringify(d)).join("\n") + "\n");
    const later = new Date(Date.now() + 60_000);
    utimesSync(docsFile, later, later); // newer than index.json: not rebuilt
    const out = join(tmp(), "pagefind");
    const r = await buildSearch({ corpusDir: c2, outDir: out, transcriptsDir: null, siteDir: SITE_POLICY, dataDir: null, corpusDataDir: MINI_CORPUS_DATA, env: {} });
    expect(r.written).toBe(false);
    expect(r.guard.findings.map((f) => f.kind)).toContain("substring");
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  it("writes nothing when entities.ndjson carries an ASR-looking synonym that is not a display field", async () => {
    const c3 = join(tmp(), ".corpus");
    cpSync(corpus, c3, { recursive: true });
    const f = join(c3, "search", "entities.ndjson");
    const rows = readEntities(f).map((e) => (e.kind === "person" && e.id === "baal-shem-tov" ? { ...e, synonyms: [...e.synonyms, "hashem tov"] } : e));
    writeFileSync(f, rows.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(c3, "search", "docs.ndjson"), later, later);
    const out = join(tmp(), "pagefind");
    const r = await buildSearch({ corpusDir: c3, outDir: out, transcriptsDir: null, siteDir: SITE_POLICY, dataDir: null, corpusDataDir: MINI_CORPUS_DATA, env: {} });
    expect(r.written).toBe(false);
    expect(r.guard.findings.some((x) => x.detail.includes("person:baal-shem-tov"))).toBe(true);
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  it("rebuilds docs.ndjson when it is older than index.json", () => {
    const c3 = join(tmp(), ".corpus");
    cpSync(corpus, c3, { recursive: true });
    const old = new Date(Date.now() - 3_600_000);
    utimesSync(join(c3, "search", "docs.ndjson"), old, old);
    expect(ensureDocs(c3, null).rebuilt).toBe(true);
    expect(ensureDocs(c3, null).rebuilt).toBe(false);
  });

  it("refuses to run without a corpus", () => {
    expect(() => ensureDocs(join(tmp(), "nope"), null)).toThrow(/corpus:build/);
  });
});

// ---------------------------------------------------------------- glue (pure parts)

/** Just enough of a Document for `renderEntry` (no DOM in this suite). */
function fakeDocument(): Document {
  class Node {
    children: (Node | string)[] = [];
    className = "";
    href = "";
    dir = "";
    private ownText: string | undefined;
    constructor(readonly tagName: string) {}
    set textContent(t: string) {
      this.ownText = t;
      this.children = [];
    }
    get textContent(): string {
      return this.ownText ?? this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join("");
    }
    append(...xs: (Node | string)[]) {
      this.children.push(...xs);
    }
  }
  return { createElement: (tag: string) => new Node(tag) } as unknown as Document;
}

describe("search glue (pure parts)", () => {
  it("prefixes the edition to the edition-less record url", () => {
    expect(resultHref("yi", "shiur/a/")).toBe("/yi/shiur/a/");
    expect(resultHref("en", "/shiur/a/")).toBe("/en/shiur/a/");
    expect(resultHref("yi", "people/#divrei-chaim")).toBe("/yi/people/#divrei-chaim");
  });

  it("merges variant results by id, keeping the best score, best first, and passes the filter", async () => {
    const res = (id: string, score: number) => ({ id, score, data: async () => ({ url: id, meta: {} }) });
    const table: Record<string, ReturnType<typeof res>[]> = {
      a: [res("1", 1), res("2", 5)],
      b: [res("2", 2), res("3", 3)],
    };
    const seen: (PagefindSearchOptions | undefined)[] = [];
    const pf: Pagefind = {
      search: async (q, o) => {
        seen.push(o);
        return q in table ? { results: table[q]! } : null;
      },
    };
    const merged = await searchVariants(pf, ["a", "b", "none"], { filters: { type: "shiur" } });
    expect(merged.map((r) => [r.id, r.score])).toEqual([
      ["2", 5],
      ["3", 3],
      ["1", 1],
    ]);
    expect(seen).toEqual([{ filters: { type: "shiur" } }, { filters: { type: "shiur" } }, { filters: { type: "shiur" } }]);
  });

  it("pickHeadwords: named entities only, exact before prefix, then by count, one per address", () => {
    const d = (entity: string, url: string, count: number): ResultData => ({ url, meta: { entity, count: String(count) } });
    const hits = [
      d("topic:a", "/inyanim/a/", 5),
      d("concept:x", "/inyanim/a/", 9),
      d("person:b", "/people/b/", 100),
      d("work:c topic:c", "/sources/c/", 1),
      d("topic:z", "/inyanim/z/", 1000),
    ];
    const q = {
      entities: [
        { kind: "topic" as const, id: "c", span: [0, 1] as [number, number], match: "exact" as const, forms: [] },
        { kind: "person" as const, id: "b", span: [0, 1] as [number, number], match: "prefix" as const, forms: [] },
        { kind: "topic" as const, id: "a", span: [0, 1] as [number, number], match: "exact" as const, forms: [] },
        { kind: "concept" as const, id: "x", span: [0, 1] as [number, number], match: "exact" as const, forms: [] },
      ],
    };
    // exact: concept:x (9) and topic:a (5) share an address, the better one stays; then work:c topic:c (1); prefix: person:b
    expect(pickHeadwords(hits, q, 10).map((h) => h.meta["entity"])).toEqual(["concept:x", "work:c topic:c", "person:b"]);
    expect(pickHeadwords(hits, q, 1)).toHaveLength(1);
    expect(pickHeadwords(hits, { entities: [] })).toEqual([]);
  });

  it("entry label and count follow the edition", () => {
    const meta = { labelHe: "השגחה פרטית", labelEn: "Hashgacha Pratis", labelYi: "השגחה פרטית יי" };
    expect(entryLabel("en", meta)).toBe("Hashgacha Pratis");
    expect(entryLabel("yi", meta)).toBe("השגחה פרטית יי");
    expect(entryLabel("en", { labelHe: "רמב״ם" })).toBe("רמב״ם");
    expect(entryLabel("yi", { labelEn: "Rambam" })).toBe("Rambam");
    const msg = (k: string) => SEARCH_STRINGS.en[k as keyof (typeof SEARCH_STRINGS)["en"]] ?? "";
    expect(countText(1, msg)).toBe("1 shiur");
    expect(countText(120, msg)).toBe("120 shiurim");
  });

  it("renders a headword entry as 'ענין: השגחה פרטית · 120 שיעורים' linking to the entry", () => {
    const yi = SEARCH_STRINGS.yi;
    const msg = (k: string) => (yi as Record<string, string>)[k] ?? "";
    const li = renderEntry(
      fakeDocument(),
      "yi",
      { url: "inyanim/hashgacha-pratis/", meta: { entity: "topic:hashgacha-pratis", kind: "topic", labelHe: "השגחה פרטית", labelEn: "Hashgacha Pratis", count: "120" } },
      msg,
    );
    expect(li.textContent).toBe("ענין: השגחה פרטית · 120 שיעורים");
    expect(li.className).toBe("search-entry");
    const a = (li as unknown as { children: { href: string; className: string }[] }).children[0]!;
    expect(a.href).toBe("/yi/inyanim/hashgacha-pratis/");
    expect(a.className).toBe("catalog-title");
    const en = renderEntry(fakeDocument(), "en", { url: "people/#divrei-chaim", meta: { kind: "person", labelEn: "the Divrei Chaim", count: "2" } }, (k) => (SEARCH_STRINGS.en as Record<string, string>)[k] ?? "");
    expect(en.textContent).toBe("Person: the Divrei Chaim · 2 shiurim");
  });

  it("renders a shiur result as its title, then occasion · year · language, then the one-liner", () => {
    const msg = (k: string) => (SEARCH_STRINGS.en as Record<string, string>)[k] ?? "";
    const meta = { titleOriginal: "חנוכה", occasion: "חנוכה ה", year: 'תשנ"ז', lang: "yi", oneLinerEn: "On the lights." };
    const li = renderResult(fakeDocument(), "en", { url: "shiur/a/", meta }, msg);
    expect(li.textContent).toBe('חנוכהחנוכה ה · תשנ"ז · YiddishOn the lights.');
    expect(li.textContent).not.toMatch(/no\. /);
    const bare = renderResult(fakeDocument(), "yi", { url: "shiur/b/", meta: { titleOriginal: "x", lang: "en" } }, (k) => (SEARCH_STRINGS.yi as Record<string, string>)[k] ?? "");
    expect(bare.textContent).toBe(`xענגליש${SEARCH_STRINGS.yi.pending}`);
  });

  it("the page strings call /inyanim/ Topics and /erachim/ the glossary, and say the entries are AI-compiled", () => {
    expect(SEARCH_STRINGS.en.inyanim).toBe("Topics");
    expect(SEARCH_STRINGS.en.inyanim).not.toMatch(/concept/i);
    expect(SEARCH_STRINGS.yi.inyanim).toBe("ענינים");
    expect(SEARCH_STRINGS.en.erachim).toBe("Glossary");
    expect(SEARCH_STRINGS.yi.erachim).toBe("ערכים");
    expect(SEARCH_STRINGS.en.entriesNote).toMatch(/AI/);
    expect(SEARCH_STRINGS.yi.entriesNote).toMatch(/AI/);
    for (const k of ["kindTopic", "kindConcept", "kindPerson", "kindWork"] as const) {
      expect(SEARCH_STRINGS.en[k]).not.toBe("");
      expect(SEARCH_STRINGS.yi[k]).not.toBe("");
    }
  });

  it("'לג בעומר' and 'lag baomer' reach Pagefind as the same query", () => {
    expect(normalizeQuery("lag baomer").variants[0]).toBe(normalizeQuery("לג בעומר").variants[0]);
    expect(normalizeQuery("ל״ג בעומר").variants[0]).toBe(normalizeQuery("Lag B'Omer").variants[0]);
  });

  it("the synonym table built from synonyms.json equals one built from the EntityDocs", () => {
    const direct = buildSynonymTable(entities.filter((e) => e.listed.quiet));
    for (const q of ["Chidushei HaRim", "Sanzer Rav", "hester", "השגחה פרטית", "rambam"]) {
      expect(normalizeQuery(q, table).entities, q).toEqual(normalizeQuery(q, direct).entities);
    }
  });
});
