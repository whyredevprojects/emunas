# emunas: standing rules

Shiurim of Harav Moshe Wolfson zt"l: a data pipeline (`data/`, `scripts/`, `src/`, `config/`, `prompts/`) and two sites (`apps/quiet`, `apps/live`) with shared `packages/` and `workers/api`.

## How to refer to him

- In English: "the Mashgiach", "Rav Wolfson", "Rabbi Wolfson" or `Harav Moshe Wolfson zt"l`. In Yiddish: "דער משגיח". In Hebrew: "המשגיח" (formal: `הגה"צ רבי משה וולפסון זצ"ל`). Possessive: "the Mashgiach's".
- Never "the Rav" or "the Rov" (or "דער רב", "הרב") as a stand-in for him, and never `shlit"a` (`שליט"א`): he has passed away, so `zt"l` (`זצ"ל`).
- This applies to UI copy, labels, meta and SEO text, docs, prompts, and generated write-ups.
- Other people who are titled Rav keep their titles ("the Rav of Sanz", "Rav Chaim").

## Site names

- `apps/quiet` is branded **Library**. `apps/live` is branded **Analyze**, with the Hebrew name **עיון**. Analyze is the advanced app with more data.
- The rename is branding only: UI copy, titles and meta. Folder names, package names, internal code names (`formatQuiet` and so on), docs file names, CI and Worker names stay `quiet`/`live`.
- Analyze keeps the `listen.` subdomain for now. It may still be renamed.
- Planned: the second edition switches from Yiddish to Hebrew. The owner will do this later, so don't start it unasked.

## Transcripts are never published

- The transcripts, and anything derived from them verbatim, must never reach any public output. That covers ASR text, `heardAs`, `asrNotes`, `asrVariants`, segment text, `data/derived/corpus/raw/`, and unresolved raw extraction names.
- Only `packages/corpus/src/transcript-gate.ts` and `packages/corpus-guard` may read `data/transcripts`.
- The guard post-pass over every build output must report 0 findings.
- Published text never mentions the transcript (or ASR) and never judges the shiur itself ("the shiur is garbled/unclear", "a garbled stretch"). Remarks on the sound or the recording are fine ("poor sound quality", "the recording cuts off").

## Languages

- Three languages: English (`en`), Yiddish (`yi`) and Hebrew (`he`). Both sites and all generated content support all three, and nothing hardcodes the set: code iterates `UI_LANGS` from `@emunas/i18n`, so adding a language means adding it there, its message tables, and its translation run.
- The pipeline writes `en` and `yi` from the transcript. Every other language is a P4c translation overlay of that published text (`docs/translation-runbook.md`); text with no current translation falls back to Yiddish.
- UI Yiddish: when a Yiddish UI word is hard to translate (no natural Chassidish Yiddish word, or only a Daytshmerish or English-sounding one), just use the Hebrew word.

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

## Known CI failures

Some CI gates fail as the data grows, not because of a bug: the search eval baseline, the Live axe timeouts and the Today file budget (one `today.<lang>.json` per UI language). Before debugging one, read "Known CI failures that can come back" in `docs/sites/ops-runbook.md` §8. It explains how to tell data growth from a regression, and what to do about each. Add new cases there.
