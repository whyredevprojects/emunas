-- emunas-search (rebuildable index; W3.10 syncs it from .corpus/search/moments.ndjson).
-- Only generated and catalog text is ever written here (integration-plan §0.1–0.2):
-- no ASR text, no heardAs / asrNotes, no transcript-derived field of any kind.

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
  title_en    TEXT,                      -- generated display titles only
  title_yi    TEXT,
  hash        TEXT NOT NULL              -- sha256(schemaVersion + text + metadata), sync diff key
);
CREATE INDEX moments_shiur ON moments(shiur_id);
CREATE INDEX moments_facets ON moments(audio_lang, kind, category);
CREATE INDEX moments_year ON moments(year);

CREATE TABLE moment_entities (
  moment_id TEXT NOT NULL,
  type      TEXT NOT NULL,               -- work|person|concept
  entity_id TEXT NOT NULL,
  PRIMARY KEY (moment_id, type, entity_id)
);
CREATE INDEX me_entity ON moment_entities(type, entity_id);

-- Display text per (moment, language): the generated title and body exactly as shown on
-- the site (after normalizeHe). Snippets are cut from here and nowhere else.
CREATE TABLE moment_text (
  id    TEXT NOT NULL,
  lang  TEXT NOT NULL CHECK (lang IN ('en', 'yi')),
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

CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);   -- corpus_rev, schema_version
INSERT INTO meta (k, v) VALUES ('schema_version', '1'), ('corpus_rev', 'empty');
