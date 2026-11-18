# Concept A — "Quiet": addendum for the corpus layer

Status: concept only. Addendum to `concept-quiet.md`, written after sampling `data/derived/corpus/` on 15 Nov 2026 (993 done shiurim of 997). Section numbers continue from the original and are prefixed C. Nothing here is code.

## C1. What changes, in one paragraph

The original concept gave the sefer its mafteichos but said three of them were weak: no topic tree, names not merged, repeated stories listed several times, and nothing for "the same idea across the years". The corpus layer fills all four. Quiet's answer stays in character: the new material becomes **the back of the book**. A real מפתח הענינים (207 topics in three levels), a glossary of ערכים (759 concepts with definitions), a properly merged index of names (847) and seforim (545), story entries that list every telling, and an "עיין עוד" cross-reference between shiurim that teach the same thing. There is still no feed, no "related", no tag cloud. Every new page is an index entry: a headword, a short note, and a list of places with times.

One principle is added to the six in §3:

7. **A cross-reference always states its reason.** Two shiurim are linked only because of a named shared thing: a topic, a story, a teaching, a sefer, a person. The site never says "you may also like".

## C2. What was sampled, and what it showed

| Dataset | What is really in it | Verdict for Quiet |
|---|---|---|
| `topics.json` | 17 level-1, 128 level-2, 62 level-3. Level 1 follows the Pocket Guide sections plus thematic gates (אמונה 539 shiurim, גלות וגאולה 553, עבודת השם 636). Smallest leaf 8 (פדיון הבן), largest level-2 ספר בראשית 445. Level 1–2 have a 2–3 sentence description; level 3 has none. Every topic but one (`technology`) has a Hebrew label. | Good enough to be the main new index. Descriptions read well (השגחה פרטית mentions the "Seven Wonders of History" and shidduchim, which matches its hub shiurim). |
| `shiur-tags/` | 8 topics per shiur in most cases, salience 0.2–1.0, plus up to 3 topics per section. For עקבתא דמשיחא: 201 shiurim, of which 80 at salience ≥ 0.6, 83 lower, 38 tagged only on a section. | Salience is the difference between a principal reference and a passing one. It is shown as typography, never as a number. |
| `concepts.json` | 759, none with fewer than 2 shiurim, 164 with fewer than 5. Definitions are 1–2 sentences "as the Mashgiach uses the term" (תיבה: "a holy island built by exact measurements; like the sukkah and the mikveh it is a piece of heaven on earth"). Some are stitched usages, not definitions (`olam-hazeh`). רבונו של עולם is in 428 shiurim. | A glossary, not just an index. Needs a "passim" rule and a way to hide weak definitions. |
| `people.json` | 847: תנ"ך 271, chassidic rebbes 166, acharonim 136, other 129, chazal 109, rishonim 36. 265 appear in one shiur, 126 in two; 24 appear in 100 or more. | Replaces the site's own list. The typed grouping is exactly how a sefer's index of names is arranged. |
| `works.json` | 545; 157 cited in one shiur; 303 with a Sefaria title; 261 with an author link. No category or order field. | Replaces the site's alias table. The site keeps its ordering table. |
| `stories.json` | 1,107 stories from 1,752 tellings. 795 told once, 312 told twice or more, one told 14 times. Merged retellings of 140–770 characters, in reported speech. 262 have no person; 61 names unresolved. | Makes a per-story entry worth having, but only for stories told more than once. |
| `teaching-clusters.json` | 768 clusters over 2,122 insights. 518 join exactly two shiurim; 250 join three or more. 396 contain shiurim in both languages. 449 have at least two dated members. | The missing "across the years" view. Best used as cross-references, with pages only for the larger ones. |
| `series/*.json` | 16 of 17 series. About 240 words of overview, 7–8 key themes, a one-liner per part written in sequence ("A week later, on Pinchas…"). | Fills the slot reserved in §5.3. |
| `search/sections.jsonl` | 8,523 section documents with topics and seconds. | Same unit Quiet already indexes; adds topic ids. |

