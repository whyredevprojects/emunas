# Concept A — "Quiet": the catalog as a sefer

Status: concept only. High-level design, no implementation. Nothing here touches `data/`, `scripts/` or `src/`.

## 1. The idea in one paragraph

The site is the 2012 Pocket Guide grown into a full library catalog. It is organised the way a sefer is: a title page, a table of contents in the order the guide's editors chose, one page per shiur, and a set of **mafteichos** (indexes) at the back: by parsha, by zman, by year, by sefer cited, by story, by person, by inyan. Every page is a pre-rendered document with a permanent address. You can read it, print it, link to it and listen from it with JavaScript switched off. The AI-generated material is presented as what it is, a study aid prepared from the recordings ("notes on the shiur"), set apart from the two things that carry authority: the Mashgiach's voice in the audio and the human-written catalog entry.

What the site is not: an app, a feed, a recommendation engine, a place with accounts, or a transcript reader.

## 2. What the data actually supports (as sampled, 15 Nov 2026)

Design decisions below lean on these facts, so they are stated once here.

| Fact | Where it comes from | Consequence for the design |
|---|---|---|
| 997 in-scope shiurim, about 772 hours; 730 Yiddish, 267 English | `data/derived/ingest.json` `stats` | Two interface editions, one shared corpus |
| 786 rows from the Pocket Guide with human titles, 211 guessed from file names | `Shiur.catalog.source`, `catalog.derived` (`catalog` / `filename` / `dir-prefix`) | Catalog rows shown with page and number; guessed rows visibly marked as such |
| Guide sections: פרשת השבוע 131, זמנים 223, שונות 49, תניא 63, תפילה 41, אמונה 27, ארץ ישראל 14, שיעורים לבחורים 20, Shir Hashirim 8, Kedushas HaShabbos 8; English Parsha 68, Zmanim 86, Tanya 43, Emunah 28, Tefila 17, Misc 23; uncatalogued "Current" 79, Simchos 72 | `catalog.sectionId`, `sectionTitle`, `Shiur.category`, `ingest.series` (17 series) | The table of contents is the guide's own order |
| Year known for 611 shiurim (5724–5780, densest 5749 and 5762–5773); unknown for all sets and simchos | `Shiur.hebrewYears` | A year index is real but partial; it must say so |
| 518 shiurim have derived data; 479 pending | `data/derived/manifest.json` `entries[].status` | Pending is a normal page state, designed for, not an error |
| What is done so far: parsha (195 of 199), zmanim (284 of 307), shonos (36 of 49), 3 English misc. **No set (Tanya, Emunah, Tefilah, …), no Current, no Simchos yet** | manifest × `Shiur.category` | Series pages launch as catalog-only and fill in later |
| Per done shiur, on average: 10 sections, 30 sources, 6 insights, 4–5 questions, 3–4 takeaways, 2 stories; write-ups of roughly 900–1,700 words per language | `extraction.json`, `writeup.json`, manifest `validator.wordsEn/wordsYi` | Enough for a long reading page: the listening app shows it; the Library's shiur page stays short (§5.4) |
| Sources: 15,525 mentions; a third `resolved` (with `sefariaRef`), a third `inferred`, a third `unresolved`; 1,687 have no `work` at all | `SourceMention.resolution`, `work`, `ref` | The sources index is the strongest AI-derived index, but needs honest grading |
| People: 8,071 mentions, 1,285 distinct strings, with duplicates ("Dovid HaMelech" / "David HaMelech", "Ramban" / "the Ramban") | `Extraction.people[].name` | A people index needs a normalisation pass before it is trustworthy |
| Topics: 5,021 `candidateTopics`, 3,873 distinct free-text phrases; the frozen taxonomy (P7/P8 in the plan) does not exist yet | `Extraction.candidateTopics` | No topic tree at launch. See §6.6 |
| Concepts: 3,044 distinct Hebrew terms (רבונו של עולם 218, עקבתא דמשיחא 85, הסתר פנים 47, …) | `Extraction.concepts[].he` | Usable as a plain alphabetical index once trivial terms are filtered |
| Segment start/end times are in `meta.json` (`recordings[].starts[]`, `ends[]`), with no text | `data/derived/shiurim/<id>/meta.json` | **Every timestamp on the site can be computed without opening a transcript file** |
| Several fields contain raw ASR text: `SourceMention.heardAs`, `concepts[].heardAs`, `people[].heardAs`, `asrNotes`, and the whole of `input.txt` | `extraction.json`, shiur directory | These are transcript in disguise and are never published (§9) |
| The Yiddish text calls him "דער משגיח", the English "the Mashgiach" | `summary.*.yi` / `.en` | The English and Yiddish notes keep their own voice; neither is a translation of the other (plan rule 8). The Hebrew notes are translations of them ("המשגיח"), made as overlays (§8) |

