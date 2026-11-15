/**
 * Incremental D1 sync against a real local D1 (Miniflare, the engine `wrangler dev` uses), with
 * the search migrations applied. Acceptance: a second run with no data change writes 0 rows;
 * one changed shiur writes only its rows; FTS rows meet the Worker's normalizeQuery.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncD1, SchemaError } from "../src/d1-sync.ts";
import { MiniflareD1Target } from "../src/local.ts";
import { corpusRevOf, ftsRowid, rowLangs } from "../src/rows.ts";
import { normalizeQuery } from "../../src/query.ts";
import { trigramMatch, wordsMatch } from "../../src/fts.ts";
import { buildMiniCorpus, corpusMoments, freshD1, miniDataCopy, miniMoments, rehash, tableCounts } from "./helpers.ts";

const open: MiniflareD1Target[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});
async function db(): Promise<MiniflareD1Target> {
  const t = await freshD1();
  open.push(t);
  return t;
}

describe("D1 sync: first run, idempotence, incremental", () => {
  it("first run writes every moment, its text, entities and FTS rows, and corpus_rev last", async () => {
    const t = await db();
    const rows = miniMoments();
    expect(rows.length).toBeGreaterThan(500);
    const r = await syncD1(t, rows);
    expect(r.inserted).toBe(rows.length);
    expect(r.updated + r.deleted).toBe(0);
    expect(r.revWritten).toBe(true);
    const units = rows.reduce((n, row) => n + rowLangs(row).length, 0);
    const entities = rows.reduce(
      (n, row) =>
        n +
        new Set([
          ...row.entities.works.map((x) => `w${x}`),
          ...row.entities.people.map((x) => `p${x}`),
          ...row.entities.concepts.map((x) => `c${x}`),
          ...row.entities.topics.map((x) => `t${x}`),
        ]).size,
      0,
    );
    const topicRows = rows.reduce((n, row) => n + new Set(row.entities.topics).size, 0);
    expect(topicRows).toBeGreaterThan(0);
    expect(await t.all("SELECT count(*) AS n FROM moment_entities WHERE type = 'topic'")).toEqual([{ n: topicRows }]);
    expect(await tableCounts(t)).toEqual({
      moments: rows.length,
      moment_entities: entities,
      moment_text: units,
      fts_words: units,
      fts_tri: units,
    });
    const rev = await t.all<{ v: string }>("SELECT v FROM meta WHERE k = 'corpus_rev'");
    expect(rev[0]?.v).toBe(corpusRevOf(rows));
    expect(r.rev).toBe(corpusRevOf(rows));
  });

  it("a second run with no data change writes 0 rows (no statements, no meta write)", async () => {
    const t = await db();
    const rows = miniMoments();
    await syncD1(t, rows);
    const before = await tableCounts(t);
    const r = await syncD1(t, miniMoments());
    expect(r).toMatchObject({ inserted: 0, updated: 0, deleted: 0, statements: 0, rowsWritten: 0, revWritten: false, shiurim: [] });
    expect(r.unchanged).toBe(rows.length);
    expect(await tableCounts(t)).toEqual(before);
  });

  it("one changed shiur (a real data edit, rebuilt) writes only that shiur's rows", async () => {
    const t = await db();
    const first = miniMoments();
    await syncD1(t, first);

    const data = miniDataCopy();
    const shiur = "en-miscellaneous-en-01";
    const file = join(data, "derived/shiurim", shiur, "writeup.json");
    const w = JSON.parse(readFileSync(file, "utf8")) as { en: { paragraphs: { text: string }[] }[] };
    (w.en[0] as { paragraphs: { text: string }[] }).paragraphs[0]!.text += " The Rav adds a closing remark about humility.";
    writeFileSync(file, JSON.stringify(w));
    const corpus = buildMiniCorpus(data);
    const second = corpusMoments(corpus);

    const oldHash = new Map(first.map((r) => [r.id, r.hash]));
    const changed = second.filter((r) => oldHash.get(r.id) !== r.hash);
    expect(changed.length).toBeGreaterThan(0);
    expect(new Set(changed.map((r) => r.shiurId))).toEqual(new Set([shiur]));

    const snapshot = await t.all<{ id: string; hash: string }>("SELECT id, hash FROM moments WHERE shiur_id != ? ORDER BY id", [shiur]);
    const r = await syncD1(t, second);
    expect(r.shiurim).toEqual([shiur]);
    expect(r.updated).toBe(changed.length);
    expect(r.inserted + r.deleted).toBe(0);
    expect(r.revWritten).toBe(true);
    expect(await t.all("SELECT id, hash FROM moments WHERE shiur_id != ? ORDER BY id", [shiur])).toEqual(snapshot);

    // The edited text is what moment_text and the FTS row now hold.
    const id = (changed[0] as { id: string }).id;
    const text = await t.all<{ body: string }>("SELECT body FROM moment_text WHERE id = ? AND lang = 'en'", [id]);
    expect(text[0]?.body).toContain("closing remark about humility");
    const hits = await t.all<{ id: string }>("SELECT id FROM fts_words WHERE fts_words MATCH ?", [wordsMatch(normalizeQuery("humility closing remark")) as string]);
    expect(hits.map((h) => h.id)).toEqual([id]);
    // Exactly one FTS row per language survived the replacement.
    expect(await t.all("SELECT count(*) AS n FROM fts_tri WHERE id = ?", [id])).toEqual([{ n: 1 }]);
  });

  it("a topic change re-writes only that moment and replaces its topic rows", async () => {
    const t = await db();
    const rows = miniMoments();
    await syncD1(t, rows);
    const i = rows.findIndex((r) => r.entities.topics.length > 0);
    expect(i).toBeGreaterThanOrEqual(0);
    const target = rows[i]!;
    const topicsOf = async (id: string) =>
      (await t.all<{ entity_id: string }>("SELECT entity_id FROM moment_entities WHERE moment_id = ? AND type = 'topic' ORDER BY entity_id", [id])).map((r) => r.entity_id);
    expect(await topicsOf(target.id)).toEqual([...new Set(target.entities.topics)].sort());

    const edited = rows.map((r, j) => (j === i ? rehash({ ...r, entities: { ...r.entities, topics: ["zz-new-topic"] } }) : r));
    const before = await t.all("SELECT id, hash FROM moments WHERE id != ? ORDER BY id", [target.id]);
    const r = await syncD1(t, edited);
    expect(r).toMatchObject({ inserted: 0, updated: 1, deleted: 0, shiurim: [target.shiurId], revWritten: true });
    expect(await topicsOf(target.id)).toEqual(["zz-new-topic"]);
    expect(await t.all("SELECT id, hash FROM moments WHERE id != ? ORDER BY id", [target.id])).toEqual(before);

    // And it is idempotent again.
    expect(await syncD1(t, edited)).toMatchObject({ inserted: 0, updated: 0, deleted: 0, statements: 0 });
  });

  it("a removed shiur's rows are deleted from every table", async () => {
    const t = await db();
    const rows = miniMoments();
    await syncD1(t, rows);
    const gone = "yi-zmanim-lvl-01";
    const kept = rows.filter((r) => r.shiurId !== gone);
    const goneIds = rows.filter((r) => r.shiurId === gone).map((r) => r.id);
    expect(goneIds.length).toBeGreaterThan(0);
    const r = await syncD1(t, kept);
    expect(r.deleted).toBe(goneIds.length);
    expect(r.shiurim).toEqual([gone]);
    for (const table of ["moments", "moment_text", "fts_words", "fts_tri"]) {
      const n = await t.all<{ n: number }>(`SELECT count(*) AS n FROM ${table} WHERE id LIKE ?`, [`${gone}~%`]);
      expect(n[0]?.n, table).toBe(0);
    }
    expect(await t.all("SELECT count(*) AS n FROM moment_entities WHERE moment_id LIKE ?", [`${gone}~%`])).toEqual([{ n: 0 }]);
    expect((await tableCounts(t)).moments).toBe(kept.length);
  });

  it("a dry run reads and plans but writes nothing", async () => {
    const t = await db();
    const r = await syncD1(t, miniMoments(), { dryRun: true });
    expect(r.inserted).toBeGreaterThan(0);
    expect((await tableCounts(t)).moments).toBe(0);
    expect(await t.all("SELECT v FROM meta WHERE k = 'corpus_rev'")).toEqual([{ v: "empty" }]);
  });

  it("refuses a database without the search schema", async () => {
    const t = new MiniflareD1Target({ persistTo: null, databaseId: "no-schema" });
    open.push(t);
    await expect(syncD1(t, miniMoments())).rejects.toBeInstanceOf(SchemaError);
  });
});

describe("D1 content meets the Worker", () => {
  it("FTS rows use search-core folding, so normalizeQuery spellings all match", async () => {
    const t = await db();
    const rows = miniMoments();
    await syncD1(t, rows);
    // Every Pesach spelling folds to the same tokens and finds the same moments. The Latin
    // spellings also keep their pre-variant form as an alternative (a prefix match on
    // `pesach*`, e.g. `pesachdik`), so they find at least as much.
    const results = await Promise.all(
      ["פסח", "פֶּסַח", "pesach", "Pesach"].map(async (q) => {
        const m = wordsMatch(normalizeQuery(q)) as string;
        return (await t.all<{ id: string }>("SELECT DISTINCT id FROM fts_words WHERE fts_words MATCH ? ORDER BY id", [m])).map((x) => x.id);
      }),
    );
    const [he, pointed, latin, latinCap] = results as [string[], string[], string[], string[]];
    expect(he.length).toBeGreaterThan(10);
    expect(pointed).toEqual(he);
    expect(latinCap).toEqual(latin);
    expect(latin).toEqual(expect.arrayContaining(he));
    expect(latin.length - he.length).toBeLessThan(he.length / 10);
    // Trigram table matches a prefixed Yiddish form (ב + תורה).
    const tri = trigramMatch(normalizeQuery("תורה")) as string;
    const triHits = await t.all<{ id: string }>("SELECT id FROM fts_tri WHERE fts_tri MATCH ? LIMIT 5", [tri]);
    expect(triHits.length).toBeGreaterThan(0);
  });

  it("moment_text holds display text; title-only kinds put the text in body", async () => {
    const t = await db();
    const rows = miniMoments();
    await syncD1(t, rows);
    const insight = rows.find((r) => r.kind === "insight")!;
    const txt = await t.all<{ lang: string; title: string | null; body: string }>("SELECT lang, title, body FROM moment_text WHERE id = ? ORDER BY lang", [insight.id]);
    expect(txt).toEqual([
      { lang: "en", title: null, body: insight.title_en },
      { lang: "yi", title: null, body: insight.title_yi },
    ]);
    const wp = rows.find((r) => r.kind === "writeup" && r.body_en !== null)!;
    const wpTxt = await t.all<{ lang: string }>("SELECT lang FROM moment_text WHERE id = ?", [wp.id]);
    expect(wpTxt).toEqual([{ lang: "en" }]);
    const m = await t.all<Record<string, unknown>>("SELECT * FROM moments WHERE id = ?", [insight.id]);
    expect(m[0]).toMatchObject({ shiur_id: insight.shiurId, kind: "insight", audio_lang: insight.lang, category: insight.facets.category, hash: insight.hash });
  });

  it("FTS rowids are stable per (moment, language)", () => {
    expect(ftsRowid("a~s1", "en")).toBe(ftsRowid("a~s1", "en"));
    expect(ftsRowid("a~s1", "en")).not.toBe(ftsRowid("a~s1", "yi"));
    expect(Number.isSafeInteger(ftsRowid("a~s1", "yi"))).toBe(true);
    const ids = miniMoments().flatMap((r) => [ftsRowid(r.id, "en"), ftsRowid(r.id, "yi")]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
