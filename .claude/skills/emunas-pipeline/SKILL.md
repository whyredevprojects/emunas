---
name: emunas-pipeline
description: Run, resume or redo the emunas shiurim data pipeline (Harav Moshe Wolfson shiurim) - sync transcripts from R2, ingest the catalogs, and process every shiur with Opus subagents into extractions and bilingual write-ups via batch runs, then translate the published text into further languages (Hebrew) as overlays. Use when the user wants to (re)run processing, add or replace transcripts (e.g. a new, better transcription), translate (P4c), check progress, or fix a stuck batch.
---

# Emunas pipeline

Turns transcripts of ~1,000 shiurim into structured data (sections with timestamps, summaries, sources, insights, stories, Q&A, takeaways) and a long-form write-up, in English and Yiddish, using Claude Opus subagents; P4c then translates the published text into further languages (today Hebrew) as overlay files. Work happens on the session's own branch and reaches `main` through a pull request; progress survives in git. This session runs the batches itself: there is no separate runner session or scheduled task.

Read these before acting: `docs/data-generation-plan.md` (what and why), `docs/pilot-results.md` (model choice: Opus for everything, no cleanup pass), `docs/batch-runbook.md` (the exact per-batch procedure).

## Pieces

| Thing | Where |
|---|---|
| Catalogs (2012 pocket guide + uncatalogued guide) | `data/catalog/` |
| Transcripts, compact, one per recording | `data/transcripts/<recordingId>.json` (fields: key, duration, model, mode, transcribedAt, segments `[start,end,text]`) |
| Shiur / recording / series records | `data/derived/ingest.json` (`npm run ingest`) |
| Work queue, one entry per in-scope shiur | `data/derived/manifest.json` (`npm run batch:*`) |
| Outputs | `data/derived/shiurim/<shiurId>/{input.txt,meta.json,extraction.json,writeup.json}` |
| Audits, usage log | `data/derived/audits/`, `data/derived/usage.tsv` |
| Prompts | `prompts/run-shiur.md` (per-shiur agent), `p4-extract.md`, `p4b-writeup.md`, `yiddish-style.md`, `p4c-translate.md`, `hebrew-style.md`, `audit.md`, `judge.md` |
| Translations (P4c): further content languages (`TRANSLATION_LANGS` in `src/types.ts`, today `he`) as overlays keyed by text path and pinned to a hash of the en/yi source | `data/derived/shiurim/<shiurId>/i18n/<lang>.json`, `data/derived/corpus/i18n/<lang>/<part>.json` (`npm run translate`, `scripts/translate.ts`; procedure in `docs/translation-runbook.md`) |
| Which transcripts may be processed | `config/asr-policy.json` |