## 3. Design principles

1. **The catalog is the spine.** Navigation follows fields a person wrote in 2012 (`sectionTitle`, `n`, `page`, `parsha`, `zman`, `perek`, `shana`). AI-derived indexes sit behind it, like the mafteichos at the back of a sefer.
2. **Three voices, never blended.** (a) The Mashgiach: audio only. (b) The catalog: titles exactly as printed, in their original mixed Hebrew/Yiddish/English. (c) Notes: everything generated, always in reported speech, always under a "notes" label. Typography, placement and labels keep the three apart on every page.
3. **A page is a document.** Each has one job, one URL, a printed-page layout, and reads top to bottom. No tabs that hide content, no infinite lists, no modal windows.
4. **Works with nothing.** No JavaScript, a filtered connection, a slow phone, a printer. Scripts only add convenience on top of a page that already works.
5. **Nothing pretends to be finished.** Pending shiurim, unresolved sources, guessed catalog rows and unreviewed AI output are each stated plainly and briefly, once, where they apply.
6. **No transcript, anywhere.** Not as text, not as snippets, not as quotes, not as raw "heard as" strings.

## 4. Information architecture

Parallel editions with identical structure, one per interface language (`UI_LANGS`): `/yi/…` (Yiddish, right-to-left), `/he/…` (Hebrew, right-to-left) and `/en/…` (English, left-to-right). Every page exists in each. The corpus is the same in all of them; only the interface language and the language of the notes differ.

```
שער / Title page
│
├── תוכן / Contents ................ the Pocket Guide order: sections → shiurim
│     ├── Section page (פרשת השבוע, זמנים, שונות, English Parsha, …)
│     └── Series page (תניא, אמונה, תפילה, ארץ ישראל, שיעורים לבחורים, Shir Hashirim, …)
│
├── Shiur page ..................... one per Shiur.id (997), the unit of the whole site
│
├── מפתחות / Indexes
│     ├── לוח: by parsha and by zman (both languages of shiur together)
│     ├── שנים: by year
│     ├── מראי מקומות: by sefer cited
│     ├── מעשיות: stories
│     ├── שמות: people
│     └── ענינים: concepts and inyanim
│
├── Search ......................... one page, optional script, catalog + notes only
└── About ......................... the Mashgiach and the collection, how the notes were made, how to report an error
```

The global navigation is one line and never changes: **Contents · Calendar · Indexes · Search · About**, plus the edition switch. Every page carries a breadcrumb that mirrors the catalog ("Contents › זמנים › חנוכה › no. 12"), and a shiur page always has previous/next links in catalog order.

### Why this shape

- People who own the Pocket Guide or the CDs already know the collection by its sections. The contents page reproduces that mental map and adds nothing to it.
- The listeners' real question most weeks is "what is there on this week's parsha, or the coming Yom Tov?" That is the calendar index, promoted to the main navigation and to the title page.
- Everything else (sources, stories, people) is for the person who has a specific thing in mind. That is what an index is for, and an index is a calm thing: an alphabetised list with page references.

## 5. Page types

### 5.1 Title page (שער)

Responsibility: say what this is and offer the three ways in.

