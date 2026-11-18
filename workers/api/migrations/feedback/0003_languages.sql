-- feedback.ui takes every interface language (UI_LANGS in @emunas/i18n: en, yi, he, …) with no
-- language list in the schema; the Worker accepts only UI_LANGS values (`isUiLang`). SQLite cannot
-- change a CHECK in place, so the table is rebuilt and every report is copied over unchanged
-- (including `audio`, added by 0002_audio.sql).

CREATE TABLE feedback_next (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,                       -- ISO 8601 UTC
  shiur_id   TEXT NOT NULL,
  moment_id  TEXT,
  field      TEXT CHECK (field IS NULL OR field IN ('source', 'person', 'time', 'summary', 'other')),
  reason     TEXT NOT NULL CHECK (reason IN ('wrong-source', 'wrong-name', 'wrong-time', 'misrepresents', 'other')),
  text       TEXT CHECK (text IS NULL OR length(text) <= 1000),
  ui         TEXT NOT NULL CHECK (length(ui) BETWEEN 2 AND 8 AND ui NOT GLOB '*[^a-z]*'),
  rev        TEXT NOT NULL,
  ua_hash    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'rejected')),
  audio      TEXT CHECK (audio IS NULL OR audio IN ('cleaned', 'original'))
);
INSERT INTO feedback_next (id, created_at, shiur_id, moment_id, field, reason, text, ui, rev, ua_hash, status, audio)
  SELECT id, created_at, shiur_id, moment_id, field, reason, text, ui, rev, ua_hash, status, audio FROM feedback;
DROP TABLE feedback;
ALTER TABLE feedback_next RENAME TO feedback;
CREATE INDEX feedback_status ON feedback(status, created_at);
CREATE INDEX feedback_shiur ON feedback(shiur_id);
