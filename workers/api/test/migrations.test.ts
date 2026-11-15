import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "./helpers.ts";

async function names(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name")
    .all<{ name: string }>();
  return results.map((r) => r.name);
}

describe("D1 migrations on a fresh local database", () => {
  beforeAll(migrate);

  it("emunas-search has the planned tables, indexes and FTS5 tables", async () => {
    const n = await names(env.DB_SEARCH);
    for (const t of ["moments", "moment_entities", "moment_text", "fts_words", "fts_tri", "meta", "moments_shiur", "me_entity"]) {
      expect(n).toContain(t);
    }
    const sql = await env.DB_SEARCH.prepare("SELECT sql FROM sqlite_master WHERE name IN ('fts_words', 'fts_tri') ORDER BY name").all<{ sql: string }>();
    expect(sql.results[0]?.sql).toContain("trigram");
    expect(sql.results[1]?.sql).toContain("unicode61 remove_diacritics 2");
  });

  it("seeds meta with schema_version and an empty corpus_rev", async () => {
    const { results } = await env.DB_SEARCH.prepare("SELECT k, v FROM meta WHERE k IN ('schema_version', 'corpus_rev') ORDER BY k").all();
    expect(results).toEqual([
      { k: "corpus_rev", v: "empty" },
      { k: "schema_version", v: "1" },
    ]);
  });

  it("emunas-feedback has the feedback table without any IP column", async () => {
    expect(await names(env.DB_FEEDBACK)).toContain("feedback");
    const { results } = await env.DB_FEEDBACK.prepare("SELECT name FROM pragma_table_info('feedback') ORDER BY cid").all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual([
      "id", "created_at", "shiur_id", "moment_id", "field", "reason", "text", "ui", "rev", "ua_hash", "status",
    ]);
  });

  it("re-applying the migrations is a no-op", async () => {
    await applyD1Migrations(env.DB_SEARCH, env.TEST_SEARCH_MIGRATIONS);
    await applyD1Migrations(env.DB_FEEDBACK, env.TEST_FEEDBACK_MIGRATIONS);
    expect(await names(env.DB_SEARCH)).toContain("moments");
  });

  it("the trigram table matches a Hebrew word inside a prefixed form; the word table does not", async () => {
    await env.DB_SEARCH.batch([
      env.DB_SEARCH.prepare("INSERT INTO fts_tri (id, lang, title, body) VALUES ('x~s0', 'yi', '', 'מען לערנט בתורה')"),
      env.DB_SEARCH.prepare("INSERT INTO fts_words (id, lang, title, body) VALUES ('x~s0', 'yi', '', 'מען לערנט בתורה')"),
    ]);
    const tri = await env.DB_SEARCH.prepare("SELECT id FROM fts_tri WHERE fts_tri MATCH ?").bind('"תורה"').all();
    const words = await env.DB_SEARCH.prepare("SELECT id FROM fts_words WHERE fts_words MATCH ?").bind('"תורה"').all();
    expect(tri.results).toEqual([{ id: "x~s0" }]);
    expect(words.results).toEqual([]);
    await env.DB_SEARCH.batch([
      env.DB_SEARCH.prepare("DELETE FROM fts_tri WHERE id = 'x~s0'"),
      env.DB_SEARCH.prepare("DELETE FROM fts_words WHERE id = 'x~s0'"),
    ]);
  });

  it("feedback constraints reject an unknown reason and over-long text", async () => {
    const insert = (reason: string, text: string) =>
      env.DB_FEEDBACK.prepare(
        "INSERT INTO feedback (id, created_at, shiur_id, reason, text, ui, rev, ua_hash) VALUES (?, '2026-01-01T00:00:00Z', 's', ?, ?, 'en', 'r', 'h')",
      )
        .bind(crypto.randomUUID(), reason, text)
        .run();
    await expect(insert("spam", "x")).rejects.toThrow();
    await expect(insert("other", "x".repeat(1001))).rejects.toThrow();
  });
});
