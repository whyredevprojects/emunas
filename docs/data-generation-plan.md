# Data generation plan — Harav Moshe Wolfson shiurim

Status: planning. Nothing here is built yet.

## Decisions so far

| Question | Decision | Consequence |
|---|---|---|
| Audience | Yiddish **and** English speakers | Every human-facing generated string is bilingual: `{ en, yi }`. Yiddish in standard Chassidish orthography, Hebrew/Aramaic terms in Hebrew script. |
| Show transcripts? | **No.** Budget ASR, input-only | No public corrected transcript, no full translation, no verbatim quotes. ASR cleanup shrinks to what extraction needs. |
| Human editor for glossary / taxonomy | Not now | Fully automatic, conservative vocab. Every corpus-level artifact gets `reviewStatus: "unreviewed"`; human review is a flagged next step. |
| Re-transcription | Only if a sponsor appears | Store derived data keyed to a transcript version hash, so a future better transcript can re-run passes P3+ without touching P0. |
| Purim seudos | Out of scope | Also out (not transcribed): `Y 05 Current` (79), `Emunah_English` uncatalogued parts (24), `Shabbos Tefilah` English (8), `gramen`. |
| Ongoing? | No — closed corpus (speaker niftar) | One frozen build. No vocab versioning, no incremental re-tagging machinery. A rare new recording can be run through the same pipeline by hand. |

## The catalogs are the backbone

`data/catalog/` holds the 2012 Pocket Guide (`pocket-guide-2012.json`, extracted from the PDF) and the best-guess companion for files the guide doesn't list (`uncatalogued-guide.json`). **All 917 transcripts map to a catalog row** (718 via the Pocket Guide with human-written titles; the rest via path-derived guesses, each marked `derived`).

What that gives us for free (no LLM):
- **Human titles (`inyan` / `title`)** — often a semicolon list of the shiur's topics, i.e. a hand-written table of contents without timestamps (e.g. Tanya 1-2: "ביאור ענין מזל; קושיא של איוב; ביאור מה זה צדיק").
- **Year (`shana`)** for most Yiddish parsha/zmanim/shonos and English rows → chronological views and "same idea across years".
- **Parsha / zman** → calendar linkage.
- **Tanya `perek`** → text anchoring for the Tanya sets is metadata, not inference.
- **Pocket Guide sections** (פרשה, זמנים, שונות, אמונה, תניא, תפילה, ארץ ישראל, שיעורים לבחורים, English equivalents) → the human-made top level of the browse structure.

Catalog gotchas the ingest step must handle:
- **Shiur ≠ file.** 26 rows have `files[]` (one shiur across several tracks). Some multi-file rows are actually two cassette sides with *different* shiurim and years ("צד א … צד ב …", shana "תשל\"ו' תשמ\"ט").
- **Duplicates.** Some rows have both a whole `file` and its `parts[]` (e.g. English Emunah); the uncatalogued guide marks copies/parts of catalogued files (`derived: "pocket-guide"`). Process each audio once.
- **Junk rows** from PDF header lines (e.g. `n: "79 #", title: "TITle"`) — filter.
- Uncatalogued rows are guesses; carry `derived` through so the site can show lower confidence.

## What to generate

### Core
| # | Artifact | Powers | How |
|---|---|---|---|
| C0 | **Shiur records** from catalog + path | Browse by section/parsha/zman/year/series, calendar, series order | Code. Resolve Shiur ↔ Recording(s), dedupe, Hebrew year → numeric, parsha/zman → occasion ids. |
| C1 | **Sections (TOC)** with timestamps, optional subsections | Chapter markers in the player, deep links, search hit unit | LLM, seeded with the catalog title: "the catalog says this shiur covers A; B; C — find where each starts, add what's missing". Model cites segment indices; code converts to times. |
| C2 | **Summaries** (one-liner, abstract, 3–7 key points), en + yi | Cards, shiur page, list views, cross-language reach | LLM. Yiddish shiur → English summary is the main bridge for English speakers, and vice versa. |
| C2b | **Full write-up** (long-form summary), en + yi | The readable stand-in for the hidden transcript: someone can learn the shiur without listening to it. Each paragraph links to its timestamp. | LLM, written section by section from P4's sections (so it can't drift), in the order the Rav builds the argument: question → sources → chiddush → story → application. Length scales with content, ~400–700 words per hour in English, Yiddish similar. Each paragraph carries `segs[]` and goes through P5 verification. Written in third-person reported speech ("The Rav explains…") so it never reads as his own words. Sources mentioned inline link to the C3 entries. |
| C3 | **Sources cited**, normalized to works + Sefaria refs | Sources panel; "every shiur that cites Tanya ch. 2 / Bnei Yissaschar" | LLM extract + code resolution against an offline Sefaria index. Unresolved stays unresolved. |
| C4 | **Faceted tags** from a fixed vocabulary | Topic browse, filters, "more on this" | Two-pass taxonomy (below). |
| C5 | **Search** | Bilingual search | Index generated text (section titles + summaries in en/yi, key points, catalog titles) in D1 FTS5 + Vectorize. Raw ASR text only as a low-weight lexical fallback, expanded with glossary spelling variants. |

### High value
- **Chiddushim / key insights** (3–7, bilingual) → "Insights" list; unit for cross-referencing.
- **Teaching clusters**: same idea across shiurim/years (embeddings + LLM pair check, never from model memory). Year metadata makes this a "development over time" view.
- **Stories (maasios)** with deduped tellings across the corpus.
- **Questions & answers** (kushya/teretz, ≤6).
- **Practical takeaways** (≤5) — only what the Rav actually says.
- **Glossary / concepts** (bilingual definitions as he uses them). Doubles as the ASR correction list.
- **Series synthesis**: overview + per-part one-liners for Tanya, Emunah, Tefilah, Eretz Yisroel, Shiurim LaBachurim, Shir Hashirim, Kedushas HaShabbos, Pirkei Avos, etc.
- **Text anchoring** for sets on a sefer: Tanya from `perek`; others (Pirkei Avos, Shir Hashirim) inferred with evidence.
- **Quality flags**: singing, another speaker, Whisper hallucination over silence, "imperfect sound" from file names.

