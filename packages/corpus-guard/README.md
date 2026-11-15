# @emunas/corpus-guard

The leak guard both sites run (integration-plan §0, §4, §5.3, C11). This package and
`packages/corpus/src/transcript-gate.ts` are the only site code allowed to read the
transcript folder. Everything it writes (suppress list, reports, logs) holds ids, field
paths, file paths, key names, counts and run lengths. It never writes transcript text or
shipped text.

## CLI

Run from the repo root (relative paths resolve against the directory npm was started from):

```sh
# deploy.yml step 2: pre-pass over .corpus/ → suppress list
npm run guard --workspace=@emunas/corpus-guard -- pre \
  --corpus .corpus --transcripts data/transcripts --out .corpus/suppress.json

# step 5: post-pass over every output; exits 1 on any finding
npm run guard --workspace=@emunas/corpus-guard -- post \
  --scan .corpus apps/quiet/dist apps/live/build/client <ndjson> <worker bundles> \
  --corpus .corpus --transcripts data/transcripts --report guard-post.json

# step 6: budgets per deploy root (≤ 18,000 files, ≤ 25 MiB per file); exits 1 on overrun
npm run guard --workspace=@emunas/corpus-guard -- budgets apps/quiet/dist apps/live/build/client
```

Options: `--site-policy <dir>` (default `site-policy/`), `--report-at 12`, `--suppress-at 20`,
`--no-verbatim` (post: keys/substrings/transcript files only).

## What is checked

| Check | Pre | Post |
|---|---|---|
| Forbidden keys `heardAs asrNotes segments segs startSeg endSeg questionSegs answerSegs transcriptKey audioKey` |  | JSON/NDJSON structurally; HTML/JS as quoted keys (`"segs":`), the distinctive ones also bare (`heardAs:`); also after HTML-entity and JS-escape decoding |
| Forbidden substrings `transcripts/ input.txt .vtt audits/` |  | every text file (raw and escape-decoded) |
| `…/transcript/<recordingId>.json` |  | finding unless the id is in `site-policy/transcript-eligibility.json` **and** `EMUNAS_TRANSCRIPT_VIEW=on` |
| Verbatim runs vs. transcripts | each item vs. its own shiur's recordings; ≥12 reported, ≥20 suppressed | each text unit vs. its shiur (by `shiurId`/`id` in JSON, else a path segment equal to a shiur id), otherwise vs. every transcript; ≥12 reported, ≥20 fails |

Tokenizer (`src/tokenize.ts`): NFC, strip U+0591–U+05C7 (maqaf/paseq/sof pasuq split words),
unify quote marks and drop them between letters (`חז״ל` = `חז"ל` = `חזל`), runs of Unicode
letters/digits, lowercase. Runs may cross ASR segment boundaries, not recording boundaries.

Allow-list: item ids in `site-policy/verbatim-allow.json` and `publish-policy.json`
`allowVerbatim[]`. In the post-pass an allowed item passes by id (JSON) and by its text
(a run fully inside an allowed item's text, e.g. on an HTML page, passes too).

## Item ids

Shared with `corpus:build --suppress` (see `src/items.ts`):

| PublicShiur location | Item id |
|---|---|
| objects with `id` (keyPoints, insights, takeaways, questions, stories) | that id, prefixed `<shiurId>~` if it has no `~` |
| `notes.summary.oneLiner` / `abstract` | `<shiurId>~oneLiner` / `<shiurId>~abstract` |
| `notes.chapters[i]`, `.sub[j]` | `<shiurId>~s<idx>`, `<shiurId>~s<idx>.<j>` |
| `notes.sources[i]` | `<shiurId>~src<idx>` |
| `notes.writeup.<ed>[b]` heading / `paragraphs[p]` | `<shiurId>~w-<ed>-<sectionIndex>-h` / `<shiurId>~w-<ed>-<sectionIndex>-p<p>` |
| anything else | `<shiurId>~<dotted path>` |

Catalog text (`catalog.*`) is printed-catalog text and is not suppressed by the pre-pass.

## `suppress.json`

```jsonc
{
  "version": 1,
  "generatedBy": "@emunas/corpus-guard pre",
  "thresholds": { "report": 12, "suppress": 20 },
  "counts": { "shiurim": 518, "shiurimScanned": 518, "items": 96641, "reported": 31, "suppressed": 1, … },
  "suppress": [{ "id": "<shiurId>~st4", "reason": "verbatim-run", "shiurId": "…", "fields": ["notes.stories[].retelling.yi"], "runLength": 20 }],
  "allowed":  [ /* same shape: ≥20 but allow-listed */ ],
  "report":   [{ "id": "…", "shiurId": "…", "field": "…", "runLength": 14, "runs": 1 }]
}
```

`suppress[]` entries have the `{ id, reason }` shape of `publish-policy.json` `suppress[]`.

## Library

`createLeakScanner`, `LeakScanner` (post-pass on files or parsed values), `runPrePass` /
`prePassUnits`, `createPagefindChecker` / `checkPagefindRecord` (run on each Pagefind custom
record before `writeFiles()`, since Pagefind's fragments are compressed), `checkBudgets`,
`tokenize`, `ShingleIndex`.

## Performance (today's data)

`npm run bench:real --workspace=@emunas/corpus-guard`: pre-pass over the 518 done shiurim
(96,641 text items, 3.0 M tokens) ≈ 4–5 s; 31 items reported at ≥12, 1 at ≥20. The
whole-corpus index used for unattributable post-pass text (5.7 M shingles) builds in ≈ 5 s,
≈ 320 MB RSS. `test/real-data.test.ts` asserts the pre-pass stays under 2 minutes.
