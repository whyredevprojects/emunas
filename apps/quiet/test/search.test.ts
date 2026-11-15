/**
 * W3.5 Quiet search: the Pagefind records (scripts/build-search.ts) and the pure parts of the glue
 * (src/scripts/search.ts). Browser behaviour (no-JS fallback, לג בעומר = lag baomer, glue size, axe)
 * is in test/e2e/search.test.ts.
 *
 * Runs on the @emunas/corpus mini corpus. The transcript folder is located through
 * @emunas/corpus-guard (the only site package allowed to name it).
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCorpus } from "@emunas/corpus/build";
import { DEFAULT_TRANSCRIPTS_DIR, LeakScanner, createLeakScanner } from "@emunas/corpus-guard";
import { FORBIDDEN_SEARCH_KEYS, docSearchText, normalizeQuery, type SearchDoc } from "@emunas/search-core";
import {
  RECORD_FILTER_FIELDS,
  RECORD_LANGUAGE,
  RECORD_META_FIELDS,
  UNUSED_PAGEFIND_FILES,
  buildRecord,
  buildSearch,
  ensureDocs,
  guardRecords,
  readCitations,
  readDocs,
  recordUrl,
  type QuietSearchRecord,
} from "../scripts/build-search.ts";
import { resultHref, searchVariants } from "../src/scripts/search.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MINI = join(REPO, "packages/corpus/test/fixtures/mini");
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
let records: { record: QuietSearchRecord; shiurId: string }[] = [];

beforeAll(() => {
  corpus = join(tmp(), ".corpus");
  buildCorpus({ dataDir: join(MINI, "data"), outDir: corpus, policyDir: join(MINI, "site-policy"), dataSha: null });
  const { file, rebuilt } = ensureDocs(corpus, join(MINI, "data"));
  expect(rebuilt).toBe(true);
  docs = readDocs(file);
  const cites = readCitations(corpus);
  records = docs.map((d) => ({ record: buildRecord(d, cites.get(d.id)), shiurId: d.id }));
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

describe("Pagefind records", () => {
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
      for (const v of Object.values(record.meta)) expect(typeof v).toBe("string");
      for (const v of Object.values(record.filters)) expect(v.every((x) => typeof x === "string")).toBe(true);
    }
    const keys = allKeys(records.map((r) => r.record));
    for (const k of FORBIDDEN_SEARCH_KEYS) expect(keys.has(k)).toBe(false);
  });

  it("content is search-core's folded text of the SearchDoc and nothing else", () => {
    for (const [i, doc] of docs.entries()) {
      const t = docSearchText(doc);
      const want = t.keywords === "" ? t.content : `${t.content}\n${t.keywords}`;
      expect(records[i]!.record.content).toBe(want);
    }
  });

  it("meta copies title, one-liners, lang and status from the doc and the citation from the catalog", () => {
    const cites = readCitations(corpus);
    for (const [i, doc] of docs.entries()) {
      const { meta, filters } = records[i]!.record;
      expect(meta.titleOriginal).toBe(doc.titleOriginal);
      expect(meta.lang).toBe(doc.lang);
      expect(meta.status).toBe(doc.status);
      expect(meta.oneLinerEn).toBe(doc.oneLiner?.en || undefined);
      expect(meta.oneLinerYi).toBe(doc.oneLiner?.yi || undefined);
      expect(meta.citation).toBe(cites.get(doc.id)!.catalog.sectionTitle);
      expect(filters).toEqual({ lang: [doc.lang], category: [doc.category], status: [doc.status] });
      if (doc.status === "catalog-only") expect(meta.oneLinerEn ?? meta.oneLinerYi).toBeUndefined();
    }
    expect(docs.some((d) => d.status === "full")).toBe(true);
    expect(docs.some((d) => d.status === "catalog-only")).toBe(true);
  });

  it("candidateTopics (keywords) reach the content only, never meta or filters", () => {
    const doc = docs.find((d) => d.status === "full")!;
    const planted: SearchDoc = { ...doc, keywords: [...doc.keywords, "zzplantedtopiczz"] };
    const r = buildRecord(planted, undefined);
    expect(r.content).toContain("zzplantedtopiczz");
    expect(JSON.stringify(r.meta)).not.toContain("zzplantedtopiczz");
    expect(JSON.stringify(r.filters)).not.toContain("zzplantedtopiczz");
    expect(r.content.indexOf("zzplantedtopiczz")).toBeGreaterThan(r.content.indexOf(docSearchText(doc).content.slice(-5)));
  });
});

describe("corpus-guard on the records", () => {
  it.runIf(haveTranscripts)("is clean on the mini corpus with the verbatim scan on", () => {
    const scanner = createLeakScanner({ corpusDir: corpus, transcriptsDir: transcripts, siteDir: SITE_POLICY, env: {} });
    const g = guardRecords(records, scanner);
    expect(g.records).toBe(records.length);
    expect(g.findings).toEqual([]);
    expect(scanner.result().verbatimChecked).toBe(true);
    expect(scanner.result().counts.unitsMappedToShiur).toBeGreaterThan(0);
  });

  it("flags a forbidden key, a forbidden substring and reports no shipped text", () => {
    const base = records[0]!.record;
    const bad: QuietSearchRecord = {
      ...base,
      content: `${base.content}\nsee transcripts/x.json`,
      meta: { ...base.meta, ...({ heardAs: "secret words" } as object) },
    };
    const g = guardRecords([{ record: bad, shiurId: records[0]!.shiurId }], new LeakScanner({}));
    expect(g.findings.map((f) => f.kind).sort()).toEqual(["key", "substring"]);
    expect(JSON.stringify(g)).not.toContain("secret words");
  });
});

describe("buildSearch", () => {
  it("writes a Pagefind bundle with one record per shiur and no prebuilt UI", async () => {
    const out = join(tmp(), "pagefind");
    const r = await buildSearch({ corpusDir: corpus, outDir: out, transcriptsDir: null, siteDir: SITE_POLICY, dataDir: null, env: {} });
    expect(r).toMatchObject({ records: docs.length, rebuiltDocs: false, written: true });
    expect(r.guard.findings).toEqual([]);
    const entry = JSON.parse(readFileSync(join(out, "pagefind-entry.json"), "utf8")) as {
      languages: Record<string, { page_count: number }>;
    };
    expect(Object.keys(entry.languages)).toEqual([RECORD_LANGUAGE]);
    expect(entry.languages[RECORD_LANGUAGE]!.page_count).toBe(docs.length);
    expect(existsSync(join(out, "pagefind.js"))).toBe(true);
    const files = readdirSync(out);
    for (const f of UNUSED_PAGEFIND_FILES) expect(files).not.toContain(f);
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
    const r = await buildSearch({ corpusDir: c2, outDir: out, transcriptsDir: null, siteDir: SITE_POLICY, dataDir: null, env: {} });
    expect(r.written).toBe(false);
    expect(r.guard.findings.map((f) => f.kind)).toContain("substring");
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

describe("search glue (pure parts)", () => {
  it("prefixes the edition to the edition-less record url", () => {
    expect(resultHref("yi", "shiur/a/")).toBe("/yi/shiur/a/");
    expect(resultHref("en", "/shiur/a/")).toBe("/en/shiur/a/");
  });

  it("merges variant results by id, keeping the best score, best first", async () => {
    const res = (id: string, score: number) => ({ id, score, data: async () => ({ url: id, meta: {} }) });
    const table: Record<string, ReturnType<typeof res>[]> = {
      a: [res("1", 1), res("2", 5)],
      b: [res("2", 2), res("3", 3)],
    };
    const pf = { search: async (q: string) => (q in table ? { results: table[q]! } : null) };
    const merged = await searchVariants(pf, ["a", "b", "none"]);
    expect(merged.map((r) => [r.id, r.score])).toEqual([
      ["2", 5],
      ["3", 3],
      ["1", 1],
    ]);
  });

  it("'לג בעומר' and 'lag baomer' reach Pagefind as the same query", () => {
    expect(normalizeQuery("lag baomer").variants[0]).toBe(normalizeQuery("לג בעומר").variants[0]);
    expect(normalizeQuery("ל״ג בעומר").variants[0]).toBe(normalizeQuery("Lag B'Omer").variants[0]);
  });
});
