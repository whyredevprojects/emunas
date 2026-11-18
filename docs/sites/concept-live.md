# Concept B — "Live": the listening workspace

Status: high-level concept, nothing built. Companion to the opposite concept (the quiet, document-like site). Figures below are from the repository on 2026-11-15: 997 in-scope shiurim (730 Yiddish, 267 English, 772 hours, median 43 minutes), of which 518 have derived data and 479 are pending.

## 1. The idea in one paragraph

Treat the corpus as about ten thousand addressable **moments** instead of a thousand files. The pipeline already cut every shiur into timestamped sections and attached sources, insights, stories, questions and takeaways to exact points in the audio. The site is a single app with a player that never stops, where every piece of text on screen is a button that plays the Mashgiach saying that thing. Search, the calendar, the timeline of years, the seforim shelf and the people index are all different ways of arriving at a moment; once you arrive, you are listening.

The app is for three kinds of visit:

1. "It is Thursday night, I want something on the parsha" (calendar-driven, 30 seconds to audio).
2. "He once said something about hester panim and Purim, where was it?" (recall-driven, search).
3. "I am going through the Tanya shiurim" (course-driven, progress and resume).

A feature that serves none of the three is cut.

## 2. Hard rule: no transcript text reaches the browser

The ASR transcripts are rough and are build-time input only. This shapes the concept, so it is stated before anything else.

**Never shipped, in any bundle, API response or index a client can read:**

| Field | Why it counts as transcript |
|---|---|
| `data/transcripts/*.json` segments | The transcript itself. |
| `data/derived/shiurim/<id>/input.txt` | The transcript as fed to the model. |
| `SourceMention.heardAs`, `concepts[].heardAs`, `people[].heardAs` | Verbatim ASR fragments (e.g. a garbled pasuk as heard). |
| `Extraction.asrNotes` | Describes the transcript and cites segment indices; internal QA. |
| `data/derived/audits/*` | Internal QA. |

**What the build does take from transcript-adjacent data:** only numbers. `meta.json` carries `recordings[].starts` (segment start times), so every `Evidence.segs`, `Section.startSeg/endSeg`, and `questionSegs/answerSegs` is converted to seconds at build time. The client receives `{ recordingId, t }` pairs and never a segment index or segment text.

**Consequences for the design:**

- The synced reading pane shows the AI write-up (third-person, "The Mashgiach explains…"), not captions. There is no scrolling transcript, no karaoke line, no quote cards, no "share this quote".
- Search results show generated text only (section summary, insight, story title). A hit is never a transcript snippet.
- Every text surface carries a small, constant label: summary written by AI from the recording, not the Mashgiach's words. The audio is the source; the text is a guide to it.

**Designed-in but OFF:** each published recording has a `transcript` descriptor, e.g. `{ eligible: false, quality: "budget-asr", version: <hash> }`. A "Transcript" tab in the listening room exists in the design and renders only when `eligible` is true. When a better transcription is produced (the pipeline already tracks `model`/`mode` per transcript and has `config/asr-policy.json`), eligibility is flipped per shiur by whoever owns that policy, and the tab, caption sync and quote-sharing appear for that shiur alone. Nothing else in the app changes.

**Decision to flag (default NO):** may raw transcript text, or the `heardAs` spelling variants, feed a *server-side, never-returned* search index to improve recall? It would help with terms the summaries don't mention. The risk is that ranking on garbage text surfaces confident wrong hits, and that any snippet/highlight bug becomes a leak. This concept assumes NO; section 8 describes search without it.

## 3. What the data actually supports

Counts are for the 519 extractions present today; expect roughly double at completion.

