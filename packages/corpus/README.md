# @emunas/corpus

The shared data layer (integration-plan §1.2, §5). It reads `data/`, which belongs to the pipeline and is read-only here, and writes `.corpus/`. Both apps read only `.corpus/` and `@emunas/corpus/public`.

| Entry | For | Contents |
|---|---|---|
| `@emunas/corpus/public` | browsers and apps | `PublicShiur` and the other output types, `toLocal`/`toGlobal`/`offsetsFor`, `momentId`/`parseMomentId`, `ENTITY_THRESHOLDS`, `SCHEMA_VERSION`, the `AudioTable`/`MediaUrl` types. Has no Node imports. |
| `@emunas/corpus/build` | Node build steps only | `buildCorpus`, `projectCorpus`, the allow-listed reader, valibot schemas, the status gate, the projector, the `Keyer` interface with its default `identitySlugKeyer`, and the report. ESLint blocks app code from importing it. |
| `@emunas/corpus/layer` | Node build steps only | the corpus-layer projection: `loadLayerInput`, `prepareLayer`, `finishLayer`, `buildLayer` (C1.2). Node-only like `/build`. |
| `@emunas/corpus/transcript-gate` | the transcript view (W5.2), currently off | `readEligibleTranscript(recordingId)` |

## `npm run corpus:build`

```
npm run corpus:build -- [--data-dir data] [--out .corpus] [--suppress .corpus/suppress.json] [--policy-dir site-policy] [--media-origin https://media.<domain>] [--force]
```

Defaults: data comes from `EMUNAS_DATA_DIR` or `<repo>/data`, output goes to `<repo>/.corpus`, policy from `<repo>/site-policy`, media origin from `--media-origin`, else `EMUNAS_MEDIA_ORIGIN`, else the dev placeholder `https://media.example.invalid` (reported as a build-report warning). Relative paths resolve against the directory npm was started from. Exit code 1 means invalid ingest, manifest, policy or media origin. Exit code 2 means a bad flag. On today's data a full build takes about 1.5 s.

Output: `build.json`, `shiurim/<id>.json` (one per in-scope shiur), `index.json` (rows plus catalog sections and series), `audio-table.json` (`recordingId → {canonicalId, size, playable, url}`, built by `@emunas/audio`), `updated.json` (manifest `updatedAt` per full shiur, for "newly summarized"), `build-report.json`, `.fingerprints.json`. A shiur file is rewritten only when its fingerprint changes. The fingerprint covers the ingest row, recordings, manifest entry, meta/extraction/writeup bytes, its translation overlay bytes, keyer id and version, policy thresholds, the shiur's suppress ids, its audio-table rows (so a media origin or bucket key change re-emits it), the schema version and a hash of this package's projection source. The other outputs are rewritten only when their content changes.

## The corpus layer: `.corpus/layer/` (corpus-wave-plan §3.3, C1.2)

`corpus:build` also projects the pipeline's corpus-wide files (`data/derived/corpus/`, contract `docs/corpus-data.md`) into `.corpus/layer/`. The input is read by the allow-listed corpus reader (`src/layer/input`, C1.1): `raw/`, alias maps, ASR files, the agents' working folders and `search/sections.jsonl` are never opened. Owner decisions come from `site-policy/corpus-policy.json` (`src/layer/policy.ts`). Types are `Layer*` in `@emunas/corpus/public` (`src/public/corpus-layer.ts`), versioned by `LAYER_SCHEMA_VERSION`, which is separate from `SCHEMA_VERSION`, so a layer change does not churn shiur fingerprints (the layer types are left out of the projection code hash).

