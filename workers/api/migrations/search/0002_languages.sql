-- Every interface language (UI_LANGS in @emunas/i18n: en, yi, he, …), with no language list in
-- the schema: a language added there needs no migration here.
--
-- The index is rebuildable, so this migration drops it and creates it again; the next sync
-- (`search:sync`, W3.10) sees an empty index and writes every moment. Changes from 0001:
--  - moments.title_en / title_yi → moments.titles, a JSON object of language → generated display
--    title (the Worker reads it key by key, `parseTitles`);
--  - moment_text.lang has no fixed language list (the sync writes UI_LANGS keys only, and the
--    Worker skips any other value);
--  - meta.schema_version 2, corpus_rev reset.
-- Only generated and catalog text is ever written here (integration-plan §0.1–0.2):
-- no ASR text, no heardAs / asrNotes, no transcript-derived field of any kind.

DROP TABLE IF EXISTS fts_words;
DROP TABLE IF EXISTS fts_tri;
DROP TABLE IF EXISTS moment_text;
DROP TABLE IF EXISTS moment_entities;
DROP TABLE IF EXISTS moments;

-- One row per moment (shiur-level row, section, insight, question, takeaway, story,
-- keypoint, writeup paragraph). Facets are shiur-level values copied onto each moment.
CREATE TABLE moments (
  id          TEXT PRIMARY KEY,          -- <shiurId>~<kind><idx>, or <shiurId>~wp<block>.<para>.<lang>
  shiur_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- shiur|section|insight|question|takeaway|story|keypoint|writeup
  t           REAL NOT NULL,             -- global seconds
  end_t       REAL,
  audio_lang  TEXT NOT NULL,             -- en|yi (language of the recording)
  category    TEXT NOT NULL,
  occasion    TEXT,                      -- parsha or zman key (@emunas/normalize)
  series      TEXT,
  year        INTEGER,                   -- first Hebrew year or NULL
  catalogued  INTEGER NOT NULL DEFAULT 0,
  confidence  REAL,
  titles      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(titles) AND json_type(titles) = 'object'),
                                         -- {"<lang>": "<generated display title>", …}
  hash        TEXT NOT NULL              -- sha256(schemaVersion + text + metadata), sync diff key
);
CREATE INDEX moments_shiur ON moments(shiur_id);
CREATE INDEX moments_facets ON moments(audio_lang, kind, category);
CREATE INDEX moments_year ON moments(year);

CREATE TABLE moment_entities (
  moment_id TEXT NOT NULL,
  type      TEXT NOT NULL,               -- work|person|concept|topic
  entity_id TEXT NOT NULL,
  PRIMARY KEY (moment_id, type, entity_id)
);
CREATE INDEX me_entity ON moment_entities(type, entity_id);

-- Display text per (moment, language): the generated title and body exactly as shown on
-- the site (after normalizeHe). Snippets are cut from here and nowhere else.
CREATE TABLE moment_text (
  id    TEXT NOT NULL,
  lang  TEXT NOT NULL CHECK (length(lang) BETWEEN 2 AND 8 AND lang NOT GLOB '*[^a-z]*'),
  title TEXT,
  body  TEXT NOT NULL,
  PRIMARY KEY (id, lang)
);

-- Search form of the same text: fold() from @emunas/normalize (via search-core), so that
-- query tokens from normalizeQuery() compare equal. Never returned to clients.
CREATE VIRTUAL TABLE fts_words USING fts5(id UNINDEXED, lang UNINDEXED, title, body,
  tokenize = "unicode61 remove_diacritics 2");
-- Trigram table: Hebrew/Yiddish prefixes attach to words, so a prefixed form must match the bare word.
CREATE VIRTUAL TABLE fts_tri USING fts5(id UNINDEXED, lang UNINDEXED, title, body,
  tokenize = "trigram");

INSERT OR REPLACE INTO meta (k, v) VALUES ('schema_version', '2'), ('corpus_rev', 'empty');