| Data (field) | Today | Used for |
|---|---|---|
| Catalog rows (`Shiur.catalog`, `parsha`, `zman`, `perek`, `hebrewYears`, `seriesId/seriesOrder`) | 997 shiurim; 284 with parsha, 348 with zman, 98 with perek, 620 with a year (5724–5780) | The skeleton. Works for all shiurim, with or without AI data. |
| `sections[]` (title, summary, `kind`, `catalogTopicIdx`) | 5,434, about 10.5 per shiur | Chapters, the search unit, the queue unit. |
| `summary.oneLiner / abstract / keyPoints` | every done shiur | Cards, previews, cross-language bridge. |
| `sources[]` (`work`, `ref`, `sefariaRef`, `resolution`, `mention`) | 15,525 mentions, 752 distinct works; 5,463 resolved, 4,963 inferred, 5,099 unresolved; 1,687 with no work | Seforim shelf, "who cites this pasuk". |
| `insights[]` | 3,244 | Insight feed, semantic "same idea" matching. |
| `questions[]` (question, answer, separate timestamps) | 2,387 | Kushya browser, "hear the question / hear the answer". |
| `takeaways[]` | 1,763 | Practical index. |
| `stories[]` (title, retelling, `people`) | 985 | Maasios library. |
| `people[]` | 8,071 mentions, 1,285 distinct strings | People index (needs normalizing, see gaps). |
| `concepts[].he` | 7,599 mentions, 3,044 distinct | Concept index and glossary entry points. |
| `candidateTopics[]` | 5,021 strings, 3,873 distinct, 3,329 used once | Raw material only; not a usable taxonomy yet. |
| `writeup.en / .yi` (paragraphs with `evidence`, `sourceIdx`) | every done shiur, ~1,000–1,400 words per language | Reader mode synced to the player. |
| `evidence.confidence` on every item | — | Hide below 0.6; soften wording between 0.6 and 0.75. |

Everything generated is `{ en, yi }`. The data names him the same way in both languages: English "the Mashgiach", Yiddish "דער משגיח". The UI follows the data.

### Gaps that limit the concept today

- **No frozen taxonomy.** Pipeline passes P7–P10 (topics, re-tagging, teaching clusters, story dedupe, series synthesis) have not run. `candidateTopics` is free text and mostly singletons. Topic browsing therefore starts from concepts, people, works and occasions, which repeat reliably, and from embeddings (section 8). A proper topic tree appears when the pipeline delivers one.
- **Entity strings are not normalized.** "Dovid HaMelech" and "David HaMelech", "Ramban" and "the Ramban", "Yitzchak" and "Yitzchak Avinu" are separate strings. The site needs its own alias table at build time (in site territory, not in `data/`), marked unreviewed, until the pipeline's glossary pass exists.
- **A third of source mentions are unresolved** and many name only a genre ("Midrash" 644, "Gemara" 207). The seforim shelf shows resolved and inferred refs as navigable and lists the rest under the work without a location.
- **377 shiurim have no year**, including the whole Yiddish Tanya series. Timeline views carry an "undated" lane; nothing guesses dates.
- **211 shiurim come from the uncatalogued guide** (`catalog.derived` = `filename` or `dir-prefix`), with titles read off file names. They get a visible "uncatalogued" mark and rank below catalogued rows on ties.
- **Subsections are almost absent** (20 in total), so chapter navigation is one level.
- **No human review of anything.** Section 9 turns this into a feature.

## 4. The shell

Four persistent elements; everything else swaps inside them.

1. **The player dock.** Always present once anything has been played. Shows the current section title, a chapter-segmented progress bar, and transport. Expands into the listening room. Navigation never interrupts audio.
2. **The command bar.** One field, reachable from anywhere by keyboard or a thumb. Typing searches; results are moments. It also accepts jumps: a parsha name, "Tanya 12", a year, a sefer.
3. **The rail.** Six destinations: Today, Explore, Seforim, Maasios, Series, My Shelf.
4. **The language control.** Two independent settings, explained in section 7: the interface language and the languages of shiurim you want to hear.

On a phone the rail becomes a bottom bar above the dock and the listening room is a full-height sheet. On a desktop the listening room can sit as a right-hand pane beside whatever is being browsed, so exploring and listening happen side by side.

## 5. Destinations

### 5.1 Today (home)

Answers "what should I listen to now" without a search.