## C3. Replace, keep, drop

**Replaced by the corpus layer** (the site's own derivations in `@emunas/corpus` aggregate go away):

- The concept list built from raw `concepts[].he` strings, with its stop-list and threshold → `concepts.json`.
- Person keys built by string normalisation → `people.json` and `shiur-tags.personIds`.
- The site-side work alias table → `works.json` and `shiur-tags.sourceWorkIds`.
- Stories grouped by first-named person, one line per telling → `stories.json`.
- `candidateTopics` as search keywords → topic labels and topic `aliases`.

**Kept, untouched.** Everything derived from the catalog: sections, series order, neighbours, calendar, years. The catalog is still the spine and none of it is replaced by a generated entity. In particular the **calendar stays the authority on when a shiur was said**, and the works pages keep their reference-order layout (Bereishis 8:7 → shiur → minute), built as before from each shiur's `sources[]`, now keyed by the corpus work id.

**Kept on the site's side:** the ordering table that sorts works into mafteach order (Torah, Nevi'im, Kesuvim, Shas, Midrash, Zohar, Rishonim, later seforim). The corpus has no such field. Works not in the table fall alphabetically at the end, as now.

**Dropped from the concept:** the statement in §5.4 part 9 that the site shows no AI-derived links between shiurim. It now shows two kinds, under principle 7. And §5.8's "no page per story" is narrowed (C4.5).

## C4. The pages

### C4.1 מפתח הענינים — the topic index (new, the first of the indexes)

**The tree page.** One page holds the whole taxonomy the way the subject index of a sefer does: 17 gates as headings, their topics beneath, third-level topics run in on the same line after a dash. Each entry is the Hebrew term with the count beside it, as an index gives page numbers.

> **אמונה** · 539
> בטחון 80 · השגחה פרטית 120 · הסתר פנים 112 · אמונה פשוטה 97 · ספק ועמלק 133 · נס וטבע 67 · יסודי האמונה 92 · מעשה בראשית 133 · שכר ועונש 57
>
> **גלות וגאולה** · 553
> עקבתא דמשיחא 201 — עבודת הדור האחרון 134, סימני עקבתא דמשיחא 87 · ימות המשיח 181 · נסיונות הדור 87 · …

The Hebrew label is the headword in every edition; the English edition puts "Hashgacha Pratis" beside it and sorts by that. The whole tree prints on three or four sheets, and it is the best single picture of what the Mashgiach spoke about. It deserves a place on the title page as one line: "ענינים: 207".

**A topic page** (example: השגחה פרטית, under אמונה):

