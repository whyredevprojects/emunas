# Corpus data contract (for the website)

Status: contract. `data/derived/corpus/raw/` is built by `npm run corpus:aggregate`. The public files
below are assembled by `npm run corpus:assemble` (`scripts/corpus/assemble.ts`) from the corpus agents'
outputs (`topic-tags/`, `raw/links/`, `teaching-clusters/`, entity files); it also fills `topics.json`
`shiurCount`/`hubShiurIds`, writes `index.json` and runs integrity checks (prints coverage and issues).
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
- A person entry is one person. Pairs and lists ("Kamtza and Bar Kamtza", "Chaggai, Zechariah and Malachi")
  resolve to the individual people, and roles (Moshiach, the Kohen Gadol) are concepts, not people. Two
  inseparable pairs with no individual entries stay single entries (`bigsan-and-teresh`, `shamchazai-and-uza`).

## Files under `data/derived/corpus/`

| File | Shape | Notes |
|---|---|---|
| `index.json` | `CorpusIndex` | `version` (integer, bumped when any shape changes; now 2), `generatedAt`, `shiurIds`, `counts` per file (incl. `shiurTags`), `files` list, `pendingDescriptions` (level-1/2 topic ids whose `description` is still null, filled by a later LLM pass). Load this first. |
| `topics.json` | `Topic[]` | Taxonomy, max 3 levels; tree via `parentId` (null = level 1). Level 1 is seeded from the Pocket Guide sections. Sorted by level, then label. `shiurCount` includes descendants; `hubShiurIds` = representative shiurim for a topic page. Calendar topics carry `parsha` and/or `zman`: the catalog spellings (ingest `shiurim[].parsha` / `shiurim[].zman`), copied exactly, variants included (see "How the pieces join"). |
| `concepts.json` | `Concept[]` | Glossary. `shiurIds` = shiurim whose extraction lists the concept; `exampleRefs` point at sections. |
| `people.json` | `Person[]` | Typed persons (`tanach`, `chazal`, `rishon`, `acharon`, `chassidic_rebbe`, `malach`, `ruler`, `individual`, `other`; see the `PersonType` JSDoc). Optional bilingual `description` disambiguates similarly named persons (`rav` = the Amora; `belzer-rav` = an unspecified Belzer Rebbe; `beis-aharon` vs `rabbi-aharon-of-karlin`). |
| `works.json` | `Work[]` | Seforim cited. `sefariaIndexTitle` links to Sefaria when known; `authorPersonId` references `people.json`. Every work has `kind` (`sefer`, `genre`, `tanach-book`, `talmud-tractate`, `mishnah-tractate`, `liturgy`, `document`), `order` (canonical sort key or null) and `parentWorkId` (the larger work or collection it belongs to, or null; at most 2 levels). Tractates sit under `talmud-bavli` / `talmud-yerushalmi` / `mishnah`; per-book commentaries sit under the commentator's entry (`rashi-on-bereishis` -> `rashi-on-the-torah` -> `rashi`; likewise ramban, rambam, tosafos, chasam-sofer, alshich, ibn-ezra, radak, rashbam, abarbanel); Midrash Rabbah books, Shulchan Aruch sections, Targumim, Sifrei Devarim and the I/II halves of Shmuel, Melachim and Divrei HaYamim sit under their whole work. A parent's `shiurIds` cover only sources that cite it generically, not a roll-up of its children. `order` is one scale: Tanach 1-39, tractates 100 + Mishnah order (Avos 139), Shulchan Aruch sections 1-4; a commentary on one book or tractate takes its base text's number. Compare `order` only within one `kind` or one parent. The plain author entries (`rashi`, `ramban`, ...) are `genre` with no Sefaria index. |
| `series/<seriesId>.json` | `SeriesSynthesis` | One per ingest series that has done shiurim. `arc` is in series order (`Series.shiurIds`), `part` 1-based. |
| `stories.json` | `Story[]` | Deduplicated maasios; each `tellings[]` entry points at `extraction.stories[storyIndex]` of a shiur. `people` holds person ids where resolved, else the raw name. `attributionVaries: true` (21 stories) marks stories whose tellings credit the maaseh to different people or differ on key details; the merged retelling says so ("in one telling ... in another ..." / "אין טייל דערציילונגען ... אין אנדערע ..."), and `people` lists everyone named. |
| `teaching-clusters.json` | `TeachingCluster[]` | Same idea across shiurim/years; members point at `extraction.insights[insightIndex]`. `topicIds` reference `topics.json`. Summaries describe the teaching itself (see Publishing rules). |
| `redirects.json` | `Redirects` | Retired id -> surviving entity, per kind (`topics`, `concepts`, `people`, `works`, `stories`). A string value is an id of the same kind; `{ "kind": "concepts", "id": "mashiach" }` points at another kind (the retired person `moshiach` is now a concept). |
| `shiur-tags/<shiurId>.json` | `ShiurTags` | One per done shiur. Closed-list tags: <=8 topics with salience, <=3 topics per section (`sections[].index` = extraction section index), concept/person/work ids, and `sourceWorkIds` parallel to `extraction.sources`. |
| `search/sections.jsonl` | `SearchSectionDoc` per line | One line per extraction section of every done shiur (sections of kind `noise`/`singing` excluded). `id` = `<shiurId>#<sectionIndex>`. Feeds FTS5/Vectorize. Times (seconds within the section's `recordingId`) are converted in code from segment indices via `meta.json` `recordings[].starts/ends`. `shiurTitle` is the catalog title (`catalog.titleOriginal`). `topicIds` are the section's topics; `conceptIds` are shiur-level (concepts are not tagged per section). |
| `raw/...` | internal | Aggregation inputs for the corpus agents (below). Not for the website. |

### How the pieces join

- Calendar join: a topic page can add every catalog shiur whose `parsha` / `zman` is in the topic's `parsha` / `zman`
  lists, next to the tagged shiurim. A sefer topic's `parsha` lists all its parshiyos, and a parent's `zman` includes its
  children's. Sefer topics (`sefer-bereishis` ... `sefer-devarim`) are tagged directly only where the sefer as a whole is
  the subject, or on non-parsha shiurim that draw on a parsha of that sefer; ordinary parsha shiurim reach their sefer
  through `parsha`, not through a tag. A sefer topic's large `shiurCount` (Bereishis about 444) comes from its narrative
  children (Avraham Avinu, Adam HaRishon, Yaakov and Esav, Yosef), which are tagged across the whole corpus, and from
  section-level mentions; to use a sefer page as a parsha hub, list shiurim through `parsha` plus shiur-level tags.
- Topic page: `topics.json` entry -> all `shiur-tags/*.json` whose `topics[].id` or `sections[].topicIds` include the topic or a
  descendant (precompute an inverted index at build time) -> per-shiur `meta.json` / `extraction.json`
  for cards. Section-level deep links use `shiur-tags.sections[].topicIds`. A shiur tagged with a topic only at section level still counts toward that topic's `shiurCount` and can appear in `hubShiurIds` (ranked at salience 0.05).
- Shiur page "sources" panel: `extraction.sources[i]` + `works.json[sourceWorkIds[i]]`.
- Concept / person / work page: entity file -> `shiurIds` -> shiur cards. A work page can list its children
  (works whose `parentWorkId` is this work).
- Old addresses: look the id up in `redirects.json` under its kind and follow the target (which may be of another kind).
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
| `raw/people-alias-map.json` | Raw extraction name -> person id, or a list of ids for a compound name ("Nadav and Avihu" -> `["nadav","avihu"]`). Used by `corpus:link` and for story people in `corpus:assemble`. |
| `raw/people-shiur-overrides.json` | `{shiurId: {rawName: id \| ids}}`: per-shiur override of the corpus-wide people key where one shiur's extraction means someone else (e.g. "the Belzer Rav" heard as the Bluzhever; "Rabbi Aharon of Karlin" meaning the Beis Aharon). Used by `corpus:link`. |
| `raw/story-people-fix.json` | Story id -> corrected `people` list, applied once to `stories.json` (already applied). `corpus:assemble` keeps entries that are already person ids, so the fixes are not undone. |
| `raw/digests/chunk-NN.json` | 40 shiurim each in manifest order: `{shiurId, lang, catalogTitle, seriesId, parsha, zman, oneLiner:{en}, abstract:{en}, keyPoints:{en[]}, candidateTopics, sections:{index, title:{en}, summary:{en}, kind}[]}` for topic tagging. |

## Publishing rules

- **No transcript text in the public files.** ASR spellings (`heardAs`, misspelling variants) live only under `raw/`: `raw/asr-variants.json` and the alias maps `raw/{concept,people,works,topic}-alias-map.json`, whose keys are raw extraction strings. The pipeline uses them for linking; the sites should not ship them.
- **Voice.** Yiddish refers to the Mashgiach as `דער משגיח` everywhere (per-shiur and corpus files); English says "the Mashgiach" and spells "Moshiach".
- **Retired ids.** `redirects.json` maps each retired id to the entity it was merged into, per kind (a string = same kind; `{kind, id}` = another kind); `npm run corpus:assemble` checks every target exists and no retired id is live again.
- **Teaching-cluster summaries describe the teaching itself.** They give no member counts ("both", "two tellings", "the other", "in four shiurim") and never mention the language of a shiur ("the English shiur", "the Yiddish tellings"): English and Yiddish shiurim are separate shiurim, not translations, and clusters grow. Differences between shiurim read "in one shiur ... in another / elsewhere ..." (Yiddish: "אין איין שיעור ... אין אן אנדער שיעור / אן אנדערש מאל / אין טייל שיעורים").
- **Another speaker.** `shiur-tags.otherSpeakerShare` is the share of a shiur's time in `other_speaker` sections; shiurim at 0.5 or more are left out of `hubShiurIds`.
- **Topic = entity.** `topics[].sameAs` names a concept, person or work with the same id, so the sites can link or merge the pages.

## Known issues (not yet fixed)

All of this is `reviewStatus: "unreviewed"`; it's the list a human reviewer should start from.

- Some concept definitions read as stitched-together usages rather than definitions (e.g. `olam-hazeh`, `sar-shel-maalah`); 23 concepts have empty `exampleRefs`.
- Taxonomy: `pidyon-haben` was retired into `simchos` (redirects.json); `kisei-eliyahu` is now level 3 under `bris-milah`. `simcha` vs `tanya-simcha`, `kedushah-vekelipah` vs `tumah-taharah`, and `tehillim` (Tehillim said as tefilah, under `tefilah`) vs `nach` were separated through descriptions. `churban-europa` covers persecutions through the galus (Spain, Tach v'Tat, the Ten Martyrs), and its he/yi labels say so (חורבן אירופה וגזירות). Still open: possible overlap between `nisyonos-hador`, `simanei-ikvesa` and `avodas-dor-haacharon` (the last two have no description).
- Sefer topics' subtree counts stay high (`sefer-bereishis` 444, `sefer-shemos` 235) because of their corpus-wide narrative children and section-only tags (see "How the pieces join").
- Calendar keys keep the catalog's own spellings, including mixed values such as `שמיני For Children`, `שלח קינדער`. Three zman strings are deliberately unmapped (`יום המיוחס`, the Ohr HaChaim yahrzeit l'chaim, a camp l'chaim).
- People: `belzer-rav` remains for unspecified mentions of "the Belzer Rav". Plain "Rabbi Aharon of Karlin" resolves to Rabbi Aharon HaGadol; the shiurim where it means the Beis Aharon are fixed per shiur in `raw/people-shiur-overrides.json` and per story in `stories.json`. Three stories were assigned to Rabbi Aharon of Belz from their dates, not an explicit name (`the-belzer-rav-at-the-shabbos-candles`, `the-belzer-rav-at-the-window`, `speaking-of-reb-shlomke-of-zvhil-during-the-war`). The raw key "Shmuel" (23 mentions) is unmapped: it is ambiguous between `shmuel-hanavi` and `shmuel-amora`. `dukla-rav` and `rabbi-avigdor-halberstam` are probably one man and should be merged. `bnos-tzelofchad`, `chashmonaim`, `anshei-knesses-hagedolah`, `shevatim` and `amalek` are group entries that also exist as concepts. `rabbi-elazar-hakalir` is typed `other` (no Geonic-era type); Pope Gregory's identity is unclear. 44 story people are unresolved raw names, mostly private or generic names.
- Stories: merging `the-bochur-and-the-baseball-game` into `answering-an-objector-with-a-baseball-game` is a judgement call (in one telling the Mashgiach answers, in the other a bochur; flagged `attributionVaries`). In `the-kotzker-rebbe-and-the-ushpizin` one telling's "the Apta Rav" resolves to `ohev-yisrael`, another names Reb Meir of Apta; both are kept. A few English loanwords remain in Yiddish retellings where they name the thing (סמארטפאון, בעיסבאל).
- Works: generic work strings ("Rashi", "Ramban", "Rambam", "Shulchan Aruch", "Tosafos") resolve to the umbrella work even when the ref names a specific book (e.g. "Rashi on Bereishis 1:1" under work "Rashi"), because aliases are keyed by the raw work string; splitting by ref at link time would be a later improvement. Yalkut Shimoni has no `sefariaIndexTitle` because Sefaria splits it into Torah and Nach indexes. Calls to check: `shloshah-asar-ikkarim` and `perek-shirah` are `liturgy`; `eliyahu-rabbah` and `pesikta` (no refs) are uncertain identifications.
- About 11% of sources have no work (`sourceWorkIds` null), because the extraction itself named no work.
- Nikud in some upstream extraction Yiddish. Corpus Yiddish (stories, teaching clusters) has been cleared of `וועלכע` clauses and Latin script.