- **This week.** The current parsha and the nearest zman, computed from the Hebrew date in the client, matched to `Shiur.parsha` and `Shiur.zman`. For a parsha like Lech Lecha there are 13 Yiddish shiurim; they appear as a row ordered by `hebrewYears`, each card showing the year, `summary.oneLiner` in the interface language, duration and a language mark. The catalog's own title (`catalog.titleOriginal`) is shown as written, since it is the one human-authored line.
- **Continue.** Unfinished shiurim and the next part of any series in progress (from local progress, section 6.4).
- **A moment for today.** One insight, story or question chosen deterministically per day from items tied to the current occasion, with a play button that starts at its timestamp. It gives a returning listener a two-minute entry point.
- **Recently added insight.** Because data is still arriving, a "newly summarized" strip lists shiurim whose AI content landed since the last build (`manifest.entries[].updatedAt`). It disappears when the corpus is complete.

Zman labels in the catalog are inconsistent (`ל"ג בעומר` and `ל”ג בעומר`, `יו”כ` and `יום הכיפורים`); the site keeps a small occasion-normalization table of its own.

### 5.2 Explore

One screen with a facet column, a result list and three alternate lenses over the same result set. Facets and lenses are all backed by fields that exist.

**Facets:** language (`lang`), kind of shiur (`category`: parsha, zman, set, shonos, simcha, misc, current), occasion (`parsha`, `zman`), series (`seriesId`), year range (`hebrewYears`), sefer cited (`sources.work`), person (`people.name`), concept (`concepts.he`), duration, has-stories, has-AI-content, catalogued/uncatalogued. Counts update as facets are applied; a facet that would give zero is dimmed, not hidden.

**Result unit toggle:** shiurim or moments. In moments mode a result is a section, insight, story, question or takeaway, each with its parent shiur, year and a play-from-here control.

**Lenses:**

- **Luach.** The Jewish year as a ring or strip, Tishrei to Elul, with parshiyos on the outer track and zmanim on the inner. Each stop shows how many shiurim it has and opens a stack ordered by year. Need: the yearly cycle is how this audience already organizes Torah.
- **Years.** A horizontal timeline 5724–5780 showing shiurim per year (dense around 5733, 5749, 5762–5765, 5769–5773), filtered by whatever facets are active. Select a concept and see when he spoke about it. Undated shiurim sit in a separate lane with their count stated. Need: followers who were there in a given period, and anyone asking how a teaching developed.
- **Connections.** A focused graph centred on one entity (a concept, person or sefer), showing the entities that most often share a section with it and the shiurim along each edge. It is always entered from an entity page with one centre and one hop; there is no whole-corpus hairball. Need: "what does he connect to Amalek?" Because co-occurrence is computed from unreviewed extraction, edges need a minimum count (say five shiurim) to appear.

### 5.3 The listening room (shiur page)

The page type the rest of the app feeds. Three stacked areas, with tabs on small screens.

**Header.** Catalog title as written, generated one-liner beneath it, then year, parsha/zman, series position ("Tanya, perek 12, part 14 of 63"), duration, recording language. Path notes such as "imperfect sound quality" and "for children" are shown here because they change whether someone wants to listen.

**Chapters.** The section list with titles and 1–3 sentence summaries, the active one highlighted as audio plays. `kind` drives behaviour:

- `noise`, `singing`, `other_speaker` are greyed and skipped by default (a setting), which removes dead air and Whisper's silence hallucination zones from the listening experience.
- `story` sections carry a marker, so a listener can jump between stories.
- `intro`, `closing`, `brachah` are collapsed.
- `catalogTopicIdx` ties sections back to the semicolon-separated items of the catalog title, so the human table of contents becomes clickable: tap "ביאור ענין מזל" in the title and the audio goes there.

**Companion tabs**, all time-linked:

