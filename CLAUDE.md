# emunas: standing rules

Shiurim of Harav Moshe Wolfson zt"l: a data pipeline (`data/`, `scripts/`, `src/`, `config/`, `prompts/`) and two sites (`apps/quiet`, `apps/live`) with shared `packages/` and `workers/api`.

## How to refer to him

- Always **"the Mashgiach"** in English and **"דער משגיח"** in Yiddish. Never "the Rav" or "the Rov" (or "דער רב") for him. This applies to UI copy, labels, meta and SEO text, docs, prompts, and generated write-ups.
- Possessive: "the Mashgiach's".
- Other people who are titled Rav keep their titles ("the Rav of Sanz", "Rav Chaim").

## Transcripts are never published

- The transcripts, and anything derived from them verbatim, must never reach any public output. That covers ASR text, `heardAs`, `asrNotes`, `asrVariants`, segment text, `data/derived/corpus/raw/`, and unresolved raw extraction names.
- Only `packages/corpus/src/transcript-gate.ts` and `packages/corpus-guard` may read `data/transcripts`.
- The guard post-pass over every build output must report 0 findings.
- Published text never mentions the transcript (or ASR) and never judges the shiur itself ("the shiur is garbled/unclear", "a garbled stretch"). Remarks on the sound or the recording are fine ("poor sound quality", "the recording cuts off").

## No backwards compatibility

- The sites have never been published. Do not add any of the following:
  - redirects or stub pages
  - legacy keys or routes
  - "kept for compatibility" fields
  - version shims or migrations of old client state
- Change things directly and delete the old version.

## Ownership and branches

- **Pipeline:** `data/`, `scripts/`, `src/`, `config/` and `prompts/` belong to the pipeline session (branch `claude/vibrant-curie-ioreux`). Site work does not modify them.
- **Site work:** goes on its own branch and reaches `main` through a pull request. Never push to `main` directly.

## Dedication

Every page of both sites ends with the line `לעילוי נשמת אשר בן ישראל` at the bottom of the footer. It is small, muted and centered, with nothing else around it.

## Secrets

`.env` holds the Cloudflare and R2 credentials. It is gitignored. Never commit it, print it or send it anywhere other than Cloudflare.
