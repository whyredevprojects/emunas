# @emunas/search-core

Decides what gets indexed and how queries are normalized, for both sites (integration-plan C9, C19, W2.2). Pagefind (Quiet), the MiniSearch quick index (Live) and the `emunas-api` Worker (D1 FTS5 + Vectorize) all index these fields and nothing else.

| Entry | For | Contents |
|---|---|---|
| `@emunas/search-core` | browsers, Workers, build scripts | `SearchDoc`/`MomentRow`/`EntityDoc` types and their field allow-lists, `normalizeQuery`, the corpus synonym table (`buildSynonymTable`), index-side folding (`foldForIndex`, `indexTokens`, `docSearchText`, `momentSearchText`). Pure; no Node imports. |
| `@emunas/search-core/build` | Node build steps | `buildSearchDoc`, `buildMomentRows`, `buildEntityDocs`, `buildSearchOutputs`, `writeSearchOutputs`, `readSearchLayerInput`, `verifyDisplaySynonyms`, `contentHash`. |

## `search:build`

Runs after `corpus:build` (and after the guard pre-pass and the `--suppress` rebuild):

```
npm run search:build --workspace=@emunas/search-core -- [--corpus .corpus] [--data-dir data] [--policy-dir site-policy] [--no-keywords]
```

It reads `.corpus/` and its corpus layer `.corpus/layer/` (corpus-wave-plan §3.3) and writes `.corpus/search/docs.ndjson` (one `SearchDoc` per in-scope shiur), `.corpus/search/moments.ndjson` (one `MomentRow` per timed item of a full shiur), `.corpus/search/entities.ndjson` (one `EntityDoc` per listed corpus entity) and `.corpus/search/search.json` (schema version, whether the layer was used, counts). A file is rewritten only when its content changes. Rows are sorted by shiur id, entity docs by kind and id. On today's data it produces 997 docs, about 59,500 moment rows and about 2,230 entity docs in about 4 s.

Before anything is built, the layer's `synonyms.json` is checked against the entities' display fields, re-read from `data/derived/corpus/{topics,concepts,people,works}.json` through `@emunas/corpus`'s allow-listed reader. A synonym that is not a display field of its entity stops the build (`SynonymCheckError`, which names entity ids and counts, never the term). The same step asserts that `site-policy/corpus-policy.json` keeps `search.asrVariants` false (D1). `--no-keywords` (or `dataDir: null`) skips the check; the guard post-pass still runs it. Without `.corpus/layer/` (corpus absent, layer off) docs have no keywords, entity facets are empty and `entities.ndjson` is empty.

## What is indexed

**SearchDoc** (shiur level, `SEARCH_DOC_FIELDS`): `titleOriginal`, `heading`, `subTitle`, `parsha` and `zman` labels (the catalog string plus the table's he/yi/en names), `years` (Hebrew letters and digits), `catalogTopics`, and for full shiurim `oneLiner`, `abstract`, `keyPoints`, section titles and summaries, story titles, question text, source `work`/`ref`, all in en and yi, and `people`/`concepts`: display names from the corpus layer only (the names of the shiur's `personIds` and of its merged stories' people, the concepts' canonicalHe and labels; never a raw extraction name, which may be an ASR mishearing, F.1; empty without layer refs). `keywords` holds the shiur's visible topics (shiur and section level, from `.corpus/layer/shiur/<id>.json`): their labels (he/en/yi) and then the topics' own aliases from the layer's `synonyms.json`, deduplicated after folding. `facets` holds ids only: parsha/zman/series keys, years, catalogued, and corpus ids of works, people, concepts and `topics` (shiur and section level) from the shiur's layer refs. Entities no site lists (excluded people, people of type `other`, entities with no visible shiur) are left out.

**MomentRow** (`MOMENT_ROW_FIELDS`, D1 row and embedding unit): `section`, `insight`, `question`, `takeaway`, `story`, `keypoint` and `writeup` paragraph. Each row has the corpus moment id, `shiurId`, `kind`, global `t`/`end`, the audio `lang`, `title_en`/`title_yi`, `body_en`/`body_yi` (a write-up paragraph has only its own language), `entities` (corpus ids), facets (category, occasion, series, first year, catalogued, soft) and `hash`. An item whose time could not be resolved (`t: null` in the corpus) gets no row. It is still found through its shiur's SearchDoc. Entities: a section row has the works cited inside it, the linked people of the stories inside it, the concepts whose example section it is, and the chapter's `topicIds`. Every other row has the shiur's topics with salience ≥ 0.6 (`MOMENT_TOPIC_SALIENCE`); a story row adds its story's linked people, a write-up paragraph the works it cites.

