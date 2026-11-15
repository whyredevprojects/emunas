# @emunas/corpus-guard

The leak guard both sites run (integration-plan §0, §4, §5.3, C11; corpus-wave-plan §1 rules
1–3, §3.4). This package and `packages/corpus/src/transcript-gate.ts` are the only site code
allowed to read the transcript folder, and this package is the only site code allowed to read
the corpus `raw/asr-variants.json` (only to detect leaks; ESLint enforces both). Everything it
writes (suppress list, reports, logs) holds ids, field paths, file paths, key names, counts and
run lengths. It never writes transcript text, shipped text or an alias term.

## CLI

Run from the repo root (relative paths resolve against the directory npm was started from):

```sh
# deploy.yml step 2: pre-pass over .corpus/ → suppress list
npm run guard --workspace=@emunas/corpus-guard -- pre \
  --corpus .corpus --transcripts data/transcripts --out .corpus/suppress.json

# step 5: post-pass over every output; exits 1 on any finding
npm run guard --workspace=@emunas/corpus-guard -- post \
  --scan .corpus apps/quiet/dist apps/live/build/client <ndjson> <worker bundles> \
  --corpus .corpus --transcripts data/transcripts --corpus-data data/derived/corpus --report guard-post.json

# step 6: budgets per deploy root (≤ 18,000 files, ≤ 25 MiB per file); exits 1 on overrun
npm run guard --workspace=@emunas/corpus-guard -- budgets apps/quiet/dist apps/live/build/client
```

Options: `--site-policy <dir>` (default `site-policy/`), `--report-at 12`, `--suppress-at 20`,
`--no-verbatim` (post: no verbatim scan), `--corpus-data <dir>` (post: display fields and ASR
variants for the alias checks; default `data/derived/corpus` when it exists, an explicit folder
must exist), `--no-aliases` (post: alias checks off; the log says so).

The pre-pass also reads `.corpus/layer/` when present (no flag).

## What is checked

| Check | Pre | Post |
|---|---|---|
| Forbidden keys `heardAs asrNotes segments segs startSeg endSeg questionSegs answerSegs transcriptKey audioKey`, and the corpus raw-only keys `asrVariants heardAsSamples sampleTitles resolutionTotals nullWork fromStories fromPeople` |  | JSON/NDJSON structurally; HTML/JS as quoted keys (`"segs":`), the distinctive ones (incl. `asrVariants`, `heardAsSamples`) also bare (`heardAs:`); also after HTML-entity and JS-escape decoding |
| Forbidden substrings `transcripts/ input.txt .vtt audits/ corpus/raw/ alias-map asr-variants` |  | every text file (raw and escape-decoded) |
| Raw ban: a string in an alias position that folds equal to an entry of the corpus `raw/asr-variants.json` and is not a display name of its entity |  | alias positions (below) |
| Alias-key assertion: every published `(kind, id, term)` in an alias position is in that entity's display-field set, read from `data/derived/corpus/{topics,concepts,people,works}.json` (never from `.corpus`) |  | alias positions (below) |
| Verbatim runs of corpus-layer text (`corpus:` item ids, below) | each unit vs. the transcripts of all its member shiurim; ≥12 reported, ≥20 suppressed | in `.corpus/layer/` files: each unit vs. its member shiurim (by attribution in the JSON); the same text elsewhere (HTML pages) vs. every transcript; ≥12 reported, ≥20 fails |
| `…/transcript/<recordingId>.json` |  | finding unless the id is in `site-policy/transcript-eligibility.json` **and** `EMUNAS_TRANSCRIPT_VIEW=on` |
| Verbatim runs vs. transcripts | each item vs. its own shiur's recordings; ≥12 reported, ≥20 suppressed | each text unit vs. its shiur (by `shiurId`/`id` in JSON, else a path segment equal to a shiur id), otherwise vs. every transcript; ≥12 reported, ≥20 fails |

Tokenizer (`src/tokenize.ts`): NFC, strip U+0591–U+05C7 (maqaf/paseq/sof pasuq split words),
unify quote marks and drop them between letters (`חז״ל` = `חז"ל` = `חזל`), runs of Unicode
letters/digits, lowercase. Runs may cross ASR segment boundaries, not recording boundaries.

### Alias positions

Every string under a JSON key `aliases`, `synonyms`, `transliterations`, `names` or `terms`
(plus `ScannerOptions.aliasKeys`, for a minified field such as a Live quick-index column). A string
value is split on `|` and newlines. Terms compare after `fold` from `@emunas/normalize`. The entity
of a position is, in order: the nearest enclosing object with an entity `kind`
(`topic|concept|person|work`) and an `id` (synonyms.json rows, `entities.ndjson` docs); in
`.corpus/layer/{topics,concepts,people,works}.json` the nearest object with an `id`; the `entity`
given to `checkPagefindRecord` (Pagefind headword records); otherwise none. With an entity, a term
must be one of its display fields (`not-display-field`, `unknown-entity`; an ASR variant is reported
as `asr-variant`). Without one, only the raw ban applies (a term that is a display name of any
entity passes). Emitters can also call `scanner.checkEntityAliases(entity, terms, source)`.