- The name of the collection and one sentence about it. No hero imagery, no carousel.
- **This week**: the current parsha (when it has shiurim) and the zmanim now and coming, each as a short list of links (titles only) into the calendar index. The zmanim follow the rule both sites share (`currentAndUpcoming` in `@emunas/calendar`): every zman that is on, every one starting within ten days, and, when there is none, the next one however far ahead, so the section is never empty; only zmanim with shiurim. A coming zman says the day it starts. From the third zman on a block is compact (heading and link, no titles); the parsha does not count. Long windows (a month, Sefirah, the Three Weeks) do not take a block: they are one line of links under the grid, each marked "Now" or with the day it starts, and take blocks only when nothing else would show. Computed at build time for the build day (US Eastern) and the days around it: one before and three after. A small script shows the visitor's own day, rolling over at their local midnight as in Live. Without script, or outside those days, the page shows the build day and its lead says which day that is. The Quiet-only rebuild every second day (§10) keeps the window current.
- **The contents in brief**: the guide's sections with counts ("זמנים · 223 שיעורים").
- **The indexes**, one line each.
- A small standing line: "997 shiurim, about 770 hours. Notes are available for 518 so far and are being added." The numbers come from the manifest at build time.

There is deliberately no "featured", "popular" or "recently added". A closed corpus by a rav who has passed away is not news.

### 5.2 Contents and section pages

Responsibility: the catalog, faithfully.

The contents page lists sections in guide order, Yiddish sections and English sections each under their own heading (the guide itself separates them). A section page is a plain numbered table, one row per shiur:

| Column | Field |
|---|---|
| Number | `catalog.n` |
| Title as catalogued | `catalog.titleOriginal` (plus `catalog.heading` for shonos and English misc, e.g. "חיזוק בתפילה", "פרקי אבות") |
| Parsha / zman | `parsha`, `zman` |
| Year | `hebrewYears`, shown as תשמ"ג with the civil year beside it |
| Length | `Recording.durationSec` summed |
| One line of notes | `summary.oneLiner` in the edition's language, when it exists |

Large sections are sub-grouped the way the guide groups them: פרשת השבוע by chumash and parsha, זמנים by zman in the order of the year. Sub-groups are headings on one long page with a jump list at the top, not separate filter states.

Rows from `uncatalogued-guide` carry a small mark, "not in the 2012 guide; title taken from the file name", driven by `catalog.derived` and `catalog.note`. The "Current" and "Simchos" sections consist entirely of such rows and say so in a sentence under their heading.

### 5.3 Series pages

Responsibility: present an ordered set as a course.

Uses `Series.shiurIds` (ordered) and `seriesOrder`. For Tanya the list is grouped by `perek` (catalog metadata: "פרק א", "פרק ב" …), so the page reads like the table of contents of a commentary on the sefer. The catalog titles for the sets are already detailed semicolon lists of topics ("שתי נשמות לישראל; טעם שהטומאה נקרא קליפה; ד' קליפות וד' יסודות"), which makes these pages useful before any notes exist.

Each shiur page inside a series shows "Part 6 of 63" and previous/next within the series.

Where a set exists in both languages (Tanya, Emunah, Tefilah), the two series pages link to each other. They are not merged: the English Tanya is a different set of shiurim, not a translation.

Gap: no series has derived data yet, and the plan's series synthesis (an overview of each set) has not been generated. The page reserves a short introduction slot that stays empty until that exists; until then the heading and the list are enough.

### 5.4 The shiur page

This is the page the whole site exists for. It is kept short: what the shiur is, the recording, a few lines about it, and the way to the next one. The full notes (outline, write-up, sources, the apparatus) live in the listening app. From top to bottom:

**Breadcrumb.** Contents › section › the shiur's title. The last crumb is always the title as catalogued (never "no. 5"), cut short with an ellipsis on screen only, so the whole title stays in the page for screen readers and in either direction.

**1. Catalog header (the human voice).**
- Title exactly as catalogued (`titleOriginal`), in its original script and mixture of languages. In the English edition, a Yiddish/Hebrew title stays in Hebrew letters; titles are not machine-translated.
- One meta line: parsha or zman, perek (labelled "Perek ב" / "פרק ב" when it is a number), year, spoken language, length. For example: "בראשית · תשל"ז (1976–77) · Yiddish · 56 min". Fields: `parsha`/`zman`, `perek`, `hebrewYears`, `lang`, duration. The section is in the breadcrumb, so it is not repeated; the catalog number and the Pocket Guide page are not shown.
- Any `pathNotes` ("imperfect sound quality", "for children") as a plain note.

**2. Listen**, directly under the meta line.
- A standard audio control and a download link for the file. With several recordings (`recordingIds`, 39 shiurim have more than one, one has 21) the tracks are listed in order, each with its own control.
- With script the playing control stays docked while reading, and `#t=<seconds>` in the address seeks there: the topic, story and index pages link a place in a shiur this way. Without script it is the browser's own player and still works.
- "Open in the listening app": the same shiur in Live.