**EntityDoc** (`ENTITY_DOC_FIELDS`, `entities.ndjson`): one per topic, concept, person and work listed on at least one site, for headword results (Quiet) and entity suggestions (Live). `kind`, `id`, `labels` (`he`/`en`/`yi`: topic label, concept canonicalHe and label, person names, work titles), `synonyms` (the entity's folded terms from the layer's `synonyms.json` only; never displayed), `count` (visible shiurim), `listed` and `pages` per site, `mergedInto` (a concept merged into a listed topic: that topic, whose page is the entry) and `hash`. Never people of type `other` or excluded people. Story and thread docs are second cut. Every entity is AI-generated and unreviewed: the pages that show them carry the label.

**hash** = sha256 of the schema version (`SEARCH_SCHEMA_VERSION`, now 2) plus the canonical JSON (keys sorted) of every other field. It ignores `rev`, so a code-only corpus rebuild leaves the hashes alone. The W3.10 sync diffs on it.

## Rules

- **Allow-list, copy only.** The builders copy fields one by one from a `PublicShiur`, which has no transcript-derived field. The type checks in `src/types.ts` fail to compile if `SearchDoc`, `MomentRow` or the builder input gains a key from `FORBIDDEN_SEARCH_KEYS` (`heardAs`, `asrNotes`, `segs`, …), or if an interface drifts from its field list. Tests assert that the emitted objects have exactly the allow-listed keys at every level.
- **Topic keywords, not candidateTopics.** The extraction's candidate topics (C9) are retired: nothing reads them, and the key is in `FORBIDDEN_SEARCH_KEYS`. Keywords are topic labels and topic aliases only, written only to `SearchDoc.keywords`. Engines give `keywords` low weight and never display it. `buildSearchDoc` takes the shiur and the corpus layer only (`SearchInput`).
- **Clean synonyms.** Synonyms and aliases come only from each entity's own display fields, through the layer's `synonyms.json`, checked again at build. Nothing in this package reads the corpus raw folder (alias maps, ASR variants) or the pipeline's per-section search dump; ESLint enforces the first.
- **No transcripts.** This package never reads transcripts. Its leak test locates the transcript folder through `@emunas/corpus-guard`.

## Query normalization

`normalizeQuery(q, synonyms?)` returns `{ raw, folded, terms, expansions, entities, tokens, variants }`:

- `folded`/`terms`: `fold` from `@emunas/normalize`, which covers nikud, quote marks, Latin case and diacritics, Yiddish ligatures and the transliteration variant table. `lag baomer`, `Lag B'Omer`, `ל״ג בעומר` and `לג בעומר` all give `["לג", "בעומר"]`. The index side uses the same `fold` (`foldForIndex`, `docSearchText`).
- `expansions`: the longest non-overlapping spans that name a parsha, occasion, work or person in the normalize tables, or a concept spelling variant. Each comes with its key and its other names, folded (`parshas noach` → parsha `noach`, forms `נח`, `noach`).
- `entities` (only with a synonym table): spans that name a corpus entity, as `{ kind, id, span, match, forms }`. `buildSynonymTable(entityDocs)` builds the table from the EntityDocs, so it holds display-field terms only; it accepts `asrVariants: false` and throws on anything else (D1). A span matches `exact` when it equals one of the entity's terms (a leading function word such as "the" or "דער" may be left off), or `prefix` when it is the first whole words of one of the entity's labels (`hester` → topic and concept `hester-panim`, whose labels start "Hester Panim"). Function words alone never prefix-match. At most 8 entities per span, exact first, then by visible count. `forms` are the entity's folded labels. An ASR mishearing such as `Hashem Tov` names nothing.
- `tokens`: the terms plus every expansion token (entity forms without function words), for OR engines (MiniSearch, FTS5 `OR`).
- `variants`: the folded query followed by one alternative query per expansion form, at most 9. Use these for AND engines such as Pagefind: run each variant and merge the results.

Input longer than 256 characters is cut at a word boundary.

## Tests

`npm test` covers the following:

- query folding and expansion, including the `לג בעומר` / `lag baomer` acceptance case
- the field allow-lists on the mini corpus, at every level, for docs, rows and entity docs
- that keywords are topic labels and aliases only, that a planted extraction topic reaches nothing, and that `src` names `candidateTopics` only in the forbidden-key list
- facets and moment entities as corpus ids from the layer refs, with topics
- the synonym table: `hester`, `Hashem Tov`, the D1 assert, and a non-display synonym rejected at build
- that hashes stay the same across independent runs and react only to changes in text and metadata
- the CLI
- type-level checks
- the corpus-guard post-pass on the NDJSON (docs, moments and entities, with the alias checks)

The post-pass test follows the deploy order: build, then pre-pass, then build with `--suppress`, then search:build, then post-pass with verbatim and the C1.3 alias checks (raw ban, alias-key assertion against the corpus data's display fields). It runs on the mini corpus and on the repo's real data, which takes about 40 s.