Display fields: topic `label.{en,yi,he}`, `aliases` · concept `canonicalHe`, `label.{en,yi}`,
`transliterations` · person `nameHe`, `nameEn`, `nameYi`, `aliases` · work `titleHe`, `titleEn`,
`sefariaIndexTitle`, `aliases`.

Exemption until C3.1: the site-derived legacy aggregates at the top of `.corpus/`
(`people.json`, `concepts.json`, `works.json`, `stories.json`, `entities.json`) carry extraction
spellings in `names`, which are not corpus-entity aliases; their entity-less positions are counted
(`aliasTermsLegacy`) but not checked. Remove the exemption with the files.

Allow-list: item ids in `site-policy/verbatim-allow.json` and `publish-policy.json`
`allowVerbatim[]` (shiur item ids and `corpus:` ids alike). In the post-pass an allowed item passes by id (JSON) and by its text
(a run fully inside an allowed item's text, e.g. on an HTML page, passes too).

## Item ids

Shared with `corpus:build --suppress` (see `src/items.ts`):

| PublicShiur location | Item id |
|---|---|
| objects with `id` (keyPoints, insights, takeaways, questions, stories) | that id, prefixed `<shiurId>~` if it has no `~` |
| `notes.summary.oneLiner` / `abstract` | `<shiurId>~ol0` / `<shiurId>~ab0` (the `@emunas/corpus` moment ids) |
| `notes.chapters[i]`, `.sub[j]` | `<shiurId>~s<idx>`, `<shiurId>~s<idx>.<j>` |
| `notes.sources[i]` | `<shiurId>~src<idx>` |
| `notes.writeup.<ed>[b]` heading / `paragraphs[p]` | `<shiurId>~w-<ed>-<sectionIndex>-h` / `<shiurId>~w-<ed>-<sectionIndex>-p<p>` |
| anything else | `<shiurId>~<dotted path>` |

Catalog text (`catalog.*`) is printed-catalog text and is not suppressed by the pre-pass.

Corpus-layer text units (`src/layer.ts`), shared with `corpus:build --suppress`
(`packages/corpus/src/layer/suppress.ts`): `corpus:<kind>:<entityId>#<field>.<lang>`

| `.corpus/layer/` file | kind | fields | member shiurim (pre-pass and post-pass attribution) |
|---|---|---|---|
| `stories.json` | `story` | `title`, `retelling` | `tellings[].shiurId` |
| `threads.json` | `thread` | `label`, `summary` | `members[].shiurId` |
| `topics.json` (`detail[]`) | `topic` | `description` | `hubs[]` + every graded shiur (`main`, `discussed`, `touched`) |
| `concepts.json` | `concept` | `label`, `definition` | `shiurIds[]` + `exampleRefs[].shiurId` |
| `series/<id>.json` | `series` | `title`, `overview`, `keyThemes.<i>`, `arc.<shiurId>` (its `oneLiner`) | `arc[].shiurId` |

`<lang>` is `en` or `yi`. Example: `corpus:story:the-divrei-chaim-and-the-man-who-shamed#retelling.en`.
`corpus:build --suppress` blanks that one field (the entity, its counts, links and page flags stay;
its page shows the AI label without the text) and lists it in `layer/layer.json` `warnings`.

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

`suppress[]` entries have the `{ id, reason }` shape of `publish-policy.json` `suppress[]`. For a
corpus id, `shiurId` is the member shiur with the longest run and `fields` is
`layer/<file>:<path>` (e.g. `layer/stories.json:stories[].retelling.en`). `counts` adds
`corpusUnits`, `corpusUnitsScanned`, `corpusUnitsUnchecked` (no member with a transcript),
`corpusComparisons`, `corpusReported`, `corpusSuppressed`, `corpusUnreadableFiles`.

## Library

`createLeakScanner` (with `corpusDataDir` for the alias checks), `LeakScanner` (post-pass on files
or parsed values; `checkEntityAliases`), `runPrePass` / `prePassUnits` (`corpusUnits`),
`readLayerUnits` / `layerFileUnits` / `corpusItemId` / `parseCorpusItemId`, `AliasRules`,
`createPagefindChecker` / `checkPagefindRecord` (run on each Pagefind custom record before
`writeFiles()`, since Pagefind's fragments are compressed; pass `entity` for headword records),
`checkBudgets`, `tokenize`, `ShingleIndex`.

## Performance (today's data)

`npm run bench:real --workspace=@emunas/corpus-guard`: pre-pass over the 518 done shiurim
(96,641 text items, 3.0 M tokens) ≈ 4–5 s; 31 items reported at ≥12, 1 at ≥20. The
whole-corpus index used for unattributable post-pass text (5.7 M shingles) builds in ≈ 5 s,
≈ 320 MB RSS. `test/real-data.test.ts` asserts the pre-pass stays under 2 minutes, and under
3 minutes with the corpus-layer units (stand-in from `data/derived/corpus/`: 11,840 units,
84,512 unit × member comparisons, ≈ 8 s in all).

On a real `.corpus/` (993 corpus shiurim, November 2026): `guard pre` reads 11,148 layer units
and finishes in ≈ 10 s (16 corpus units reported at ≥12, none at ≥20); `guard post` over
`.corpus` and `apps/live/public/data` (8,280 files, 13,259 alias terms) takes ≈ 64 s with 0 findings.