1. Headword, its place in the tree ("אמונה › השגחה פרטית"), and "ראה גם" links to parent, children and siblings.
2. The description, as notes: "The Mashgiach teaches that Hashem watches every Jew with hashgacha pratis, hidden everywhere behind nature, rulers and events, and that the Megillah trains a Jew to find Him peeking through the cracks…"
3. **Begin here** (`hubShiurIds`, at most ten): "ועזוז נוראותיך" (תפילה), "The Finger of Hashem in World History; Introducing The Seven Wonders" (Emunah, English), "The Lesson of the מגילה: Find 'ה Peeking Through the Cracks" (Purim תשמ"ט), חיי שרה תש"ס on shidduchim. Catalog titles, citation line, one-liner.
4. **The shiurim, in three grades**, which is how a careful index distinguishes a main treatment from a mention:
   - *The shiur is about this* (salience ≥ 0.6; 40 here). Full rows, set in the heavier weight a printed index gives a principal reference.
   - *Discussed in the shiur* (lower salience; 46). Plain rows.
   - *Touched on in one part* (section-level only; 34). One line each: shiur, then the section title and its time as the link. This is the grade that takes a reader to the minute.
   Within each grade the order is catalog order (section, then number), with language and year stated on each row. Yiddish and English shiurim sit in the same list; nothing pairs them.
5. **Teachings that recur under this topic**: the labels of the larger teaching clusters tagged with it (C4.6).
6. Where a concept shares the topic's id (66 do: הסתר פנים, עקבתא דמשיחא, אור הגנוז, תשובה…), the glossary definition is printed under the headword and the glossary sends the reader here. One inyan, one main entry.

**Gate pages.** A level-1 page, and any topic above about 150 shiurim (ספר בראשית 445, מעשיות 280), is a gateway: description, children with their descriptions, "begin here", and a link to the complete list on a continuation page. Nobody reads a 445-row list to find something; they go down a level.

**Topics and the calendar.** The taxonomy repeats the calendar (ימים טובים וזמנים 727, פרשת השבוע 668), and the two must not compete. The rule is stated on both pages in one line: *the לוח lists what was said on Chanukah; the ענין lists where Chanukah is spoken about.* The data bears this out. Topic חנוכה has 130 shiurim; 61 of them have no zman in the catalog, among them וישלח תשל"ד ("…ושייכות זה לחנוכה"), the Emunah shiur "חנוכה - שורש החקירה מהיונים" and an English shiur on shidduchim. So the calendar page for Chanukah gains one line, "Chanukah is also spoken about in 74 shiurim said at other times → ענינים: חנוכה", and the topic page marks the rows that the catalog places on Chanukah itself. Parsha topics behave the same way toward the parsha index.

### C4.2 ערכים — the glossary (replaces the concept half of the old ענינים index)

In the original, "ענינים" meant concept terms because no taxonomy existed. Now the name ענינים goes to the topic tree, where it belongs, and the concepts become **ערכים**, a glossary.

- **One long page, aleph to tav**, each entry: Hebrew headword, the English or Yiddish gloss from `label`, the definition, and a count. It reads and prints as a kuntres of ערכים. Example entry: **אור הגנוז** "The light of the first day, hidden away for tzaddikim; the Mashgiach, following the Zohar and Baal Shem Tov, says it is hidden in the Torah and shines on Shabbos, Chanukah and in the 'eighth'." · 39 shiurim.
- **An entry page** for terms in five or more shiurim (595 of 759): definition, "well illustrated in" (`exampleRefs`, each a section title with its time), then the shiurim. Terms in 2–4 shiurim have no page; their shiurim are linked directly in the glossary line.
- **Passim.** A term found in more than about one shiur in seven (רבונו של עולם 428, עקבתא דמשיחא 148) is vocabulary. Its entry gives the definition and the word "throughout" in place of a list. עקבתא דמשיחא is also a topic, and the topic page is where its graded list lives.
- **On the shiur page**, the "mentioned in this shiur" line links each term to its entry. In print, the shiur's kuntres ends with a short ערכים box giving the definitions of that shiur's terms (later cut). For the English reader of a Yiddish shiur this is the most useful thing the glossary does.

### C4.3 שמות — the index of names

Arranged as a sefer arranges it: תנ"ך, חז"ל, ראשונים, אחרונים, צדיקי החסידות, then others. Within each group alphabetical by `nameHe`; the Yiddish edition shows `nameYi` ("דער חידושי הרי"ם"), the English `nameEn` with the Hebrew beside it. `aliases` appear as "also: the Sanzer Rav, Rav Chaim of Sanz" and as "ראה" lines in the alphabet, so someone looking under "Sanzer" is sent to the Divrei Chaim.

A person page (example: the Divrei Chaim, 74 shiurim) has, in order: names; **his seforim cited** (works whose `authorPersonId` is this person, linking to the works index); **stories about him** (24, from `stories.people`); then the shiurim. Stories come before the list because for a chassidic rebbe they are what the listener wants.

Passim again: the 24 names in 100 or more shiurim (משה רבינו 485, רש"י 426, the Baal Shem Tov 313) show works and stories on the page and put the full list on a continuation page.

### C4.4 מראי מקומות — works

Unchanged in shape; better in substance. Headword is `titleHe`; the page names the author with a link to his entry in שמות; alias spellings merge automatically; the Sefaria link uses `sefariaIndexTitle`. Of the 86 ids that are both a person and a sefer (Chasam Sofer, Bnei Yissaschar, Or HaChaim), each page carries a one-line pointer to the other, since "the Bnei Yissaschar says" is both.

### C4.5 מעשיות — stories

The original said: no page per story, the retelling lives in the shiur. That stays true for the 795 stories told once. For the 312 told more than once, the entry itself is the news, because it shows something no single shiur page can: **how often and where the Mashgiach came back to it.**

A story page (example: "דער בית אהרן און דעם פריץ'ס צוקער-שליטן", the poretz who had sugar spread on a field in Tammuz to go sledding):

- Title, the people, and the merged retelling, under a label specific to this page: "Retold here from 14 tellings; details differ from one to another. Hear it in the shiur."
- **Where he tells it**: fourteen rows in order of year where known. שונות תשל"ז, ט"ו באב תשל"ח, כי תשא תשמ"א, an English Rosh Hashanah shiur תשס"ג, ניסן תשס"ד, נח תשס"ו, the English talk on the recession תשס"ט, then the undated ones (three Tanya shiurim, תפילה "הקל אב הרחמן"). Each row gives the shiur, the occasion, the language, and the time of the telling. A reader sees at a glance that one mashal served him in Tanya, on Shabbos, on tzedakah and on the Yomim Noraim for thirty years.

On each shiur page the story item gains a line: "told in 13 other shiurim →".

The index page has three parts: **most retold** (the 80 stories with four or more tellings), **by person** in the same groups as שמות (Baal Shem Tov 52, Satmar Rav 37, Baal HaTanya 31, Chofetz Chaim 28, Maggid of Mezritch 28), and **without a name** (262, alphabetical by title: "Shabbos for the challah", "The rosh yeshivah and the cook").

### C4.6 עיין עוד — recurring teachings

Teaching clusters are the most original thing in the data and the easiest to overplay. Quiet uses them the way a sefer uses "עיין": a short pointer from one place to another.

- **On the shiur page**, an insight that belongs to a cluster gets one line under it. For the two-shiur clusters (518 of 768) that is the entire feature: "עיין: Tanya (English) no. 19", with the time. Example: the Yiddish Tanya shiur's point that permitted pleasure leaves a stain that needs washing points to the English Tanya shiur that uses the same mashal with a mattress. They are two separate shiurim that share a teaching, and the line says only that.
- **A teaching page** exists for clusters spanning three or more shiurim (250). Example: "לחם איז דריי מאל הוי"ה, מצה דריי מאל דעם שם במילוי", twelve places from ניסן תשנ"ב to תשע"א, eight English and four Yiddish. The page gives the label, the summary ("…the tellings draw different lessons from the 45: that it is 'Mah'… that it is 'adam'… or that it is 'geulah'"), and the places in order of year, each linking to the minute. Another: at the Akeidah Avraham was lowered into the state of the last generation, eight places, תשמ"א–תשס"ט.
- **Where they are listed:** on topic pages (C4.1 part 5) and on a plain index, "חזרות / Teachings the Mashgiach returned to", grouped by the 17 gates. There is no ranking by size beyond putting the larger ones first within a gate.

### C4.7 Series pages

The reserved introduction slot (§5.3) is filled. The catalog name stays the page title ("תניא"); the generated title becomes a subtitle inside the notes area ("The Two Souls, the Beinoni and the Hidden Love"), because it is the AI's wording and not the guide's. Then the overview, the key themes as a short list, and the table of parts, where each row's line is now the `arc` one-liner. Those were written in sequence and read like a syllabus: "Starting the sefer itself, the Mashgiach introduces its author and the first question of chapter one…".

The summer תשע"א set shows what this adds to a series that was only file names: "twenty-five talks from Shabbos Balak through the Three Weeks into Elul… several given at holy places in Eretz Yisrael: the resting place of Shimon HaTzaddik, Kever Rochel…". The page prints as a course outline.

A part without notes (`yi-tanya-2-17`, needs review) keeps its row and number with "notes not prepared yet". The series with no synthesis (`shabbos-tefilah-en`) stays a plain list.

### C4.8 The shiur page

The shiur page keeps one line from the corpus layer (concept-quiet §5.4 has the whole page):

- **Under the abstract, one line of ענינים**: the shiur's topics with salience of 0.6 or more, at most five, as links. For נח תשמ"ג ("המקוה והתיבה הם כמו embassy של שמים על הארץ") that is טומאה וטהרה, נח והמבול. The weaker tags (סוכות, חמץ, ליל הסדר on that shiur) are not shown here; they exist to put the shiur in the third grade of those topic pages. Section-level topics are not printed in the outline. They are too many and too fine to read.
- **Previous and next** stay catalog-only: no generated neighbour is mixed into them.

## C5. Navigation

The main navigation line does not change: **Contents · Calendar · Indexes · Search · About**. The Indexes page is re-ordered and reads like the contents of the back matter:

| מפתח | What it is | Source |
|---|---|---|
| ענינים | the topic tree | corpus, new |
| ערכים | glossary of terms | corpus, replaces old concept index |
| שמות | names, by era | corpus, replaces |
| מראי מקומות | seforim, by reference | extraction + corpus ids |
| מעשיות | stories | corpus, replaces |
| חזרות | recurring teachings | corpus, new (second cut) |
| לוח · שנים | calendar and years | catalog, unchanged |

Addresses: topics take the `inyanim` address, since that is what the word means; concept entries move under a glossary address. Every address is built from the corpus id, which the contract promises is stable. The build writes redirects from the old site-derived concept, person and work addresses, matched through the alias maps. Published links should not break.

**Search.** The index gains one thing and one behaviour. The thing: synonyms from topic `aliases`, concept `transliterations`, person and work `aliases`, which largely solves the spelling problem in §7 (Chidushei/Chiddushei HaRim, Sanzer Rav/Divrei Chaim). The behaviour: when the query matches a headword, the first result is the index entry itself ("ענין: השגחה פרטית · 120 shiurim"), then shiurim and sections. With script off, the search page still points to the indexes, which are now much better at the job.

## C6. Quality handling

**Who gets a page.** A long tail belongs in an index; it does not need a page each.

| Entity | Listed in its index | Own page |
|---|---|---|
| Topic | all 207 | all (gateway layout above ~150 shiurim) |
| Concept | all 759, with definition | 5 or more shiurim; "throughout" above about one shiur in seven |
| Person | all, except type `other` with fewer than 3 shiurim | 3 or more shiurim (about 455). One or two mentions: the index line links straight to the shiur |
| Work | all | 2 or more shiurim, as today; never generic labels ("Midrash", "Talmud Bavli") |
| Story | all 1,107 | 2 or more tellings (312) |
| Teaching | 3 or more shiurim (250) | same; two-shiur clusters are cross-reference lines only |

Thresholds are counted at build time from what exists, after the confidence filter, so entries gain pages as the data grows.

**Filters applied before anything is counted.**
- A telling or cluster member whose underlying story or insight has confidence below 0.6 is dropped; a cluster left with one shiur disappears.
- Sections of kind `other_speaker` never appear on a topic or entity page, and a shiur made up of them is never a "begin here" shiur. This matters today: the hub of `technology` includes "Mamed Technology 02 R'Tauber" and "03 R'Langer", whose own notes say "not by the Mashgiach".
- Type `other` people with one or two mentions are not listed at all. That group is where the private individuals and passing politicians are (`r-langer`, `hillel-zaks`, `al-gore`, `hosni-mubarak`). Hitler, Napoleon and Alexander stay as index lines.
- A name in a story that did not resolve to a person id is printed as plain text, not linked.

**The label.** Same approach as the shiur page: once per page, plain, no badges on items.
- Under the heading of each generated index: "Compiled by AI from the notes on 993 shiurim. Not reviewed by a person; entries may be wrongly joined or split."
- At the foot of each entity page: "Notes prepared by AI; not reviewed. The recordings are the source." and beside it **"Report an error in this entry"**.
- When an entity carries `reviewStatus: "reviewed"`, its page drops the "not reviewed" clause. Nothing else changes, and no "verified" mark is added.

**Reporting.** The link is pre-filled with the kind and id of the entry and offers the three things that actually go wrong: "these are two different people or stories", "this is the same as another entry", "this shiur does not belong here". It is a mail link, as on the shiur page; where the feedback API is reachable it can also be a plain form that posts without script. For an unreviewed corpus this is the review queue.

**When an entry is wrong.** The site corrects nothing by hand. A wrong merge is fixed upstream and the next build follows. For that to be safe the site needs the pipeline to say where a retired id went (C8).

**No transcript.** Fields in the new files that can carry transcript wording, and how each is handled:

| Field | Handling |
|---|---|
| `asrVariants` on concepts, people, works | Raw `heardAs` strings. Never read by the public build, never in the search index, whatever the contract says about "search expansion". One of them is a first-person phrase about the Mashgiach's father. |
| `*-alias-map.json` | Mixed: of 16,093 concept alias keys, 15,102 are ASR variants. The build uses only keys that also appear in `aliases`, `transliterations` or a canonical name; everything else is discarded. |
| `corpus/raw/**` | Internal (contains `heardAs`). Never opened. |
| `search/sections.jsonl` `startSeg`, `endSeg` | Not text, but not published; seconds only. |
| Story `retelling`, cluster `summary`, topic `description`, concept `definition`, series text | Generated, reported speech. Published under the notes label, set without quotation styling, and passed through the verbatim scanner like the write-ups. |
| Topic `aliases` | Generated English phrases. Used as search synonyms; not displayed. |

The public build continues to work from an allow-list of fields.

## C7. Priorities

**First cut** (replaces weaker pages that already exist, low risk):
1. Swap people, works and concepts to the merged entities, with the thresholds, the passim rule and redirects.
2. The topic tree and topic pages with the three grades; the calendar cross-line.
3. Series introductions and arc lines.
4. Story pages for stories told more than once; "told in N other shiurim" on shiur pages; the new stories index.
5. The ענינים line on the shiur page; entity links by id; labels and report links; search synonyms and headword results.

**Second cut:**
6. "עיין" lines for teaching clusters on shiur pages, then teaching pages and the חזרות index. Held back one step because their summaries need the fixes in C8 first.
7. The printed ערכים box on shiur pages; "print this inyan" (a topic page that prints as a study sheet: description, begin-here shiurim with abstracts, recurring teachings).
8. Stories and teachings listed by topic on gateway pages.

**Later:** review status shown per index ("312 of 847 names reviewed"), once anyone reviews.

## C8. To send back to the data pipeline

Ordered by how much they limit the site.

1. **ASR text in public-facing files.** `asrVariants` and the alias maps put `heardAs` strings beside legitimate aliases, and the contract invites using them for search. Please split the alias maps into publishable aliases and internal ASR variants, or flag each key.
2. **Yiddish voice is inconsistent.** Topic descriptions and cluster summaries say "דער רב" (133 and 769 times; "דער משגיח" once and never). Concept definitions say "דער משגיח" (112, never "דער רב"). Stories mix them (698 against 178). The per-shiur notes say "דער משגיח". One usage, please. (Resolved upstream: "דער משגיח" in Yiddish and "the Mashgiach" in English throughout.)
3. **Cluster summaries bake in things that go stale or mislead.** Counts in prose ("in five shiurim") will be wrong after the next batch. "The English telling… the Yiddish one adds…" reads as if one were a version of the other; they are separate shiurim and the wording should say "one shiur… another".
4. **No tombstones.** Ids are promised stable, but duplicates will be merged (the audit already lists the baseball and four-kings stories). The site needs a `mergedInto` record for retired ids so old addresses redirect.
5. **Other speakers.** Shiurim and sections by another speaker are tagged, clustered and chosen as hub shiurim like any other. A shiur-level flag would be cleaner than inferring it from section kinds.
6. **People.**
   - `rav` (the Amora, 15 shiurim) was probably polluted by references to the Mashgiach (which the data then wrote as "the Rav").
   - Compound entries: `chaggai-zechariah-malachi`, `shem-and-yefes`, `four-malachim`, and `kamtza-and-bar-kamtza` beside `kamtza` and `bar-kamtza`.
   - `moshiach` and `kohen-gadol` are roles, not people.
   - `belzer-rav` is ambiguous across the five named Belzer Rebbes.
   - The sugar-sled story lists both `beis-aharon` and `rabbi-aharon-of-karlin`, who are different people.
   - Type `other` mixes malachim, historical figures and private individuals; a `private` or `contemporary` marker would let the site decide properly.
   - The Mashgiach's own family (`eliyahu-shalom-wolfson`, a father-in-law in a story title) needs an owner decision on whether they are index entries.
7. **Works.**
   - No category or order field.
   - Rashi is split into `rashi` (467 shiurim) and fourteen `rashi-on-…` works.
   - Generic `midrash` (471) and `talmud-bavli` (235) are entities.
   - 86 ids are shared between a person and his sefer with no explicit link beyond `authorPersonId` (set on 261 of 545).
8. **Topics.**
   - `technology` has no Hebrew label.
   - The parsha gate is lopsided (ספר בראשית 445 of 993 shiurim, ויקרא 29), which suggests any mention of the Avos is tagged; `maasios` at 280 is likewise a catch-all.
   - Hub lists take the top ten by salience with arbitrary ties, so one event in three parts can fill three slots.
   - 66 topics share an id with a concept and 9 with a person, but nothing in the data links them; an explicit `conceptId` on the topic would remove guesswork.
   - Level-3 topics have no description.
9. **Stories.**
   - A merged retelling picks one attribution where tellings differ: the same story is "the Slonimer chassid" in two shiurim and "the talmid of Lechovitch" in the merged entry. A short `variants` note would let the page say so.
   - 262 stories have no person and 61 names are unresolved.
10. **Concepts.**
    - Vocabulary-level terms (רבונו של עולם in 428 shiurim) could carry a flag instead of the site guessing by frequency.
    - Stitched definitions and the 23 with no `exampleRefs`, as the audit says.
11. **Series.** `shabbos-tefilah-en` (8 shiurim) has no synthesis and its shiurim are not in the manifest. Generated series titles are editorial; fine as subtitles, but they should not drift between runs.

## C9. Decisions to flag (continuing §12)

| # | Decision | Default here |
|---|---|---|
| 9 | Show merged story retellings as standalone entries? | Yes, only for stories told twice or more, with the "retold from N tellings" label. |
| 10 | Show AI-derived links between shiurim? | Yes, only with a stated reason (shared story or teaching). |
| 11 | List non-Jewish and contemporary figures in שמות? | Lines only, from three shiurim up; no private individuals. Owner may prefer to drop the group. |
| 12 | The Mashgiach's family members as index entries? | Not until the owner says so. |
| 13 | Rename the concept index from ענינים to ערכים and give ענינים to topics? | Yes, with redirects. |