R2 access (bucket `emunas`, transcripts under `transcripts/`) needs `.env` with `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. It is gitignored: ask the user for the keys (never commit them, never print them). Only the sync step needs them; batches run from the repo alone.

## Common jobs

### Check progress
```
git pull && npm run -s batch:status
```
### Pull in new or updated transcripts (same transcriber)
```
npm run -s transcripts:sync            # downloads only what's missing
npm run -s ingest && npm run -s batch:init
```
`batch:init` keeps every status; new shiurim come in as pending.

### Add new recordings (e.g. from an outside site)
Done once for the Chabad 19 Kislev melave malka talks (commits "Catalog the Mashgiach's 19 Kislev..." through "Corpus: add the 15 new 19 Kislev shiurim incrementally").
1. **Check for duplicates first, by audio.** File names and lengths are not enough: 3 of 18 such files were recordings already in the collection under other names (a Chanukah file, a parsha file), with an announcement added at the start. Compare text similarity of the extractions (catches candidates after processing) and, before upload, cross-correlate a minute of audio against likely candidates (same zman/parsha, length within a minute). A copy goes in the catalog with `duplicate_of`, not as a new shiur.
2. **Catalog before R2.** Add rows to `data/catalog/uncatalogued-guide.json` (and the file to `uncatalogued-audio.json`) first: ingest fails on bucket audio that no catalog lists, but only warns on catalog rows without audio. Rows from an outside source carry `"source"` and its ids in the note.
3. **Transcribe on Kaggle** (the user's account; `KAGGLE_API_TOKEN`): Yiddish with `ivrit-ai/yi-whisper-large-v3-ct2`, faster-whisper, float16, sequential `beam_size=5`, `vad_filter=True`, `condition_on_previous_text=False`, `language="yi"`; mark `"mode": "careful"` so `config/asr-policy.json` accepts it. Stock Whisper language detection calls Yiddish "de" (and sometimes "en"): check any file it routes to English. R2 objects per audio key: `transcripts/<key stem>.{txt,vtt,json}`, `.json` last (key, duration, model, mode, transcribed_at, language, segments, text).
4. **Sidon copy** for every playable recording at `fixed/sidon/<audio key>` (sarulab-speech/sidon-v0.1, 96 s chunks, fp16; MP3 48 kHz mono 64 kbps, loudnorm -16 LUFS, the original's tags copied). `npm run cleaned:verify --workspace=@emunas/audio -- --verify-duration` must pass (within 0.5 s).
5. Upload, then `ingest`, `transcripts:sync`, `batch:init`; run the batch (`docs/batch-runbook.md`) and P4c for the new shiurim.
6. **Corpus layer, incrementally:** `corpus:aggregate`; agents write a new `topic-tags/chunk-NN-<name>.json` (closed list), aliases/new entities, story tellings and teaching-cluster members (each agent its own files); `corpus:link`; `corpus:assemble` (integrity must show no issues, existing shiur-tags unchanged except where new aliases add a link); then P4c for the corpus parts `translate -- status he` reports.

### Redo everything with a new, better transcription (e.g. a sponsor pays for one)
1. Find what marks the new transcripts in R2 (a new `model`, a `mode`, a `transcribed_at`). Last time the model name stayed the same and only `"mode": "careful"` changed, so check a few files before assuming.
2. Edit `config/asr-policy.json` so each language requires the new marker, e.g. `"yi": { "model": "new-model-name" }`. `batch:next` then skips any shiur whose transcript doesn't match yet, so batches can run while the transcription job is still going.
3. Note the current commit (`git rev-parse HEAD`), then refresh: `npm run -s transcripts:sync -- --refresh-lang yi` (or `--refresh` for all languages), `npm run -s ingest`, `npm run -s batch:init`.
4. Re-queue everything processed from the old transcripts: `npm run -s batch:reset-changed -- <that commit> --dry-run`, check the list, then run it without `--dry-run`. It sets them to pending and deletes their outputs and audits. If the whole language is being redone, all of its done shiurim will show up here once their transcripts change.
5. Commit and push, then run batches (below). While the transcription job is still running, repeat steps 3–5 between batches, never during one.

### Run batches
Follow `docs/batch-runbook.md` in this session: `batch:next` prints one prompt per group, each goes to an Opus subagent (Agent tool, at most 18 at once), then `batch:finalize`, one audit, commit and push to your branch.
- Batch size: one shiur costs ~155–190k subagent tokens (Opus, extraction + write-up in one agent). Ask the user what share of their session limit a batch may use and calibrate from the first batch: on Max 5x a 60-shiur batch used ~80% of a 5-hour window; on Max 10x use ~135.

### Translate into Hebrew (P4c)
Follow `docs/translation-runbook.md`; the agent contract is `prompts/p4c-translate.md`, the wording rules `prompts/hebrew-style.md`. Translation reads only the published en/yi text, never transcripts, `input.txt` or `heardAs`/`asrNotes`.
```
npm run -s translate -- status he                          # done / stale / missing
npm run -s translate -- status he --missing --shard 2/5    # shiur ids still to do in shard 2 of 5
npm run -s translate -- source he <shiurId...>             # sources into out/translate/he/shiurim/
npm run -s translate -- corpus-source he                   # corpus parts into out/translate/he/corpus/
npm run -s translate -- validate <file...>                 # check outputs before committing
```
- One session per shard (`--shard k/N`), each launching Opus subagents on groups of 3–4 shiurim or 1–2 corpus parts with the runbook's prompt template. Run one group alone first and read it against `hebrew-style.md`.
- Validate every output yourself, commit only `data/derived/**/i18n/**` (never `out/`), push every few groups.
- A shiur reprocessed after translation shows as **stale** in `status`: translate it again. The sites skip stale overlays and fall back to Yiddish meanwhile.
- Another language: "Adding another language" in the runbook.

### Change prompts
Edit the prompt and bump its version constant (`scripts/lib/versions.ts`); `batch:next` refuses to run if prompt headers and versions disagree. Re-run already-done shiurim only if the change matters: `npm run -s batch:mark -- <id> pending`.

## Known problems and fixes

- **Dropped task notification.** A worker restart can drop a subagent's notification. Never wait more than 15 minutes: check the agent's output files on disk, log missing usage as `0 0 0 no-usage`, finalize, commit, push.
- **Language starvation.** `batch:next` interleaves languages by catalog order; if one language stalls, run a batch with `--lang en|yi`.
- **Subagent limit.** At most 20 concurrent subagents per session; the runbook keeps 18.
- **Agents using stray tools.** Agent prompts say file and shell tools only. Haiku did this more than Opus; don't use Haiku for extraction (it also lost every quality comparison).

## Quality checks
- `npm run -s validate -- <files>` runs every structural rule (timestamps tile, caps, both languages present, source-reference rules, write-up length).
- Each batch audits one random shiur (`prompts/audit.md`); `serious` marks it `needs_review`.
- For model or prompt comparisons, follow the pilot setup: blind X/Y pairs (`scripts/blind-pair.ts`) judged by Opus with `prompts/judge.md`, counting concrete errors.