- *Read.* The write-up for this shiur in the chosen language. The paragraph being spoken about is highlighted (from the paragraph's `evidence` times) and tapping a paragraph seeks. Sources named in a paragraph (`sourceIdx`) are inline chips. A language toggle swaps en/yi in place and keeps position by `sectionIndex`, which both languages share.
- *Sources.* Mentions in order of appearance, grouped by work, each with `ref`, a mark for quoted / paraphrased / alluded, and a "resolved / inferred" indicator. Resolved ones open the text on Sefaria (link out, or a side panel using Sefaria's public API, which is an external dependency to approve). Unresolved mentions are listed as "a Midrash, not located". The model never supplies source text.
- *Insights, Questions, Takeaways, Stories.* Short lists; each item seeks to its evidence. Questions have two controls, "hear the question" and "hear the answer", from `questionSegs` and `answerSegs`.
- *Related.* Other years of the same parsha/zman; the same shiur's counterpart in the other language where a series has one; nearest neighbours by embedding ("same idea elsewhere", section 8).
- *Transcript.* Hidden unless the recording is eligible (section 2).

**Without derived data** (479 shiurim today) the room still works: header from the catalog, a plain player, the catalog title's own items as an untimed outline, neighbours by parsha/zman/series, and a line saying the summary is being prepared. Chapters and tabs fill in on the first rebuild after the pipeline commits that shiur. Nothing in the app assumes derived data exists.

### 5.4 Seforim

A shelf of the works he cites, built from `sources.work`: Chumash and Nach by book, Shas by masechta, then Midrash, Zohar, Rashi, Ramban, Bnei Yissaschar (183 mentions), Chasam Sofer (109), Tanya (102), Ohr HaChaim and so on.

A work page lists its cited locations in the work's own order (from `ref` / `sefariaRef`) with, under each, every moment where he discusses it. For Chumash this becomes a **pasuk view**: open Bereishis 12 and see which pesukim have shiurim on them and from which years. For Tehillim (826 mentions) it becomes a kapitel index. Need: a maggid shiur preparing a pasuk, or someone learning a sefer who wants what the Mashgiach said on this piece.

Works with only unlocated mentions show a flat list of moments. Genre-only mentions ("Gemara", "Midrash") are not shelved as works.

### 5.5 Maasios

The 985 stories as their own library: title, the people in it (`stories[].people`), a short retelling, the shiur and year, and play. Facet by person: the Ba'al Shem Tov (37), the Satmar Rav (27), the Chofetz Chaim (21), the Maggid of Mezritch and the Chozeh of Lublin (18 each). A "stories only" play mode queues story moments back to back.

Need: stories are what people remember and retell at a Shabbos table, and they are the gentlest entry for someone new. Gap: the same story told in several shiurim is not yet deduplicated (pipeline P9). Until then the site may group likely retellings by embedding similarity plus shared people, labelled "possibly the same story", never merged.

### 5.6 Series

Course mode for the sets: Tanya in Yiddish (63) and English (42), Emunah (27 / 28), Tefilah (41 / 17), Eretz Yisroel (14), Shiurim LaBachurim (20), Shir Hashirim (8), Kedushas HaShabbos (8), Pirkei Avos (4), and the later bachurim and summer series.

A series page is an ordered path (`seriesOrder`) with per-part one-liners, progress, and "continue". Tanya is additionally laid out by `perek`, so someone learning perek 12 finds every part on it in either language. Where the same series exists in both languages the page offers a side-by-side view. These are parallel courses given separately and are presented as such, not as translations of each other.

Gap: series overviews (pipeline P10) don't exist. Until they do, the series page uses catalog section titles and per-part one-liners only.

### 5.7 Entity pages (person, concept, occasion)

One template: name in Hebrew and English, counts, a year sparkline, top co-occurring entities (the entry to the Connections lens), and the list of moments. For a person the page separates "cited as a source", "appears in stories" and "discussed", using `sources`, `stories.people` and `people`. Concept pages are headed by the Hebrew term (`concepts.he`), which is the stable key; a definition appears only when the pipeline's glossary pass supplies one.

### 5.8 My Shelf

Personal state: continue listening, queue, playlists, saved moments, notes, history, downloads. Described next.

## 6. Listening

### 6.1 The player

- Chapter-aware scrubbing: the bar is segmented by section; previous/next jump by section; long-press shows the section title.
- Skip rules by `kind` (silence, singing, other speakers), on by default and visible when triggered ("skipped 2:10 of singing").
- Speed, sleep timer (end of section / end of shiur / minutes), and volume normalisation, since recordings span fifty years of cassettes.
- Lock-screen and car controls with section titles as chapter metadata, so next/previous on a steering wheel moves by section.
- Multi-recording shiurim (four today) play as one continuous timeline in `recordingIds` order.

Audio is addressed by recording id, not by bucket path. The R2 keys are human folder paths with spaces (`01 Harav Moshe Wolfson - Yiddish Shiurim/…/01-01 Breishis.mp3`); a small audio Worker maps `/audio/<recordingId>` to `Recording.audioKey` from a build-generated table and serves range requests from R2 with long cache lifetimes. This keeps URLs stable if the bucket is reorganised and is the single place to add download limits later.

### 6.2 Queue and moment playlists

The queue holds **moments**, not only whole shiurim. Any section, story, insight or question can be added, so a listener can build "everything on hester panim around Purim" as forty minutes drawn from nine shiurim across twenty years. A moment plays from its start time to the end of its section and offers "keep listening to this shiur" when it ends.

Every list in the app has "play all" and "add to queue": a search result, a pasuk, a person's stories, a year. Playlists are saved queues with a name. A playlist is shareable as a link that encodes shiur ids and times and needs no account.

### 6.3 Deep links

Every moment has a URL (`shiur + t`). Sharing from the player sends a link that opens the listening room at that second with the section summary visible. Links to shiurim without derived data still work.

### 6.4 Progress, saving, notes

- Position per shiur, completed sections, completed shiurim, series progress, and a private count of hours. No streaks, badges or leaderboards; this is learning.
- Save any moment; add a private note at the current time. Notes are the user's own words and may say anything.
- Offline: download a shiur or a playlist for a commute or a flight. Summaries are cached with the audio.

All of this is **local-first**: stored on the device, working with no account. Optional sync across devices (phone to car to desk) needs a backend: sign-in by emailed link, a D1 database or one Durable Object per user holding progress, queue, saves and notes. This is the only feature that requires user accounts, and it can ship later without changing anything else.

## 7. Two languages, two scripts

Three separate things are kept separate:

1. **Interface language**: English or Yiddish. Yiddish and Hebrew render right-to-left; in Yiddish mode the whole shell mirrors (rail, dock, progress direction of lists). The audio progress bar is the one judgement call: recommended to run right-to-left in Yiddish mode, consistent with reading, with the choice tested on real users.
2. **Shiur language filter**: Yiddish, English, or both. Default is both, because the summaries make every shiur approachable in either language.
3. **Reading language** for generated text, defaulting to the interface language and switchable per pane.

The bridge is the main product claim for half the audience: an English speaker can search, read about and navigate 730 Yiddish shiurim through English summaries and then decide to listen, with the chapter list as a guide while the Yiddish plays. Every card marks the *audio* language clearly so nobody is surprised.

Mixed-direction text is constant (English catalog titles contain Hebrew words: "The קדושה of צדיקים"). Text is stored as written and each string is direction-isolated; nothing is transliterated or "fixed". Search accepts Hebrew script, Yiddish spelling and English transliteration for the same thing (section 8).

Hebrew years are shown as Hebrew years (תשל"ו) with the numeric form secondary. Tone throughout is plain and respectful: no marketing voice, no exclamation, the Mashgiach referred to as the data does, zt"l on first mention per page.

## 8. Search and "same idea"

**What is indexed** (generated and catalog text only): catalog titles and headings; one-liners, abstracts, key points; section titles and summaries; insights, questions and answers, takeaways, story titles and retellings; write-up paragraphs; source `work`/`ref`; `people.name`; `concepts.he`. All in both languages where they exist.

**Why it needs a backend.** A client-side index is feasible for shiur-level metadata (and is used for instant facet counts, shipped as a compact static file). The full moment-level corpus with write-ups, in two languages, is tens of megabytes of text at completion, and semantic search needs vectors. So:

- **Search Worker** in front of **D1 with FTS5** for lexical search over moments, with facet filters. Returns ids, generated titles and times only.
- **Vectorize** with a multilingual embedding model for semantic queries ("why do tzaddikim suffer" finds sections that never use those words) and for cross-language matching. Vectors are computed at build time from generated text.
- **Alias expansion** before both: a site-owned table mapping spellings (Chanukah / Hanukkah / חנוכה; Bnei Yissaschar / בני יששכר; Dovid / David). This is where normalization debt is paid for now.

Results are grouped by shiur, ranked with catalogued above uncatalogued and higher `confidence` above lower, and show which field matched (section, story, source). As-you-type suggestions come from the entity lists, so typing "בני" offers the sefer before any full search runs.

**Same idea elsewhere.** For each insight and section, the build stores its nearest neighbours by embedding in *other* shiurim. On the listening room this appears as "he returns to this in…", ordered by year. This is a similarity suggestion and is labelled so; it becomes "the same teaching across years" only when the pipeline's verified clustering (P9) lands. With years on 620 shiurim it gives the development-over-time view the catalog was always hinting at.

**Ask (experimental, later).** A question box that answers only by assembling existing generated items with their shiur and timestamp, and declines when nothing matches. It would call a language model at request time, which adds cost and a new failure mode, and it must draw on derived text only. Recommended to hold until human review exists; listed so the architecture leaves room.

## 9. Trust and correction

All of the text is unreviewed machine output about a revered teacher, so the design has to state that plainly on every page.

- The constant AI label (section 2), and the write-up's reported-speech voice, keep summaries from reading as his words.
- Items under 0.6 confidence are not published. Inferred source references are marked.
- **"Something's wrong here"** on every item: a two-tap report (wrong source, wrong name, wrong timestamp, misrepresents the shiur) with optional text, stored in D1 for a maintainer. This is the cheapest path to the human review the plan defers, and it comes from the people best able to do it. Reports never change the site directly; they are a queue for the pipeline owner.
- Uncatalogued shiurim are marked as such.

## 10. Data flow and what runs where

- **Build (site territory, e.g. its own directory; never writes to `data/`, `scripts/` or `src/`):** read `data/derived/ingest.json`, `manifest.json` and each `shiurim/<id>/{meta,extraction,writeup}.json` that exists; convert segment indices to seconds; strip the excluded fields; apply alias tables; emit (a) per-shiur JSON, (b) a compact corpus index for facets, calendar and timeline, (c) entity pages' data, (d) search rows and vectors. A build-time check fails the build if any excluded field name or any transcript segment string appears in the output.
- **New data.** A rebuild is triggered when `data/` changes on the branch. A shiur moves from "catalog only" to "full" with no code change. The app shows the corpus state honestly ("518 of 997 summarized").
- **Static:** the app shell and the JSON above, on Workers static assets.
- **Dynamic:** audio Worker (R2 range requests); search Worker (D1 FTS5 + Vectorize); feedback endpoint (D1); optional sync (D1 or Durable Objects); optional Ask.
- **Works with dynamic parts down:** browsing, calendar, timeline, shiur pages and playback of cached audio all run from static files. Search degrades to shiur-level client-side matching.

The app shell is an installable PWA so it sits on a phone's home screen and keeps downloads. Shiur and entity pages should also be delivered as real pages with titles and summaries for sharing previews and search engines; an app that is invisible to a web search fails the recall use case for people who start at a search engine.

## 11. Decisions to flag

1. Transcript text or `heardAs` in a hidden server-side index: default **NO**.
2. Who flips `transcript.eligible`, and on what evidence, when better transcripts exist.
3. Sefaria integration: link out only, or in-app text panel via their API.
4. Accounts and sync: ship local-only first?
5. Audio downloads: allow freely, or streaming plus in-app offline only?
6. Whether the 79 `current` shiurim and uncatalogued simcha recordings (bar mitzvahs, sheva brachos) belong in general browse or behind their own section; some are private family occasions.
7. Site-side alias and occasion tables are a stopgap. Should they be handed to the pipeline as seed data for its glossary pass?
8. Progress-bar direction in Yiddish mode.
9. Whether "Ask" is ever in scope.

## 12. Suggested order

1. Shell, player with chapters, listening room, Today, catalog browse. Useful for all 997 shiurim on day one.
2. Explore facets, Luach and Years lenses, Series, queue of moments, local progress.
3. Search Worker (lexical, then semantic), Seforim, Maasios, entity pages, "same idea elsewhere".
4. Feedback queue, offline, sync.
5. Connections graph, Ask, transcript tab if and when eligibility exists.

## 13. Deliberately left out

Scrolling captions, quote cards, word clouds, comments and social feeds, gamified streaks, auto-generated "related" links from model memory, guessed dates, a biography section, and any whole-corpus graph shown for its own sake.
