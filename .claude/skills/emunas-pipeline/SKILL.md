---
name: emunas-pipeline
description: Run, resume or redo the emunas shiurim data pipeline (Harav Moshe Wolfson shiurim) - sync transcripts from R2, ingest the catalogs, and process every shiur with Opus subagents into extractions and bilingual write-ups via scheduled batch runs. Use when the user wants to (re)run processing, add or replace transcripts (e.g. a new, better transcription), check progress, or fix a stuck batch.
---

# Emunas pipeline

Turns transcripts of ~1,000 shiurim into structured data (sections with timestamps, summaries, sources, insights, stories, Q&A, takeaways) and a long-form write-up, in English and Yiddish, using Claude Opus subagents. Everything lives on branch `claude/vibrant-curie-ioreux` (or whatever branch the user names); progress survives in git.

Read these before acting: `docs/data-generation-plan.md` (what and why), `docs/pilot-results.md` (model choice: Opus for everything, no cleanup pass), `docs/batch-runbook.md` (the exact per-batch procedure the runner follows).

## Pieces

| Thing | Where |
|---|---|
| Catalogs (2012 pocket guide + uncatalogued guide) | `data/catalog/` |
| Transcripts, compact, one per recording | `data/transcripts/<recordingId>.json` (fields: key, duration, model, mode, transcribedAt, segments `[start,end,text]`) |
| Shiur / recording / series records | `data/derived/ingest.json` (`npm run ingest`) |
| Work queue, one entry per in-scope shiur | `data/derived/manifest.json` (`npm run batch:*`) |
| Outputs | `data/derived/shiurim/<shiurId>/{input.txt,meta.json,extraction.json,writeup.json}` |
| Audits, usage log | `data/derived/audits/`, `data/derived/usage.tsv` |
| Prompts | `prompts/run-shiur.md` (per-shiur agent), `p4-extract.md`, `p4b-writeup.md`, `yiddish-style.md`, `audit.md`, `judge.md` |
| Which transcripts may be processed | `config/asr-policy.json` |

R2 access (bucket `emunas`, transcripts under `transcripts/`) needs `.env` with `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. It is gitignored: ask the user for the keys (never commit them, never print them). Only the sync step needs them; batches run from the repo alone.

## Common jobs

### Check progress
```
git pull && npm run -s batch:status
```
For the runner session's state, use `get_session` on it (find it with `list_sessions`, title "Emunas batch runner").

### Pull in new or updated transcripts (same transcriber)
```
npm run -s transcripts:sync            # downloads only what's missing
npm run -s ingest && npm run -s batch:init
```
`batch:init` keeps every status; new shiurim come in as pending.

### Redo everything with a new, better transcription (e.g. a sponsor pays for one)
1. Find what marks the new transcripts in R2 (a new `model`, a `mode`, a `transcribed_at`). Last time the model name stayed the same and only `"mode": "careful"` changed, so check a few files before assuming.
2. Edit `config/asr-policy.json` so each language requires the new marker, e.g. `"yi": { "model": "new-model-name" }`. `batch:next` then skips any shiur whose transcript doesn't match yet, so batches can run while the transcription job is still going.
3. Note the current commit (`git rev-parse HEAD`), then refresh: `npm run -s transcripts:sync -- --refresh-lang yi` (or `--refresh` for all languages), `npm run -s ingest`, `npm run -s batch:init`.
4. Re-queue everything processed from the old transcripts: `npm run -s batch:reset-changed -- <that commit> --dry-run`, check the list, then run it without `--dry-run`. It sets them to pending and deletes their outputs and audits. If the whole language is being redone, all of its done shiurim will show up here once their transcripts change.
5. Commit and push, then let the scheduled batches run (below). While the transcription job is still running, repeat step 3–5 every few hours (a scheduled refresh task in the session that holds `.env` works well), always between batches, never during one.

### Run batches
Batches are run by a dedicated **runner session** that has the repo attached, woken by a **scheduled task**.
- Runner: `create_session` with `source_url` `https://github.com/whyredevprojects/emunas`, `source_revision` = the working branch, `outcome_branch` = same, model Opus. First message: check out the branch, `npm ci`, read `docs/batch-runbook.md`, dry-run push, don't start a batch. Scheduled tasks that start a fresh session each time do NOT work here: they get an empty container with no repo or GitHub credentials.
- Schedule: `create_trigger` with `persistent_session_id` = the runner, cron every 5 hours, prompt "Run a batch: git pull first, then follow docs/batch-runbook.md exactly with N = <size> ...". A trigger's prompt can only be edited from the session it posts into, so to change it from elsewhere, create a new trigger and delete the old one.
- Batch size: one shiur costs ~155–190k subagent tokens (Opus, extraction + write-up in one agent). Ask the user what share of their session limit a batch may use and calibrate from the first batch: on Max 5x a 60-shiur batch used ~80% of a 5-hour window; on Max 10x use ~135. Set N in the runbook and in the trigger prompt.
- Starting one now: `fire_trigger`, or `send_message` to the runner with explicit instructions (include "git pull / reset to origin first" when you've pushed changes it doesn't have).

### Change prompts
Edit the prompt and bump its version constant (`scripts/lib/versions.ts`); `batch:next` refuses to run if prompt headers and versions disagree. Re-run already-done shiurim only if the change matters: `npm run -s batch:mark -- <id> pending`.

## Known problems and fixes

- **Runner idle but batch not committed.** It was waiting on a task notification that a worker restart dropped. Message it: finish now, log missing usage as `0 0 0 no-usage`, finalize, commit, push. The runbook now says never wait more than 15 minutes and runs the audit in the foreground.
- **Refresh vs batch race.** A transcript refresh pushed while a batch is running makes the runner's push conflict on `manifest.json`. The runbook resolves a manifest-only conflict (take the batch's file, run `batch:init`, continue). If the runner instead pushed to a side branch `claude/batch-<id>`: merge it, take its manifest (`git checkout --theirs`), run `batch:init`, check with `reset-changed --dry-run` that none of its shiurim used a transcript the refresh changed, commit, push. Refresh only between batches: the runner doesn't commit `in_progress`, so check its session status, not the manifest.
- **Language starvation.** `batch:next` interleaves languages by catalog order; if one language stalls, run a batch with `--lang en|yi`.
- **Subagent limit.** At most 20 concurrent subagents per session; the runbook keeps 18.
- **Agents using stray tools.** Agent prompts say file and shell tools only. Haiku did this more than Opus; don't use Haiku for extraction (it also lost every quality comparison).

## Quality checks
- `npm run -s validate -- <files>` runs every structural rule (timestamps tile, caps, both languages present, source-reference rules, write-up length).
- Each batch audits one random shiur (`prompts/audit.md`); `serious` marks it `needs_review`.
- For model or prompt comparisons, follow the pilot setup: blind X/Y pairs (`scripts/blind-pair.ts`) judged by Opus with `prompts/judge.md`, counting concrete errors.
