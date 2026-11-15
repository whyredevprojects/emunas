# @emunas/search-core

Decides what gets indexed and how queries are normalized, for both sites (integration-plan C9, C19, W2.2). Pagefind (Quiet), the MiniSearch quick index (Live) and the `emunas-api` Worker (D1 FTS5 + Vectorize) all index these fields and nothing else.

| Entry | For | Contents |
|---|---|---|
| `@emunas/search-core` | browsers, Workers, build scripts | `SearchDoc`/`MomentRow` types and their field allow-lists, `normalizeQuery`, index-side folding (`foldForIndex`, `indexTokens`, `docSearchText`, `momentSearchText`). Pure; no Node imports. |
| `@emunas/search-core/build` | Node build steps | `buildSearchDoc`, `buildMomentRows`, `buildSearchOutputs`, `writeSearchOutputs`, `loadCandidateTopics`, `contentHash`. |

## `search:build`

Runs after `corpus:build` (and after the guard pre-pass and the `--suppress` rebuild):

```
npm run search:build --workspace=@emunas/search-core -- [--corpus .corpus] [--data-dir data] [--no-keywords]
```

It writes `.corpus/search/docs.ndjson` (one `SearchDoc` per in-scope shiur), `.corpus/search/moments.ndjson` (one `MomentRow` per timed item of a full shiur) and `.corpus/search/search.json` (schema version and counts). A file is rewritten only when its content changes. Rows are sorted by shiur id. On today's data it produces 997 docs and about 36,600 moment rows.

## What is indexed

**SearchDoc** (shiur level, `SEARCH_DOC_FIELDS`): `titleOriginal`, `heading`, `subTitle`, `parsha` and `zman` labels (the catalog string plus the table's he/yi/en names), `years` (Hebrew letters and digits), `catalogTopics`, and for full shiurim `oneLiner`, `abstract`, `keyPoints`, section titles and summaries, story titles, question text, source `work`/`ref`, people names and concept terms, all in en and yi. `keywords` holds `candidateTopics`. `facets` holds ids only (parsha/zman/series keys, years, catalogued, work/person/concept keys).

**MomentRow** (`MOMENT_ROW_FIELDS`, D1 row and embedding unit): `section`, `insight`, `question`, `takeaway`, `story`, `keypoint` and `writeup` paragraph. Each row has the corpus moment id, `shiurId`, `kind`, global `t`/`end`, the audio `lang`, `title_en`/`title_yi`, `body_en`/`body_yi` (a write-up paragraph has only its own language), entity keys, facets (category, occasion, series, first year, catalogued, soft) and `hash`. An item whose time could not be resolved (`t: null` in the corpus) gets no row. It is still found through its shiur's SearchDoc.

**hash** = sha256 of the schema version plus the canonical JSON (keys sorted) of every other field. It ignores `rev`, so a code-only corpus rebuild leaves the hashes alone. The W3.10 sync diffs on it.

## Rules

- **Allow-list, copy only.** The builders copy fields one by one from a `PublicShiur`, which has no transcript-derived field. The type checks in `src/types.ts` fail to compile if `SearchDoc`, `MomentRow` or the builder input gains a key from `FORBIDDEN_SEARCH_KEYS` (`heardAs`, `asrNotes`, `segs`, …), or if an interface drifts from its field list. Tests assert that the emitted objects have exactly the allow-listed keys at every level.
- **candidateTopics (C9).** These are read from `extraction.json` through `@emunas/corpus`'s allow-listed data reader, and only for shiurim whose status is `full`. They are written only to `SearchDoc.keywords`, never to any other field or to a moment row. Engines give `keywords` low weight and never display it.
- **No transcripts.** This package never reads transcripts. Its leak test locates the transcript folder through `@emunas/corpus-guard`.

## Query normalization

`normalizeQuery(q)` returns `{ raw, folded, terms, expansions, tokens, variants }`:

- `folded`/`terms`: `fold` from `@emunas/normalize`, which covers nikud, quote marks, Latin case and diacritics, Yiddish ligatures and the transliteration variant table. `lag baomer`, `Lag B'Omer`, `ל״ג בעומר` and `לג בעומר` all give `["לג", "בעומר"]`. The index side uses the same `fold` (`foldForIndex`, `docSearchText`).
- `expansions`: the longest non-overlapping spans that name a parsha, occasion, work or person in the normalize tables, or a concept spelling variant. Each comes with its key and its other names, folded (`parshas noach` → parsha `noach`, forms `נח`, `noach`).
- `tokens`: the terms plus every expansion token, for OR engines (MiniSearch, FTS5 `OR`).
- `variants`: the folded query followed by one alternative query per expansion form, at most 9. Use these for AND engines such as Pagefind: run each variant and merge the results.

Input longer than 256 characters is cut at a word boundary.

## Tests

`npm test` covers the following:

- query folding and expansion, including the `לג בעומר` / `lag baomer` acceptance case
- the field allow-lists on the mini corpus
- that a planted candidate topic appears only in `keywords`
- that hashes stay the same across independent runs and react only to changes in text and metadata
- the CLI
- type-level checks
- the corpus-guard post-pass on the NDJSON

The post-pass test follows the deploy order: build, then pre-pass, then build with `--suppress`, then search:build, then post-pass with verbatim. It runs on the mini corpus and on the repo's real data, which takes about 20 s.