### Experimental
- "Ask the shiurim" RAG with mandatory shiur+timestamp citations and refusal without evidence.
- Learning paths (mostly data-derived: series order, topic hubs, clusters).
- Concept graph.

### Cut
Public/corrected transcript, full translation, verbatim quotable lines (ASR too unreliable to put words in his mouth), keyword clouds, tone/sentiment, quizzes, separate SEO blurbs, LLM-invented "related" links, guessed dates (catalog has the real ones), biography.

## Taxonomy (automatic, conservative)
Separate facets, each with stable ids and `{en, yi, he}` labels + aliases: **Topic** (≤3 levels, top level seeded from Pocket Guide sections and refined), **Concept** (glossary), **Work** (seeded from Sefaria index), **Person** (typed: Tanach / Chazal / Rishon / Acharon / Chassidic Rebbe), **Occasion** (54 parshiyos, yomim tovim, months, lifecycle), **Series** (from catalog).

1. Extract free candidate topics/concepts per shiur and section (catalog title included in the input).
2. Embed + cluster corpus-wide; Opus names/merges into a hierarchy. Without a human reviewer: fewer, broader topics; a leaf needs ≥8 shiurim.
3. Freeze. Re-tag everything with closed-list output. Non-fitting ideas go to `proposedTopics` (never displayed).
4. Mark `reviewStatus: "unreviewed"` → human review is the flagged next step.

## Pipeline
```
P0 ingest (code)        catalog + R2 keys → Shiur/Recording records, dedupe, years, occasions
P1 term sweep (Haiku)   per shiur: suspect terms, seforim, people (raw ASR + catalog title)
P2 glossary (Opus)      corpus: merge P1 + seed lists → Concept/Work/Person with asrVariants
P3 light cleanup (Sonnet, internal only)   per chunk: fix terms using glossary; never displayed
P4 extraction (Sonnet; Opus where the pilot says Yiddish needs it)
                        per shiur, one call: sections, bilingual summaries, sources, insights,
                        stories, Q&A, takeaways, candidate topics, segment kinds
P4b write-up (Opus)   per shiur: full write-up en + yi, from P4 sections + their segments
P5 verify (Haiku)       every claim vs its cited segments → drop / lower confidence
P6 source resolution    code + Sefaria index; Haiku fallback
P7 taxonomy (Opus)      corpus, then freeze
P8 re-tag (Haiku)       closed list
P9 clustering           teaching clusters, story dedupe
P10 series + entity pages (Opus/Sonnet) from P4/P8 outputs only
P11 index + load        D1 (FTS5), Vectorize, R2 JSON
```
Possible saving: try skipping P3 and feeding raw ASR + glossary + catalog title straight into P4. Decide in the pilot.

Operational rules: Batch API; prompt-cache the glossary + instructions prefix; store outputs at `derived/<pass>/<promptVersion>/<shiurId>.json` with model, prompt version and input hash; pilot on ~20 shiurim across both languages and all sections before the full run.

## Anti-noise rules
1. Every item carries `segs[]` evidence; failed verification is dropped; confidence < 0.6 hidden by default.
2. Timestamps only via segment indices converted in code; sections must tile the recording with no gaps or overlaps.
3. Caps: 4–12 sections/hour, ≥3 min each; subsections only in sections >12 min; key points 3–7; insights 3–7; Q&A ≤6; takeaways ≤5; topics ≤8 per shiur, ≤3 per section. Sources and stories uncapped but evidenced.
4. Empty lists are valid — no forced stories or takeaways.
5. No source text from the model (Sefaria only); refs marked `resolved | inferred | unresolved`.
6. No dates or occasions beyond catalog/path or cited evidence.
7. No psak, no advice he didn't give.
8. Yiddish and English outputs are each generated from the source, not one translated from the other's summary, then checked for agreement (cheap pass).
9. Non-speech segments excluded from summaries and search.

## Schema deltas vs. the first draft
- `Localized = { en: string; yi: string; he?: string }` (yi now required).
- Split `Shiur` (logical, catalog row) from `Recording` (audio file + transcript); `Shiur.recordingIds[]`, sections reference `recordingId` + segment range.
- `ShiurMeta` gains `catalog: { source: "pocket-guide-2012" | "uncatalogued-guide"; section: string; n?: string; titleOriginal: string; derived?: "pocket-guide" | "dir-prefix" | "filename"; page?: number }`, `hebrewYears: number[]`, `perek?: string`.
- Drop `SegmentLayer.corrected/translationEn` from published data and drop `Quote` entirely.
- Add `reviewStatus` to all corpus entities.
- Add `writeup: { en: WriteupBlock[]; yi: WriteupBlock[] }` where `WriteupBlock = { sectionId: string; heading?: string; paragraphs: { text: string; sourceIdx: number[]; evidence: Evidence }[] }`.

## Next steps
1. P0 ingest script → `Shiur`/`Recording` JSON for all 917, with the dedupe rules above.
2. Pilot P1–P5 on ~20 shiurim; review output by hand; pick models and decide on P3.
3. Full run, taxonomy, clustering, index.
4. **Flagged for later:** human review of glossary, taxonomy and Sefaria resolutions; re-transcription if sponsored; Purim seudos and untranscribed sets.