| File | Contents |
|---|---|
| `layer.json` | layer schema version, corpus version and `generatedAt`, which inputs were read, policy hash, counts (visible shiurim, entities, pages per site, retired ids resolved), warnings, files not read, dropped-key counts, and the cluster-count lint |
| `topics.json` | `tree` (id, parent, level, labels, visible count incl. descendants, `sameAs`, reviewed, page flags, Quiet gateway) and `detail` (description, hubs, grades `main`/`discussed`/`touched`, children, co-topics, thread ids, story ids, occasion keys) |
| `concepts.json` | canonical Hebrew, label, transliterations, definition, visible shiurs and example sections, `passim`, `liveFacetDrop`, `mergedIntoTopic`, page flags |
| `people.json` | names and aliases, type, index group (`tanach`, `malach`, `chazal`, `rishon`, `acharon`, `chassidic_rebbe`, `ruler`, `other`; `individual` sits in `other`) and its order, generated `description` (or null), visible shiurs, stories, works authored, same-id work, `sameAsTopic`, `excluded` (family / private / owner), listing and page flags per site |
| `works.json` | titles, aliases, author, Sefaria title, `kind`, `generic` (= kind `genre`), the data's `order`, `parentWorkId` (nearest ancestor in the file), shelf group (from the data for Tanach books, tractates and liturgy, else the `@emunas/normalize` table; unknown works last), visible shiurs, page flags. Shelf order, each work followed by its children |
| `stories.json` | title, retelling, people (`{id}` or `{name, linked:false}`), `attributionVaries`, visible tellings `{shiurId, momentId, chapterIdx, t, year, lang}`, page flags |
| `threads.json` | teaching clusters with ≥2 visible shiurim: label, summary, topics, visible members, shiur and dated counts, year span, page and timeline flags |
| `series/<id>.json` | only series with a visible part: title, overview, key themes, arc of visible parts, part numbers of the missing ones |
| `shiur/<id>.json` | one per visible shiur: `otherSpeakerShare`, topics with salience, chapter topics, concept/person/work ids, work per source moment, story refs (telling count, page flags), insight refs (thread count, year span, page flag, or the two-shiur inline pointer) |
| `synonyms.json` | `{kind, id, terms}`: folded terms from the entity's own display fields only |
| `occasion-topics.json` | parsha/zman key → topic, from the topics' own `parsha`/`zman` keys (the most specific topic wins), else derived by the share rule (D11) |

Rules: every file is built by copying named fields, never by spreading a record. The visible set `V` is the shiurim that are `full` in `.corpus` and in the corpus index; a member counts only if its shiur is in `V` and its item survived projection, and, under D6, tellings and cluster members also need a category in general browse. All counts are recounted from `V` (never `shiurCount` or `shiurIds.length`). Section tags on `other_speaker` chapters are dropped. Retired ids (data `redirects.json` and `mergedInto`, chains resolved, possibly across kinds: a person now a concept) are followed internally so every reference points at the surviving entity; nothing about retired ids is published. Hubs leave out shiurim at or above `featured.maxOtherSpeakerShare` and are refilled by salience. Family exclusion is a rule over the person's own fields (`people.familyPattern`, `family`/`private` flags, `excludeIds`). Layer warnings go to `layer.json`, never to `build-report.json`. Files no longer produced are removed; an unchanged rerun rewrites nothing. The layer is required: with `data/derived/corpus/` absent the build fails (`FatalDataError`).

`works.json` (the aggregate) gains `workId`: the merged corpus work most of the entry's mentions resolve to through `shiur-tags.sourceWorkIds`. The site-derived aggregate people, concepts, stories and entities files stay only while current Quiet and Live pages still read them (the C2 page wave replaces those pages, then they go).

Tests: `test/layer/` (mini goldens in `test/layer/golden/`, rule tests on edited fixture copies, and the C1.2 acceptance on real data). Regenerate the goldens with `npx vitest run test/layer -u` and review the diff.

## Languages and translation overlays

