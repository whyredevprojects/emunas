import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "./helpers.ts";
import { UI_LANGS } from "@emunas/i18n";
import { ENTITY_TYPES } from "../src/contract.ts";
import { EXPECTED_SCHEMA_VERSION } from "../sync/src/d1-sync.ts";

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

  it("moment_entities.type is unconstrained TEXT: every ENTITY_TYPES value (incl. topic) is storable without a migration", async () => {
    const { results } = await env.DB_SEARCH.prepare("SELECT sql FROM sqlite_master WHERE name = 'moment_entities'").all<{ sql: string }>();
    expect(results[0]?.sql).not.toMatch(/CHECK/i);
    const db = env.DB_SEARCH;
    await db.batch(ENTITY_TYPES.map((type) => db.prepare("INSERT INTO moment_entities (moment_id, type, entity_id) VALUES ('mig-x~s0', ?, 'emunah')").bind(type)));
    const rows = await db.prepare("SELECT type FROM moment_entities WHERE moment_id = 'mig-x~s0' ORDER BY type").all<{ type: string }>();
    expect(rows.results.map((r) => r.type)).toEqual([...ENTITY_TYPES].sort());
    await db.prepare("DELETE FROM moment_entities WHERE moment_id = 'mig-x~s0'").run();
  });

  it("seeds meta with schema_version and an empty corpus_rev", async () => {
    const { results } = await env.DB_SEARCH.prepare("SELECT k, v FROM meta WHERE k IN ('schema_version', 'corpus_rev') ORDER BY k").all();
    expect(results).toEqual([
      { k: "corpus_rev", v: "empty" },
      { k: "schema_version", v: EXPECTED_SCHEMA_VERSION },
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

  it("moments carry one titles JSON object (no per-language columns); moment_text takes every interface language", async () => {
    const cols = await env.DB_SEARCH.prepare("SELECT name FROM pragma_table_info('moments') ORDER BY cid").all<{ name: string }>();
    const names = cols.results.map((r) => r.name);
    expect(names).toContain("titles");
    expect(names.filter((n) => n.startsWith("title_"))).toEqual([]);
    const db = env.DB_SEARCH;
    const moment = (id: string, titles: string) =>
      db.prepare("INSERT INTO moments (id, shiur_id, kind, t, audio_lang, category, titles, hash) VALUES (?, 'mig', 'section', 0, 'yi', 'misc', ?, 'h')").bind(id, titles).run();
    await moment("mig~s0", JSON.stringify({ en: "A", yi: "ב", he: "ג" }));
    for (const bad of ["not json", "[1]", '"x"']) await expect(moment("mig~s1", bad)).rejects.toThrow();
    await db.batch(UI_LANGS.map((l) => db.prepare("INSERT INTO moment_text (id, lang, title, body) VALUES ('mig~s0', ?, NULL, 'b')").bind(l)));
    for (const bad of ["EN", "e", "h e", "verylonglang"]) {
      await expect(db.prepare("INSERT INTO moment_text (id, lang, title, body) VALUES ('mig~s0', ?, NULL, 'b')").bind(bad).run()).rejects.toThrow();
    }
    await db.batch([db.prepare("DELETE FROM moment_text WHERE id = 'mig~s0'"), db.prepare("DELETE FROM moments WHERE shiur_id = 'mig'")]);
  });

  it("feedback 0002 keeps every report and lets ui take every interface language", async () => {
    // Replay the feedback migrations on a scratch copy (in the search database, where no feedback
    // table exists): a report stored under 0001 survives 0002 unchanged.
    const db = env.DB_SEARCH;
    const [first, second] = env.TEST_FEEDBACK_MIGRATIONS;
    expect(first?.name).toMatch(/^0001_/);
    expect(second?.name).toMatch(/^0002_/);
    for (const q of first!.queries) await db.prepare(q).run();
    await db
      .prepare("INSERT INTO feedback (id, created_at, shiur_id, moment_id, field, reason, text, ui, rev, ua_hash, status) VALUES ('old', '2026-01-01T00:00:00Z', 's', 's~s0', 'source', 'other', 'טעקסט', 'yi', 'r', 'h', 'done')")
      .run();
    for (const q of second!.queries) await db.prepare(q).run();
    expect(await db.prepare("SELECT * FROM feedback").all()).toMatchObject({
      results: [{ id: "old", created_at: "2026-01-01T00:00:00Z", shiur_id: "s", moment_id: "s~s0", field: "source", reason: "other", text: "טעקסט", ui: "yi", rev: "r", ua_hash: "h", status: "done" }],
    });
    await db.prepare("DROP TABLE feedback").run();
    // The real feedback database is on 0002.
    const insert = (ui: string) =>
      env.DB_FEEDBACK.prepare("INSERT INTO feedback (id, created_at, shiur_id, reason, ui, rev, ua_hash) VALUES (?, '2026-01-01T00:00:00Z', 's', 'other', ?, 'r', 'h')")
        .bind(crypto.randomUUID(), ui)
        .run();
    for (const l of UI_LANGS) await insert(l);
    for (const bad of ["EN", "x", "e n", "<script>"]) await expect(insert(bad)).rejects.toThrow();
    const idx = await env.DB_FEEDBACK.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'feedback' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>();
    expect(idx.results.map((r) => r.name)).toEqual(["feedback_shiur", "feedback_status"]);
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
