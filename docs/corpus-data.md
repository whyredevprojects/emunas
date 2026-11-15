# Corpus data contract (for the website)

Status: contract. `data/derived/corpus/raw/` exists (built by `npm run corpus:aggregate`); every other
file below **will** exist once the corpus stage (P7-P11 in `docs/data-generation-plan.md`) has run.
Types live in `src/corpus-types.ts`; per-shiur types in `src/types.ts`. Code against those types, not
against this prose.

## Inputs and scope

- Only shiurim whose entry in `data/derived/manifest.json` has `status: "done"` are in the corpus
  (993 of 997 at the time of writing). `index.json` lists them in `shiurIds`.
- Per-shiur files stay where they are and are not copied: `data/derived/shiurim/<shiurId>/`
  - `meta.json` - the `Shiur` record from ingest plus series, catalog topics, recordings and durations.
  - `extraction.json` - `Extraction`: sections, summaries, sources, insights, stories, Q&A, takeaways,
    `candidateTopics`, `concepts`, `people`.
  - `writeup.json` - `Writeup`: long-form en/yi write-up; `sectionIndex` and `sourceIdx` index into
    the extraction.
- Catalog-level shiur/series/recording data comes from `data/derived/ingest.json` (`IngestOutput`).
- The corpus layer never duplicates per-shiur text. It points into it with indices:
  `sectionIndex` -> `extraction.sections[i]`, `storyIndex` -> `extraction.stories[i]`,
  `insightIndex` -> `extraction.insights[i]`, `sourceWorkIds[i]` <-> `extraction.sources[i]`.

## ID conventions

- All corpus ids (topic, concept, person, work, story, teaching cluster) are **ASCII kebab-case
  slugs**: `^[a-z0-9]+(-[a-z0-9]+)*$`, built from the English / transliterated name
  (`bitachon`, `baal-shem-tov`, `bnei-yissaschar`, `emunah-hashgacha-pratis`).
- Ids are **stable**: the corpus is closed and frozen, so an id once published is never renamed.
  On a collision the later entity gets a numeric suffix (`-2`).
- Ids are unique within their kind; different kinds may share a slug (a concept `tanya` and a work
  `tanya` are different entities), so always resolve an id against its own file.
- Shiur ids and series ids are the ingest ids (`Shiur.id`, `Series.id`), unchanged.
- Hebrew terms are in loshon-hakodesh spelling; Yiddish text in Chassidish orthography
  (`prompts/yiddish-style.md`).
- Every corpus entity may carry `reviewStatus`; absent means `"unreviewed"` (generated, not yet human-reviewed).

## Files under `data/derived/corpus/`

| File | Shape | Notes |
|---|---|---|
| `index.json` | `CorpusIndex` | `version` (integer, bumped when any shape changes), `generatedAt`, `shiurIds`, `counts` per file, `files` list. Load this first. |
| `topics.json` | `Topic[]` | Taxonomy, max 3 levels; tree via `parentId` (null = level 1). Level 1 is seeded from the Pocket Guide sections. Sorted by level, then label. `shiurCount` includes descendants; `hubShiurIds` = representative shiurim for a topic page. |
| `concepts.json` | `Concept[]` | Glossary. `shiurIds` = shiurim whose extraction lists the concept; `exampleRefs` point at sections. `asrVariants` are for search expansion only, never display. |
| `people.json` | `Person[]` | Typed persons (`tanach`, `chazal`, `rishon`, `acharon`, `chassidic_rebbe`, `other`). `asrVariants` for search only. |
| `works.json` | `Work[]` | Seforim cited. `sefariaIndexTitle` links to Sefaria when known; `authorPersonId` references `people.json`. |
| `series/<seriesId>.json` | `SeriesSynthesis` | One per ingest series that has done shiurim. `arc` is in series order (`Series.shiurIds`), `part` 1-based. |
| `stories.json` | `Story[]` | Deduplicated maasios; each `tellings[]` entry points at `extraction.stories[storyIndex]` of a shiur. `people` holds person ids where resolved, else the raw name. |
| `teaching-clusters.json` | `TeachingCluster[]` | Same idea across shiurim/years; members point at `extraction.insights[insightIndex]`. `topicIds` reference `topics.json`. |
| `shiur-tags/<shiurId>.json` | `ShiurTags` | One per done shiur. Closed-list tags: <=8 topics with salience, <=3 topics per section (`sections[].index` = extraction section index), concept/person/work ids, and `sourceWorkIds` parallel to `extraction.sources`. |
| `search/sections.jsonl` | `SearchSectionDoc` per line | One line per extraction section of every done shiur (sections of kind `noise`/`singing` excluded). `id` = `<shiurId>#<sectionIndex>`. Feeds FTS5/Vectorize. Times are converted in code from segment indices. |
| `raw/...` | internal | Aggregation inputs for the corpus agents (below). Not for the website. |

### How the pieces join

- Topic page: `topics.json` entry -> all `shiur-tags/*.json` whose `topics[].id` is the topic or a
  descendant (precompute an inverted index at build time) -> per-shiur `meta.json` / `extraction.json`
  for cards. Section-level deep links use `shiur-tags.sections[].topicIds`.
- Shiur page "sources" panel: `extraction.sources[i]` + `works.json[sourceWorkIds[i]]`.
- Concept / person / work page: entity file -> `shiurIds` -> shiur cards.
- Story page: `stories.json` -> each telling's shiur `extraction.stories[storyIndex]` (evidence and
  timestamp) and that shiur's `meta.json`.
- Series page: `series/<seriesId>.json` + ingest `Series` for ordering + each shiur's `meta.json`.

## `raw/` (internal, built now)

Written by `npm run corpus:aggregate` (`scripts/corpus/aggregate.ts`) from done shiurim only:

| File | Contents |
|---|---|
| `raw/topics.json` | `{phrase, count, shiurIds, sampleTitles}[]` - every `candidateTopics` phrase, lowercased/trimmed. |
| `raw/concepts.json` | `{he, count, heardAs, shiurIds}[]` - grouped by Hebrew spelling. |
| `raw/people.json` | `{name, count, fromPeople, fromStories, heardAs, shiurIds}[]` - from `people[]` and `stories[].people`. |
| `raw/works.json` | `{resolutionTotals, nullWork:{count, shiurCount, resolution, heardAsSamples}, works:{work, count, shiurIds, resolution, sampleRefs, heardAsSamples}[]}` |
| `raw/stories.json` | `{shiurId, storyIndex, title:{en}, people, retelling:{en}}[]` (retelling cut at 400 chars). |
| `raw/insights.json` | `{shiurId, insightIndex, text:{en}}[]` |
| `raw/digests/chunk-NN.json` | 40 shiurim each in manifest order: `{shiurId, lang, catalogTitle, seriesId, parsha, zman, oneLiner:{en}, abstract:{en}, keyPoints:{en[]}, candidateTopics, sections:{index, title:{en}, summary:{en}, kind}[]}` for topic tagging. |
