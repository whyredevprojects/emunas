# Search index sync (W3.10)

Brings the `emunas-api` search index up to date with `.corpus/search/moments.ndjson`
(search-core `MomentRow`s, written by `search:build`): D1 `emunas-search` rows, embeddings
through Workers AI with a cache in R2 `emunas-site-build`, and Vectorize `emunas-moments`.
It runs in Node (CI or a laptop), not in the Worker.

```
moments.ndjson ──validate (allow-list)──► leak guard ──► Vectorize diff ──► D1 diff ──► meta.corpus_rev
```

## What it writes

Languages: every `UI_LANGS` language (`@emunas/i18n`) whose `title_<lang>` and `body_<lang>` are in
search-core's `MOMENT_ROW_FIELDS` (`ROW_LANGS` in `src/rows.ts`). The sync lists no languages itself;
the FTS rows of a changed moment are deleted in every `UI_LANGS` language. It needs search schema
version 2 (`migrations/search/0002_languages.sql`).

| Target | Content | Diff key |
|---|---|---|
| D1 `moments` | one row per moment; facets copied from the shiur; `titles` = JSON object of language → display title (normalizeHe); `confidence` = 0.6 for `soft` items, else NULL | `hash` (search-core content hash) |
| D1 `moment_entities` | `(moment_id, work\|person\|concept\|topic, corpus id)` from `MomentRow.entities` (`works`, `people`, `concepts`, `topics`); the report counts rows per type (`entityRows`) | with the moment |
| D1 `moment_text` | display title/body per language (normalizeHe). Insights, key points and takeaways have only a title: it goes in `body`. Write-up paragraphs only in their own language. | with the moment |
| D1 `fts_words`, `fts_tri` | the same text in search form: search-core `momentSearchText` (`fold`), so `normalizeQuery` tokens meet it | with the moment; FTS rowid = 48 bits of sha256(`id@lang`), so changed rows are deleted by rowid |
| D1 `meta.corpus_rev` | `m1-` + sha256 of the sorted `(id, hash)` pairs. Written last, and only when it changes | content only |
| Vectorize | one vector per (moment, language) except write-up paragraphs; id `<momentId>@<lang>` (≤ 64 bytes, longer ids are skipped and reported); metadata `{ shiurId, t, hash, audio_lang, kind, category, year? }` | moment `hash` + model, kept in `vec/<index>/state.json` |
| R2 `emunas-site-build` | `emb/<model>/<sha256(text)>.f16` (little-endian half floats); `vec/<index>/state.json` | text |

The embedded text is the display text (title and body), not the folded search form: the Worker
embeds the raw query, and folding (transliteration to Hebrew script, lower-casing) would hurt a
multilingual model. FTS rows use the folded form.

**Incremental:** a run with no data change sends no D1 statements, writes no meta row, upserts no
vectors and calls no model. One changed shiur re-writes only its moments and re-upserts only its
vectors (texts whose words did not change come from the cache).

**Safe to cancel:** D1 writes go in set-based chunks (each statement carries the chunk as one
JSON parameter through `json_each`, ~10 statements per chunk of up to ~500 KB). Inside a chunk
the `moments` rows, which carry the hash, are written last, so an interrupted chunk is redone on
the next run. Vectorize deletes go first, upserts after; the state file records every batch that
succeeded and is saved even when the run fails. Vectors are written before D1 so the Worker's
cache key (`corpus_rev`) changes only once both are current; vector hits for moments D1 does not
have yet are dropped by the Worker's hydration.

**Leak gate:** before anything is written, the rows are checked against search-core's allow-list
(a forbidden or unknown key at any level rejects the file), and `@emunas/corpus-guard` scans the
moments NDJSON and the vector metadata file (forbidden keys, substrings, and verbatim transcript
runs when the transcript folder is in the checkout). Any finding aborts the run.

## Commands

```sh
npm run corpus:build && npm run search:build -w @emunas/search-core   # inputs

# Local (no account): D1 in workers/api/.wrangler/state (what `wrangler dev` reads),
# deterministic stand-in embeddings, a file stand-in for Vectorize under .wrangler/state/emunas-sync/
npm run search:sync:local -w @emunas/api                      # = --migrate: applies migrations with wrangler first
npm run search:sync:local -w @emunas/api -- --dry-run
npx wrangler d1 execute emunas-search --local --command "SELECT count(*) FROM moments"   # in workers/api

# Remote (CI): CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
npm run search:sync -w @emunas/api -- --env staging
npm run search:sync -w @emunas/api -- --env production

npm run test:sync -w @emunas/api     # Node tests: local D1 (Miniflare), fakes for Vectorize/Workers AI/R2
```

Options: `--env production|staging`, `--only d1|vectors`, `--dry-run`, `--model <id>` (default
`EMBED_MODEL` from wrangler.jsonc), `--report <file>` (full JSON report), `--corpus <dir>`,
`--persist-to <dir>` (local), `--embedder fake|workers-ai` and `--dims <n>` (local),
`--skip-guard`, `--no-verbatim`.

## The real run (not done here: no Cloudflare credentials in this workspace)

1. Provision (ops runbook §2; W3.11): D1 `emunas-search(-staging)` with the ids in wrangler.jsonc,
   R2 `emunas-site-build`, and the Vectorize indexes with the metadata indexes the Worker filters on:

   ```sh
   W="npx --yes wrangler@4.156.0"
   for idx in emunas-moments emunas-moments-staging; do
     $W vectorize create $idx --dimensions=1024 --metric=cosine
     $W vectorize create-metadata-index $idx --property-name=audio_lang --type=string
     $W vectorize create-metadata-index $idx --property-name=kind --type=string
     $W vectorize create-metadata-index $idx --property-name=category --type=string
     $W vectorize create-metadata-index $idx --property-name=year --type=number
   done
   ```

   Create the metadata indexes before the first upsert: Vectorize only indexes vectors written
   after a metadata index exists.
2. Token: `CLOUDFLARE_API_TOKEN` with D1 edit, Vectorize edit, Workers AI read, and R2 read/write
   on `emunas-site-build`. The cache uses R2's S3 API (the REST API's 1,200 requests / 5 min limit
   would throttle a first fill of ~34k objects); its credentials are derived from the token
   (access key = token id, secret = sha256(token)). `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`
   override that. `EMUNAS_EMBED_BUCKET` overrides the bucket name.
3. Model eval first (decision O10): `npx tsx apps/live/tests/eval/run.ts --embedder workers-ai --r2`
   embeds the corpus with bge-m3 and qwen3-embedding-0.6b into the shared cache, writes
   `apps/live/tests/eval/report.{md,json}` and names the winner. Commit the report; if qwen3 wins,
   set `EMBED_MODEL` in wrangler.jsonc (both environments) so the Worker embeds queries with the
   same model.
4. Staging: `npm run search:sync -w @emunas/api -- --env staging` (deploy.yml dispatch with
   `target: staging` does the same after the migrations). The first run upserts ~34k vectors
   (embeddings from the cache filled by the eval) and ~36.6k moments in ~110 D1 chunks. Run it
   again: it must report 0 statements and 0 vectors.
5. Production: deploy.yml on `main` runs the same command with `--env production`.

Real data on 2026-11-15 (`search:sync:local --dry-run` after `corpus:build` and `search:build`):
59,512 moments, 57,908 vectors, `moment_entities` rows: work 54,947, person 4,605, concept 2,094,
topic 181,916 (192 distinct topics). A second run writes nothing.

Earlier size (before the corpus layer): 36,596 moments (19,624 write-up paragraphs, lexical only), 33,944 vectors.