**3. About this shiur (notes begin here, under a visible rule and label).**
- A one-line standing label for the notes area: "Notes prepared by AI from the recording; not reviewed. The recording is the source." It links to the About page.
- `summary.oneLiner`, then `summary.abstract`, in the edition's language.
- One line of ענינים: the shiur's main topics (salience ≥ 0.6, at most five), each linked to its topic page.

**4. Previous and next.** One line: `← previous title · series or section · next title →`. When the shiur is in a series the line follows the series order (a series can run past the end of its catalog section); otherwise it follows the section. The first and last shiur have one side only. Catalog fields only: the site does not show AI-invented "related shiurim".

**5. Report an error.** A plain mail link that pre-fills the shiur id. For an unreviewed corpus this is the review process.

Hidden by default everywhere on this page: any item whose `confidence` is below 0.6 (the plan's own rule).

#### The shiur page when notes are pending

Parts 1, 2, 4 and 5 render as usual. In place of part 3 there is one sentence: "Notes for this shiur have not been prepared yet." There is no placeholder skeleton, and the page is complete as a catalog entry with a recording. When the data lands and the site rebuilds, the page gains its notes at the same address.

### 5.5 Calendar index (לוח)

Responsibility: answer "what is there for now?"

Two pages: **by parsha** (the 54 sedros in order, grouped by chumash) and **by zman** (around the year from Elul and Tishrei: אלול, ראש השנה, עשרת ימי תשובה, יום כיפור, סוכות, הושענא רבה, שמיני עצרת, חנוכה, זאת חנוכה, שובבי"ם, ט"ו בשבט, the four parshiyos, פורים, ניסן, פסח, ספירה, ל"ג בעומר, שבועות, בין המצרים, ט' באב, ט"ו באב).

Each parsha or zman has its own page listing every shiur on it, **Yiddish and English together**, sorted by year, with section, language and one-liner. This is the one place where the guide's separation by language is deliberately overridden, because the occasion is the question. It also gives "the same parsha across the years" (16 shiurim each on לך לך, תולדות and בשלח; 69 on Purim) with no AI involved.

Data notes: `zman` values need normalising at build time ("ל"ג בעומר" and "ל”ג בעומר", "יו”כ" and "יום הכיפורים" are the same thing; seudah entries such as "סעודת זאת חנוכה" belong under their zman as a sub-heading). The Current and Simchos rows have parsha names only inside file-name titles ("bachurim lech lecha", "bar mitzva Vaera"); the calendar may list them under a "probably" sub-heading or leave them out. Recommended: leave them out until someone confirms them.

### 5.6 Year index (שנים)

A single page with a row per year from תשכ"ד to תש"פ and its count, each leading to a year page that lists that year's shiurim in calendar order (parsha and zman sequence, since there are no dates beyond the year). A final entry, "Year not recorded", holds the 386 shiurim without one and explains that the sets and simchos were not dated in the guide.

This index is modest on purpose. It lets someone hear the Mashgiach in the 1970s beside the 2000s, and that is all it claims.

### 5.7 Sources index (מראי מקומות)

The most valuable AI-derived index, and the most sefer-like.

- The index page lists works in the traditional order of a mafteach: Torah by chumash, Nevi'im, Kesuvim, Mishnah and Gemara by masechta, Midrash, Zohar, Rishonim, then later seforim alphabetically (Bnei Yissaschar 183 mentions, Chasam Sofer 109, Tanya 102, Ohr HaChaim 69 …). Built from `SourceMention.work`.
- A work page lists references in the work's own order (by perek and pasuk, or by daf), each followed by the shiurim that bring it, each of those linking straight to the moment in the shiur. Bereishis 8:7 → "נח, no. 5, תשמ"ג", with the time in the shiur.
- Only `resolved` and `inferred` mentions get a line under a specific reference; `inferred` ones carry the "apparently" wording. Mentions with a work but no place are gathered at the end of the work's page under "place not identified".
- Works with very few mentions (most of the 752 distinct `work` strings) are still listed; a long tail is what an index is.

Gaps: `work` names are model-normalised, not checked against a canonical list (the plan's P6 pass), so the build needs a small alias table to merge spellings and to sort works into the traditional order. That table belongs to the site and is the natural first thing for a human reviewer to correct.

### 5.8 Stories index (מעשיות)

About a thousand stories so far (`stories[]`), each with a bilingual `title`, a `retelling` and `people[]`.

- The index is a list of story titles grouped by the main person they are about (the Ba'al Shem Tov, the Chasam Sofer, the Satmar Rav …), each line pointing to its shiur and time.
- There is no page per story. The retelling lives on the shiur page; the index points there. This keeps the story inside the shiur where the Mashgiach used it, and avoids presenting an AI retelling as a standalone text.

Gap: the same story told in several shiurim appears several times; the plan's deduplication pass (P9) has not run. The index lists each telling. Sorting by person puts likely repeats next to each other, which is good enough and honest.

### 5.9 People index (שמות)

An alphabetical index of names (`people[].name`), each with the shiurim that mention them. Useful mainly for Chassidic and later figures; a listener looking for "the Chiddushei HaRim" or "the Satmar Rav" gets a real list.

Rules that keep it sane: names that occur in nearly every shiur (Moshe Rabbeinu 297, Rashi 284) get a count and a note rather than a 300-line list on the index, with the full list on their own page. Names need an alias table before launch of this index (1,285 distinct strings with obvious duplicates). The people index can ship after the others without harming the site.

### 5.10 Inyanim index (ענינים)

At launch: an alphabetical index of **concepts** by their Hebrew term (`concepts[].he`), filtered to terms that occur in at least a handful of shiurim and are not mere vocabulary (הסתר פנים, עקבתא דמשיחא, מסירות נפש, אור הגנוז, השגחה פרטית, המתקת הדינים). Each term has a page listing shiurim and, where the term matches a section title, the section. The Hebrew term is the headword in every edition; the English edition adds a transliteration for sorting.

Not at launch: a topic hierarchy. `candidateTopics` is 3,873 free phrases with no shared vocabulary, and the plan's frozen taxonomy has not been built. Showing them as browsable topics would manufacture structure that is not there. They are used only as search keywords (§7) until the taxonomy pass exists, at which point this index gains a second, hierarchical page. The index page says in one line that it is partial and unreviewed.

### 5.11 About

Three short sections: the Mashgiach and the collection (written by a person, to be supplied); how the site is arranged; and how the notes were made, stated without hedging or salesmanship: they were prepared by an AI model from automatic transcriptions of the recordings, they have not been reviewed by talmidim, they may contain errors of hearing and of understanding, they do not quote the Mashgiach, and the recording is always the authority. Then how to report an error, and what is not included (Purim seudos and the other out-of-scope items in `outOfScopeReason`).

## 6. Listening and discovery flows

**"Something for this Shabbos."** Title page → this week's parsha → a dated list of 6–16 shiurim in both languages → read a one-liner or two → shiur page → press play.

**"I have forty minutes and want the point of it."** Shiur page → abstract → open it in the listening app for the outline and the write-up.

**"I don't understand Yiddish well."** English edition → any Yiddish shiur → English abstract beside the Yiddish audio. This is the main bridge between the two audiences and it works in the other direction too. The spoken language is always stated in the citation line so nobody is surprised by the audio.

**"Learning Tanya with the shiurim."** Series page → perek → part → previous/next. A plain link list; the browser's visited-link colour is the only progress tracking, and it is enough.

**"Where does he speak about the Bnei Yissaschar on Chanukah?"** Indexes → sources → Bnei Yissaschar → references in order → straight to the minute in the shiur.

**"That story about the Slonimer chassid and the meat."** Stories index (under Slonim or by title), or search.

**Printing.** A shiur page prints as a short catalog card: header, abstract and topics. No player, no navigation.

## 7. Search

One page, reachable from the navigation. With script it loads a compact index and filters as you type; results are a list of shiurim (and sections within them), each showing only catalog and notes text: title, citation line, one-liner, and the matching section title if any.

What is indexed: `titleOriginal`, `heading`, `parsha`, `zman`, year, `oneLiner`, `abstract`, `keyPoints`, section `title` and `summary`, story titles, question text, source `work` and `ref`, people names, concept terms, `candidateTopics`. Every language is indexed in every edition, so a Hebrew term typed in the English edition still finds things.

What is not indexed: any transcript text, and the `heardAs` strings. See decision 1 in §12.

Without script the search page shows the same links as the Indexes page with a sentence explaining that the indexes are the way to look things up. Since the indexes are the primary lookup tool anyway, this is a real fallback rather than an apology.

Spelling is the practical problem: Yiddish and transliterated Hebrew have many spellings (Chanukah/Chanuka/Hanukkah, לג בעומר with and without gershayim). The index should fold punctuation and common transliteration variants. The alias tables built for the sources and people indexes serve here too.

## 8. Languages and directions

- **Interface edition and shiur language are independent.** The edition decides the language of the interface and of the notes. The shiur's language (English or Yiddish) is a property of the recording and is shown in the citation line. Every edition lists all 997 shiurim.
- **Notes in Hebrew are translations.** The pipeline writes the notes in English and Yiddish. The Hebrew edition shows Hebrew translations of them, made as overlays and applied only while they match the current text (integration-plan §2.4, `docs/translation-runbook.md`). A note with no current Hebrew translation is shown in Yiddish, then English, marked with its own language; a write-up is shown in Hebrew only when all of it is translated.
- **Switching edition keeps your place.** The switch on any page offers the same page in each other edition, same anchor.
- **First visit.** The root address offers every edition side by side, the right-to-left ones on the right and English on the left, and remembers nothing unless script is on. No automatic redirect by browser language: many Yiddish readers browse with English-language devices.
- **Direction.** The Yiddish and Hebrew editions are right-to-left throughout: navigation, tables, margin times on the left edge of the column, previous/next reversed. The English edition is left-to-right.
- **Mixed text is the norm, not the exception.** Catalog titles mix scripts within a line ("המקוה והתיבה הם כמו embassy של שמים על הארץ"; "The קדושה of צדיקים and the חשיבות of Learning תורה"), and the English notes are full of transliterated terms. Every catalog title is treated as its own run with its own direction, set by its dominant script, so punctuation and numbers do not jump. Times, daf and pasuk numbers are isolated the same way.
- **Type.** A serious Hebrew text face for Hebrew and Yiddish (with proper Yiddish digraphs and nikud support for the occasional pointed word) and a matching book face for English. Hebrew type is set somewhat larger than the Latin beside it so the two read at equal weight.
- **Numbers and dates.** Years shown as Hebrew years with the civil pair in parentheses. Catalog numbers as printed. Durations and times in ordinary digits in every edition.
- **Voice.** Yiddish notes say "דער משגיח", Hebrew notes "המשגיח", English notes "the Mashgiach"; the interface copy follows the same usage in each edition. Interface wording is heimish and plain in Yiddish (סדר השיעור, מראי מקומות, מעשיות, מפתחות), plain Torah-world Hebrew without nikud (where a Yiddish word is hard to render, the Hebrew word itself), and plain English; no marketing language in any.

## 9. Keeping the transcript out, and leaving the door open

What is treated as transcript and never shipped to a browser, in any file, index or page source:

- `data/transcripts/*.json` segments
- `data/derived/shiurim/<id>/input.txt`
- `heardAs` on sources, concepts and people
- `asrNotes`
- validator output and audit files

The site build reads only: `ingest.json` (shiurim, recordings, series), the manifest, and from each shiur directory `meta.json` (for segment times and `noise` marks, which contain no text), `extraction.json` and `writeup.json` with the fields above stripped. Because times come from `meta.json`, the build has no reason to open a transcript file at all, which makes the rule easy to check: the public output is produced from an allow-list of fields, not by removing a deny-list.

The future door: each recording gets a site-owned eligibility setting, default "not eligible", keyed to the transcript's identity (`model`, `mode`, `transcribedAt` in the transcript file; `config/asr-policy.json` already distinguishes transcription runs the same way). If a better transcription is made and approved for a recording, flipping that setting lets the listening app show its text, and only then does the build read that recording's segments. Approval is per recording and by a person; a new model name alone does not flip it. The same setting would later decide whether that recording's text may enter the search index.

## 10. Growing while the data arrives

- The build takes whatever is in `data/` at that moment. A shiur is "with notes" when its manifest entry is `done` and both `extraction.json` and `writeup.json` are present; otherwise it renders in the pending state. No list of shiurim is maintained by hand.
- Newly committed derived data reaches the site through the deploy that every push to `main` runs. A separate scheduled rebuild of Quiet alone, every second day, keeps the "this week" window on the title page current.
- Indexes are honest about coverage. Each AI-derived index carries one line under its heading: "Compiled from the 518 shiurim that have notes so far, of 997." The catalog-derived pages (contents, calendar, years) are complete from day one and say nothing.
- Addresses never change. They are built from `Shiur.id`, `sectionId`, `Series.id` and normalised parsha/zman names, all of which exist before any AI data does.
- If a shiur is reprocessed (new `promptVersion`), its page simply changes. No version history is shown.
- Expect the character of the site to shift as sets land: today the notes cover parsha and zmanim almost completely, and Tanya, Emunah, Tefilah, Current and Simchos not at all.

## 11. Tone and visual character

A printed catalog from a careful publisher. Paper-coloured background, near-black text, one restrained accent used for links and the "now playing" mark. Rules and small caps (or their Hebrew equivalent, spaced lettering) for labels. Tables with hairlines. No icons where a word will do (the exceptions are the new-tab mark and the sun and moon of the light/dark switch), no photographs in the browsing pages, no cards with shadows, no badges, no counters that animate. The only motion on the site is the audio progress and the margin mark that follows it.

Respect shows in restraint: the Mashgiach's name with its proper titles and זצ"ל on the title page and About, shem Hashem written as the data writes it, and no "content" vocabulary (no "episodes", "tracks", "posts").

Performance is part of the tone. Pages are small, there are no third-party scripts, fonts or embeds, and nothing loads from outside the site except the audio and outbound source links. This also matters practically for readers on filtered connections, where external resources are often blocked.

## 12. Decisions to flag

| # | Decision | Default in this concept |
|---|---|---|
| 1 | May transcript text feed a hidden search index (never displayed)? | **No.** Search covers catalog and notes only. A match on unseen text produces results the reader cannot verify and leaks the transcript's errors into ranking. Revisit per recording when a transcript is approved (§9). |
| 2 | How is audio served publicly? | Open. The repo addresses audio by `Recording.audioKey` in a private R2 bucket with credentials; nothing defines a public address. The concept assumes a public, range-request-capable audio address per recording and a download link. Needs an owner decision on public access and on whether downloads are offered. |
| 3 | Show Pocket Guide rows that have no audio (3 not on disk, 8 not in the bucket)? | Yes, as greyed catalog entries marked "no recording", since a catalog should be complete. Purim seudos (38) are out of scope by the plan and are not listed. |
| 4 | Show AI notes before any human review? | Yes, under the standing label, with the low-confidence cut-off and the error-report link. If the owner prefers, notes can be held back per section until a reviewer signs off; the pending state already handles that. |
| 5 | Link resolved sources out to Sefaria? | Yes for `resolved` only. Alternative: no outbound links at all, references as plain text. |
| 6 | Display `inferred` sources? | Yes, worded as "apparently". Alternative: fold them into "place not identified". |
| 7 | Uncatalogued parsha/zman guesses in the calendar? | Left out until confirmed. |
| 8 | Who writes the About text and supplies the Mashgiach's proper titles? | A person from the community; not generated. |

## 13. Gaps in the data, summarised

- **No frozen taxonomy** (plan P7/P8): no topic tree; concepts index only.
- **No source canonicalisation** (P6): a site-side alias and ordering table is needed for works; a third of mentions are unlocated.
- **No story deduplication or teaching clusters** (P9): repeated tellings listed separately; no "same idea across years" beyond the parsha/zman pages.
- **No series overviews** (P10): series pages are lists.
- **People names not normalised.**
- **Years missing for 386 shiurim**; no dates finer than the year anywhere.
- **Sets, Current and Simchos have no notes yet**; Current and Simchos have only file-name titles.
- **Zman spellings inconsistent** in the catalog; needs a build-time mapping.
- **`reviewStatus` is not present** in the derived files; everything is treated as unreviewed.
- **No public audio address defined.**

None of these block the concept. The catalog pages, shiur pages, calendar, year and sources indexes stand on what exists today; the people, stories and inyanim indexes improve as the corpus-level passes arrive.
