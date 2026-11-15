-- emunas-feedback: user reports ("something's wrong here"). Never wiped by deploys.
-- No IP address is stored; ua_hash is sha256(FEEDBACK_HASH_SALT + user agent).
CREATE TABLE feedback (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,                       -- ISO 8601 UTC
  shiur_id   TEXT NOT NULL,
  moment_id  TEXT,
  field      TEXT CHECK (field IS NULL OR field IN ('source', 'person', 'time', 'summary', 'other')),
  reason     TEXT NOT NULL CHECK (reason IN ('wrong-source', 'wrong-name', 'wrong-time', 'misrepresents', 'other')),
  text       TEXT CHECK (text IS NULL OR length(text) <= 1000),
  ui         TEXT NOT NULL CHECK (ui IN ('en', 'yi')),
  rev        TEXT NOT NULL,
  ua_hash    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'rejected'))
);
CREATE INDEX feedback_status ON feedback(status, created_at);
CREATE INDEX feedback_shiur ON feedback(shiur_id);