Every generated text in `.corpus/` (shiur files, `index.json` one-liners, the layer's concepts, stories, topics, threads, people descriptions and series) is a `LocalizedText` of `@emunas/i18n`: `en` and `yi` always, plus each `TranslatedLang` (today `he`) only when a current translation exists. The pipeline writes en/yi; further languages come from P4c overlays (`src/types.ts` `ShiurTranslation`/`CorpusTranslation`, docs/translation-runbook.md), read through the allow-list (`derived/shiurim/<id>/i18n/<lang>.json`, `derived/corpus/i18n/<lang>/*.json`, the only folder the reader may list). `src/build/translations.ts` recomputes the pipeline's source hash (`shiurSlots`/`corpusEntrySlots` + `hashSlots`, pinned to `scripts/lib/translate.ts` by a real-data test) and applies an overlay only when its hash matches; stale and invalid overlays are ignored and counted (`build-report.json` `translations.<lang>`, `layer.json` `translations.<lang>`). A topic's own `label.he` wins over a translation.

`notes.writeup` is `Localized<PublicWriteupBlock[]>`: a translated write-up exists only when the overlay covers every Yiddish heading and paragraph; it mirrors the `yi` blocks (same `sectionIndex`, `src`, `t`, `end`) with its own paragraph ids `<shiur>~whe<b>.<p>`. Suppressing `~wyi<b>.<p>` drops the translation too. The overlay text is part of the shiur fingerprint. Sites pick with `pickText`/`pickLocalized` (`CONTENT_FALLBACK`: he → yi → en).

## Audio (integration-plan Amendment A1)

Every `recordings[]` entry carries `audioUrl` and `playable`. `audioUrl` is the media origin plus the bucket key with each path segment `encodeURIComponent`-encoded; a `duplicateOf` recording gets its canonical's URL. A recording whose object is not an mp3 (3 `.WMA` today) is `playable: false, audioUrl: null`, and the build report lists it. The raw `audioKey` field never reaches any output, and no URL can contain `transcripts/` (`@emunas/audio` refuses such keys). `build.json` records `mediaOrigin` so the apps can put it in CSP `media-src`.

## Rules implemented here

- **Reading** (`src/build/read.ts`): every path is matched against `DATA_ALLOW_LIST`, which covers ingest, manifest, `shiurim/<id>/{meta,extraction,writeup}.json`, the translation overlays and the two catalog JSONs. Any other path throws `ForbiddenPathError`. Only `src/transcript-gate.ts` knows where transcripts live.
- **Status gate** (C4, `src/build/gate.ts`): a shiur is `full` only if the manifest says `done`, all three files parse and validate, `extractionVariant === "extraction"`, and the structural checks pass. Those checks are: meta recordings equal the shiur's recordings, sections tile every recording, recording ids are the shiur's own, and write-up `sectionIndex`/`sourceIdx` are in range. Otherwise the shiur is `catalog-only` and gets a report entry. Only an invalid ingest or manifest is fatal.
- **Projection** (`src/build/project.ts`): copies fields one by one and never strips. Items with confidence below `dropBelow` (0.6) are dropped. Items below `softBelow` (0.75) get `soft: true`. Sources with `unresolved` resolution and `work: null` are dropped, and write-up `src` is remapped to the filtered list. Suppressed ids (from publish-policy `suppress` and `--suppress`) remove the item. For chapters, one-liners and abstracts they blank the summary text instead.
- **Time** (C5/C6, `src/build/time.ts`): all times are global seconds. An item's `t` is `starts[min seg]` and its `end` is `ends[max seg]`. The recording is `evidence.recordingId`, else the section's recording (write-up only), else the only recording. Chapters tile `[0, duration]` exactly. Write-up paragraph times use the paragraph's evidence inside its section and are clamped to the section. Noise segments become `skip` ranges. An item whose time cannot be resolved keeps `t: null` and is reported.
- **Moment ids**: `<shiurId>~<kind><index>`, with kinds `kp s i tk q st src ol ab`. Write-up paragraphs use `w<lang>` (`wen`, `wyi`, `whe`; one kind per `UI_LANGS` language) plus `<block>.<paragraph>`. Indices are positions in the raw extraction.
- **Keys**: all key fields go through `Keyer`. The default `identitySlugKeyer` folds a value to a slug and reports every value as unmapped. W2.1 swaps in `@emunas/normalize`.

## Tests and fixtures

`npm test` runs golden, gate, projection, CLI and transcript-gate tests on the fixtures, plus the acceptance checks on the repo's real `data/`.

- `test/fixtures/mini/data`: 60 in-scope shiurim (31 done) and 2 out-of-scope rows, including the 7 sample shiurim and every multi-recording shiur. It holds derived text only: `heardAs`/`asrNotes` are blanked, transcript keys are nulled and audio keys are synthetic.
- `test/fixtures/golden/<id>.json`: the projected output of the 7 samples, with `rev` set to `"<rev>"`.
- To regenerate both: `npm run fixtures:mini --workspace=@emunas/corpus`, or add `-- --golden-only` to rebuild just the goldens after an intended output change. Review the diff before committing.
