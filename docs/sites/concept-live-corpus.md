# Concept B — "Live": addendum for the corpus-wide layer

Status: concept addendum to `concept-live.md`, written 2026-11-15 after the corpus layer landed in `data/derived/corpus/` (contract: `docs/corpus-data.md`, types: `src/corpus-types.ts`). Nothing here is built. Section numbers prefixed "§" refer to the original concept. Figures are from the files as sampled today: 993 done shiurim, 207 topics, 759 concepts, 847 people, 545 works, 1,107 stories, 768 teaching clusters, 16 series syntheses, 8,523 section documents.

## A. What changes, in one paragraph

The original concept promised "ten thousand addressable moments" and then had to admit that the ways of arriving at one were weak: no taxonomy, unmerged names, undeduplicated stories, and "same idea elsewhere" guessed from embeddings. The corpus layer fills each of those holes. Live's response is to add **one new kind of object and one new kind of playback**, and to rebuild four existing destinations on the merged data.

- The new object is the **thread**: a teaching cluster shown as one idea that the Rav returned to across shiurim and years, playable end to end.
- The new playback is the **mix**: because every section now carries up to three topics, any topic, or any two topics together, can be played as a sequence of moments drawn from many shiurim.
- Explore, Maasios, Seforim and the entity pages are rebuilt on the merged entities. The site's own derived concept, person and work pages, its alias table and its embedding-based story grouping are retired.

Division of labour with Quiet: Quiet prints the taxonomy, glossary and indexes as a reference a reader can scan. Live does not reproduce those as long lists. In Live every corpus entity is a place you *play from*. If a view of the new data has no play button on it, it belongs in Quiet.

The three visits from §1 still decide what gets built. Topics and mixes serve the calendar and "something on X" visit. Threads, merged stories and the glossary serve the recall visit. Series syntheses serve the course visit.

## B. Dataset by dataset

| Dataset | What it gives Live | What it replaces |
|---|---|---|
| `topics.json` + `shiur-tags` | The topic map as the front of Explore; topic pages; section-level topic chips; mixes; a topic facet and a topic-over-years view | The gap in §3 ("no frozen taxonomy"); `candidateTopics` is no longer used anywhere |
| `teaching-clusters.json` | Threads; "he returns to this" on insights; content-bearing edges for the Connections lens | Embedding neighbours as the primary "same idea elsewhere" (§8). Embeddings stay as a labelled fallback for the 3,760 of 5,882 insights that are in no cluster |
| `stories.json` | One card per story with all its tellings; a telling switcher; stories-only play without repeats | The per-shiur story list in §5.5 and the "possibly the same story" grouping |
| `people.json`, `works.json`, `concepts.json` + alias maps | Merged entity pages; a typed People index; glossary cards with playable examples; `sourceWorkIds` for the Seforim shelf | The site's aggregate entities in `@emunas/corpus` and the site-owned alias table (§3, §8, decision 7) |
| `series/<id>.json` | Overview, key themes and a position-aware arc on series pages; "where am I in the course" in the dock | The gap in §5.6 |
| `search/sections.jsonl` | Topic and concept filters on section hits; entity results in the command bar | Nothing; it is merged into the existing search rows |

**Answer to the replace question: yes, replace.** A person page built from the string "Dovid HaMelech" next to another built from "David HaMelech" is worse than no page. The merged `people.json`, `works.json` and `concepts.json` become the only source for entity pages, facets and chips. Existing `/p/`, `/c/` and work URLs redirect to the merged id (the alias maps give the old string to new id mapping at build time). The site keeps deriving only what the corpus layer does not supply: occasions from the catalog, the year histogram, co-occurrence counts, and all timestamps.

## C. New views

### C.1 Threads ("he returns to this")

A thread is a teaching cluster given a page and a player. It is the feature that most justifies Live existing alongside Quiet, because its point is hearing the same idea said in 5741 and again in 5769.

**The thread page.** At the top, the cluster label and summary. The summaries are written to compare the members, and that is what makes them useful. Example, `zmanim-pesach-lechem-matzah-gematria` (12 members, 5752 to 5771, English and Yiddish): the summary says lechem is three times the Name Havayah and matzah three times the Name spelled in full, then lists how the shiurim draw different lessons from the number 45: that it is "Mah", a holiness one can only ask about, which is why the Seder opens with questions; that it is "adam"; that it is "geulah". Under the summary, the members sit on a vertical line ordered by Hebrew year, with an "undated" group at the bottom. Each member row shows the year, the audio language, the shiur's catalog title as written, the section the insight sits in, and the per-shiur insight text. Tapping a row plays that insight's moment. "Play the thread" queues every member in year order.

Other threads opened while writing this, as a check that the feature holds up on real data:

- `parsha-akeidah-last-generation`, "At the Akeidah Avraham was lowered into the state of the last generation": 8 members, 5741 to 5769, bridging the topics Akeidah, ikvesa dimeshicha and hester panim.
- `hester-panim-megillah-and-the-news`, "The Megillah's 'gossip' and today's news": 7 members.
- `avodas-hashem-summer-travel-repairs-meraglim`, "Summer travel repairs the meraglim's journey": 8 members, 5738 to 5762.
- `zmanim-yom-tov-returns-each-year`, "A Yom Tov is a real return, not a commemoration": 8 members, 5739 to 5769.

**Thresholds.** Of 768 clusters, 518 span only two shiurim. Those do not get a page. They appear only where they are useful: on the insight itself in the listening room, as one line, "also taught in <shiur>, <year>", with a play button. The 250 clusters spanning three or more shiurim get thread pages. Only clusters with at least three *dated* members (186 today) show the year line as a timeline; the rest are shown as a plain list, because a timeline with one dot on it says nothing.

**Language.** 396 clusters contain shiurim in both languages. That is allowed and is shown plainly: each member carries its audio-language mark, and play-all respects the listener's shiur-language filter with a note when members were left out ("3 more in Yiddish"). 56 clusters consist of exactly one English and one Yiddish Tanya shiur. These are two parallel courses reaching the same point. They are shown as any other two-member cluster, at the level of the insight. They are never rendered as "this shiur's counterpart", and no shiur page says another shiur is its other-language version. See F.1 for what this retracts from the original concept.

**Wording.** A thread is headed "A teaching the Rav returns to" with the standard AI label. It never claims the wording is the same across members, and never says "the Rav always says".

### C.2 The topic map and topic pages

**The map.** Explore now opens on the taxonomy instead of on a facet column. The 17 level-1 topics are shown as large tiles with their counts: Yomim Tovim and Zmanim (727 shiurim), Parshas HaShavua (668), Avodas Hashem (636), Galus and Geulah (553), Emunah (539), Tzaddikim and Maasios (488), Tanya and Chassidus (481), and so on down to Shabbos Kodesh (181). Tapping a tile opens it in place to show its level-2 children; Emunah opens to Bitachon (80), Hashgacha Pratis (120), Hester Panim and Suffering (112), Simple Emunah, Above Reason (97), Doubts in Emunah and Amalek (133), Miracles and Nature (67) and four more. Labels are shown in the interface language with the loshon-hakodesh name beside them (`label.he`), since many listeners know the topic by that name. The facet column, lenses and result list from §5.2 are one tap behind the map and are unchanged in behaviour.

**A topic page** has, in order:

1. Label, Hebrew name, breadcrumb, the generated description, AI label.
2. **Play this topic.** The mix, described in C.3.
3. **Start here.** The `hubShiurIds` (ten per topic) as shiur cards. For Hester Panim these come from the English Emunah and Tefilah series, a Purim shiur and several Yiddish ones.
4. **Threads in this topic.** Clusters whose `topicIds` include it. Hester Panim has 21, among them "Hiding within hiding" (5 members), "Nisan and Adar: revealed miracles and cloaked ones" (6) and "The Kotzker's reply: believing is greater than seeing" (2, shown as a line and not a link to a page).
5. **Stories told here.** Stories with a telling that falls inside a section tagged with the topic (a build-time join through timestamps).
6. **All shiurim**, ordered by salience, then by year. Shiurim that carry the topic only at section level (salience 0.05) are grouped under "touched on in" and each links straight to the tagged section, not to the start of the shiur.
7. **Over the years.** The same year strip as the Years lens, for this topic alone, with the undated count stated.
8. Sub-topics and "often together with", the latter computed from section co-tagging.

**Topics that are also the calendar.** The taxonomy has its own Purim (103), Megillas Esther (106), Sefiras HaOmer (82), Zos Chanukah (41) and so on, and the catalog has its own `zman` and `parsha`. Live does not show two Purim pages. The occasion page from §5.7 remains the page for anything on the calendar, with the catalog rows as its skeleton, and the matching topic is folded into it as a second group: "also spoken about in other shiurim". That group is the new value: a Tanya shiur whose fourth section turns to Purim was invisible to the catalog and is now one tap from the Purim page. The Luach lens gains stops the catalog never had, taken from level-3 topics: Shovavim (24), Purim Katan and the Leap Year (32), The Four Parshiyos (30), Tu B'Av and the Weeks of Nechamah (22). The topic to occasion mapping must come from the data, not from a table in the site; see H.4.

**Topics that are also glossary terms or people.** 66 concept ids equal a topic id (`hester-panim`, `bitachon`, `ikvesa-dimeshicha`) and 9 topic ids equal a person id (`avraham-avinu`, `moshe-rabbeinu`). Rule: where a topic and a concept share an id or a Hebrew name, there is one page, the topic page, and the concept's definition is shown at its head as "the term". `/c/hester-panim` redirects to it. A topic and a person stay two pages (a person page is about mentions and stories; the topic is about the subject) with a link between them.

### C.3 Mixes

A mix is a generated queue of *sections*, not shiurim. It uses the moment queue from §6.2 unchanged.

- **Topic mix.** From a topic page: the sections tagged with that topic, best first (sections from high-salience shiurim, `main` and `story` kinds only, the listener's language filter applied, one section per shiur until the pool runs out). The header says what it is: "Hester Panim: 173 sections from 112 shiurim. Playing 12, about 50 minutes." Each item plays to the end of its section and offers "keep listening to this shiur", as before.
- **Two-topic mix.** Pick a second topic and the mix narrows to sections tagged with both. This is the original concept's example, "everything on hester panim around Purim", which could not be built then. Today it is 19 sections where Hester Panim meets Purim or Megillas Esther. When an intersection has fewer than three sections the control says so and offers the shiur-level intersection.
- **Occasion mix.** On Today, "This week" gains a single button that plays a mix for the current parsha or zman, drawn from both the catalog's shiurim and the topic's section tags. This is the thirty-seconds-to-audio path for the Thursday night visit.

A mix is always labelled as assembled automatically from AI tags. It is saved or shared as an ordinary playlist link, so what a listener shares is a fixed list of moments and does not shift when the data is rebuilt.

### C.4 Maasios, rebuilt

The library is now 1,107 stories, of which 312 are told in more than one shiur and 156 are told in both languages.

**Story card.** Title, people, the merged retelling, and a count: "told 14 times". The play button plays one telling, chosen by the listener's language filter, then catalogued over uncatalogued, then confidence.

**Story page with a telling switcher.** The page lists every telling with year, language, shiur title and the *title of the section it sits in*. That last item is the interesting one: it shows what the Rav used the story for each time. The most-told story in the corpus, `the-beis-aharon-and-the-poretzs-sugar-sled` (the poretz who rode a sleigh over a field of sugar in Tammuz, and the Beis Aharon's answer about the pleasure of saying Nishmas on Shabbos), is told 14 times: in parsha shiurim on Noach and Ki Sisa, on Rosh Hashanah, in Nissan, on Tu B'Av, three times in the Yiddish Tanya course, once in the English one, and in the Tefilah series. A listener can hear it in Yiddish from one decade and in English from another. Other pages opened: `the-informers-kvittel-and-the-chozeh-of-lublin` (9 tellings), `the-yismach-moshe-eats-the-dish-rag` (8), `the-chofetz-chaims-drasha-about-the-mississippi-flood` (7, all Yiddish), `ten-years-of-learning-for-a-cat` (2).

The merged retelling is shown once at the top. Each telling can also show its own per-shiur retelling from the extraction, collapsed, because tellings differ in detail and the merged text hides that.

**Stories-only mode** from §5.5 now skips stories already heard in the session and never plays two tellings of one story back to back.

**Facets.** By person, now on merged ids: the Baal Shem Tov (52 stories), the Satmar Rav (37), the Chozeh of Lublin (13). By topic, through the section join. By "told more than once", which is a good proxy for the stories people remember.

**People on stories.** `people[]` mixes person ids with 52 raw names ("Reb Mendel", "Mr. Singer", "Shlomo the gabbai"). Raw names are shown as plain text and are never links, facets or search suggestions. 262 stories name nobody and simply show no people row.

Single-telling stories (795) do not get a prerendered page; the card expands in place and the canonical link is the moment in the shiur.

### C.5 People, works, concepts

**People index.** `Person.type` gives the index a shape it lacked: Tanach (271), Chazal (109), Rishonim (36), Acharonim (136), Chassidic Rebbes (166). Each is a shelf ordered by count; Moshe Rabbeinu (485 shiurim), Rashi (426), Avraham Avinu (408), the Baal Shem Tov (313), the Chasam Sofer (295) lead theirs. The person page keeps the three groups from §5.7 (cited as a source, appears in stories, discussed) and gains two things: the stories tab now lists merged stories, and where `Work.authorPersonId` points at the person the page shows "his sefer" with a link to the shelf (87 works share an id with their author, such as `bnei-yissaschar`, `chasam-sofer`, `or-hachaim`). Names are shown as the data gives them, `nameHe`, `nameEn`, `nameYi`, with `aliases` under "also called".

**Glossary cards.** Concepts now have definitions, so every concept chip anywhere in the app opens a small card instead of navigating: the Hebrew term, the gloss, the definition, and up to three **"hear it explained"** buttons from `exampleRefs`, each playing a section. For צמצום the card reads "The contraction of Hashem's infinite light so creation can receive it; the Rav explains it as din that makes chesed receivable", with examples from the Yiddish Tanya and an English Lag BaOmer shiur. The card is headed "as the term is used in these shiurim" so nobody takes it for a dictionary. "All shiurim with this term" leads to the concept page. The listening room gets a "Terms in this shiur" strip (median nine concepts per shiur). Live does not auto-link words inside the write-up text: concepts are tagged per shiur, not per sentence, and string matching in Hebrew and Yiddish would mislink.

**Seforim.** The shelf is rebuilt on merged works through `sourceWorkIds`, which removes the "Likutei Amarim" versus "Tanya" split. `sefariaIndexTitle` (present on 303 works) decides whether a work offers a Sefaria link at all. The pasuk and kapitel views from §5.4 are unchanged; they still depend on per-source refs in the extraction. The 11% of sources with no work stay listed on the shiur's Sources tab as unlocated and are not shelved.

### C.6 Series as a course map

Sixteen of seventeen series now have a synthesis. The series page opens with the generated title and overview. For the Yiddish Tanya the overview walks from the oath in chapter one, through the two souls and the beinoni, to the hidden love of chapters 18 and 19, which it names as his signature teaching. `keyThemes` appear as a short list under it (plain text; they are not topic ids and are not linked). The ordered path uses `arc[].oneLiner`, which is written with position in mind ("The series opens with emunah as the foundation of all the mitzvos…"), in place of the standalone `summary.oneLiner`.

Two interactive additions:

- **Position in the dock.** While a series part is playing, the expanded dock shows "part 14 of 63" with the arc lines for the previous, current and next parts, so a listener in the car knows where the course is going and what comes next.
- **Tanya by section.** The taxonomy has level-3 topics that divide the Tanya: The Two Souls (ch. 1-8), Tzaddik, Beinoni and Rasha (ch. 9-17), Ahavah Mesuteres (ch. 18-25), Simcha and Lowliness (ch. 26-34). The perek view in §5.6 groups by these, and under each group lists the Yiddish course's parts and the English course's parts as two separate columns.

Short "current" series (the summer of 5771, the bachurim talks) get the same page; their overviews read as a record of a season ("from Shabbos Balak through the Three Weeks into Elul, several given at holy places in Eretz Yisrael") and remain subject to original decision 6 on visibility.

## D. Changes to existing views

**Listening room (§5.3).**

- Header: the shiur's top three topics by salience (0.5 and above) as a breadcrumb line.
- Chapters: each section shows its topic chips. Tapping one opens the topic page in the side pane on desktop, or a sheet on a phone, with the audio continuing.
- Insights tab: an insight that belongs to a cluster carries a thread mark, "taught in 7 other shiurim, 5748 to 5769", which opens the thread.
- Stories tab: "told in 13 other shiurim", which opens the story page.
- Sources tab: grouped by merged work.
- Related tab, rebuilt in this order: threads that pass through this shiur; the shiur's main topics with "more on this"; other years of the same parsha or zman; then embedding neighbours, labelled "similar, suggested automatically". The "counterpart in the other language" item is removed.
- When a shiur ends: next part if it is in a series; otherwise "continue a thread from this shiur" or "more on <top topic>". Nothing auto-plays across shiurim without the listener choosing it.

**Today (§5.1).** "This week" gains the occasion mix button and the "also spoken about" group. "A moment for today" is now drawn from threads and multi-telling stories tied to the current occasion's topic, which are better candidates than a single insight picked blind, because recurrence is evidence that the item mattered. Eligibility for this slot is restricted; see E.5.

**Explore (§5.2).** The facet column gains Topic (a three-level picker) and replaces the free-string person, concept and sefer facets with merged ids. Concepts tagged on more than a quarter of all shiurim are dropped from the facet list by rule (`ribono-shel-olam` is on 428 of 993 and filters nothing). The Years lens works on a topic: select Ikvesa DiMeshicha (201 shiurim) and see when he spoke about it. In moments mode, "thread" and "story (all tellings)" are new result kinds.

**Connections lens.** The original design drew edges from co-occurrence counts and was parked last. Threads give better edges, because a cluster with several `topicIds` is a stated link with content behind it: from Akeidah there is an edge to Ikvesa DiMeshicha, and the edge *is* the thread "At the Akeidah Avraham was lowered into the state of the last generation". The lens is redefined as: one topic at the centre, neighbouring topics around it, and each edge opens the list of threads that join the two. It stays one centre, one hop, and stays in the later tier.

**Search and the command bar (§8).** As-you-type suggestions now come from merged entities, grouped and capped: a topic first, then the glossary term, then people and seforim, then threads and stories, then moments. Typing "hester" offers the topic Hester Panim and Suffering, three threads and the story count before any full search runs. Section hits can be filtered by topic. Threads and merged stories are indexed as documents of their own (label and summary; title and retelling). Topic `aliases` and the clean alias maps (people, works, topics) expand queries. Result grouping, ranking and "which field matched" stay as they were.

## E. Quality, thresholds and trust

### E.1 Who gets a page

Counts are recomputed by the site from the shiurim it actually shows, never read from `shiurCount` or `shiurIds.length`, so that the four needs_review shiurim and anything held back under original decision 6 cannot leak into counts, hubs, mixes or threads.

| Entity | Page and prerender | Below the line |
|---|---|---|
| Topic | All 207 (minimum in the data is 8 shiurim) | n/a |
| Thread | 3 or more distinct shiurim (250) | 2 shiurim (518): a line on the insight only |
| Story | 2 or more tellings (312) | 1 telling (795): expanding card, link goes to the moment |
| Person | 3 or more shiurim (456), and type is not `other` | 1 or 2 shiurim (391): the chip opens a small list of those shiurim; no page, not in the index, not in search suggestions |
| Concept | 3 or more shiurim (741) and not merged into a topic page | Glossary card only |
| Work | 3 or more shiurim (325) | A collapsed "cited once or twice" row at the end of its shelf |

**People of type `other`** need their own rule. The 129 include the Chashmonaim and the angel Michael, but also Hitler (18 shiurim), Stalin, Trotsky, Vladimir Putin, Osama bin Laden, Al Gore and a number of private individuals mentioned once (`r-langer`, `professor-branover`, `rabbi-mordechai-finkelman`). A site about the Rav should not have a "Vladimir Putin" page listing shiurim. No `other` person gets a page, an index entry or a suggestion. They remain plain text inside the story or section where they occur. This is a blunt rule and loses the Chashmonaim; H.6 asks the pipeline for a finer type so it can be relaxed.

### E.2 Thin and noisy content

- A topic description that is null (all 62 level-3 topics today) is simply absent; the label stands alone.
- Concepts with no `exampleRefs` (23) show a card with no play buttons.
- Overlapping sibling topics (`avodas-hashem/simcha` and `tanya-simcha`; `kedushah`, `tumah-taharah`, `kedushah-vekelipah`) are not merged by the site. "Often together with" is computed from section co-tagging, which surfaces the overlap to the listener as a link.
- Suspected duplicates the pipeline did not merge (the two baseball-game stories; the two tellings of Avraham and the four kings) are not merged by the site either. The embedding-based "possibly the same story" row survives only as a suggestion on a story page, capped at three, with a one-tap "these are the same" report.
- A two-member thread never appears as a headline anywhere.

### E.3 The label

The constant label from §2 covers the new layer with one added sentence on entity pages: "Grouped and named by AI across all the shiurim. Not reviewed by a person." It sits once per page, under the title, in the same small style. It is not repeated per card. `reviewStatus` is read on every entity; when one becomes `reviewed` the sentence changes to "Reviewed" for that entity alone, with no other change, so the label disappears gradually as review happens and nothing has to be redesigned.

### E.4 Reporting

"Something's wrong here" (§9) gains report types that only exist for merged things, because a merge is a claim a per-shiur item never made:

- This does not belong here (a member of a thread, a telling of a story, a shiur on a topic). The report targets the join, `cluster id + member`, which is exactly what the pipeline needs.
- These are the same (two stories, two people, two threads).
- Two different things were merged (the Belzer Rav page is the obvious candidate).
- Wrong name, wrong type, wrong definition.

Stable slugs make each report a precise pointer. Reports still change nothing on the site; they are a queue for the pipeline owner, and in practice they are the first human review this layer will get.

### E.5 What may be featured

Threads and stories are recurrence-ranked, so the app will tend to promote them. Some of what recurs is hard material stated in a compressed, unreviewed summary: clusters such as "A gentile is entirely orlah" and "Place, time and soul: Nittel as impurity's time", stories mentioning Arabs (28) and Lubavitch (7), and topics such as Yisroel and the Nations (135 shiurim). These are part of the shiurim and stay reachable and searchable. But an unreviewed one-line summary of such a teaching should not be what Today pushes at a first-time visitor, nor the text of a share preview. Proposal: the featured slots (Today's moment, the occasion mix's first item, share-preview descriptions for threads) draw only from entities whose topics are outside an owner-controlled list of topic ids. That list is policy configuration, not content curation, and is a decision for the owner (G.3).

## F. Rules restated for the new files

### F.1 Languages

The owner's rule is that a Yiddish shiur and an English shiur are never translations of each other. Two statements in the original concept are withdrawn:

- §5.3 Related: "the same shiur's counterpart in the other language where a series has one." Removed.
- §5.6: the "side-by-side view" of a series in both languages. Replaced by the perek and Tanya-section grouping in C.6, which lists two independent courses under a shared heading and pairs nothing.

Topics, threads and stories may contain both languages. In those views language is a property of each member, shown on each row, and never of the group.

### F.2 No transcript text

Each new file was checked for fields that could carry transcript wording.

| Field | Finding | Handling |
|---|---|---|
| `asrVariants` on concepts, people, works | ASR mishearings, i.e. `heardAs` under another name (the Baal Shem Tov alone has dozens) | Never shipped, never indexed, never displayed. Added to the guard's forbidden field names |
| `concept-alias-map.json` | 16,093 keys, of which 15,102 are ASR variants | Not used as shipped. The site builds its concept alias map from `transliterations`, labels and `canonicalHe` only |
| `people-alias-map.json`, `works-alias-map.json` | 0 ASR keys today (checked against every `asrVariants` list) | Usable for query expansion and redirects. The build asserts the zero on every run, since nothing in the contract guarantees it |
| `raw/**` | Contains `heardAs` and `heardAsSamples` | Never read by the site build |
| `SearchSectionDoc.startSeg`, `endSeg` | Segment indices | Dropped; only `startSec` and `endSec` leave the build, as in §2 |
| `Story.retelling`, `TeachingCluster.summary`, `Topic.description`, `Concept.definition`, `SeriesSynthesis.*` | Third-person reported prose. Retellings contain reported dialogue (the Beis Aharon's reply in the sugar-sled story) and some descriptions put a word in quotation marks | Shippable as generated text. All of it goes through the corpus-guard verbatim scanner like any write-up; a hit fails the build |
| `Topic.aliases` | Lowercased candidate-topic phrases written by the model, some odd or local ("tragedy in boro park") | Search expansion only; never displayed |

**ASR variants for search.** The contract suggests using `asrVariants` for search expansion. Original decision 1 defaulted to NO for `heardAs` in any index, and this addendum keeps that default. The variants are noisy in ways that produce confident wrong answers: "10 times" maps to עשרה מאמרות, "Esther Esther" and "Hester upon him" to הסתר פנים, "Hashem Tov" to the Baal Shem Tov. Listeners type their own spelling, not Whisper's, and `transliterations` plus `aliases` cover that. If the search evaluation harness later shows a recall gain, the only acceptable form is a server-side, whole-query match that adds a low-weight boost for a concept id and shows the canonical name; the variant itself is never echoed. That stays an owner decision.

### F.3 Growth

Everything above is derived at build time from whatever is in `data/derived/corpus/`. Thresholds are rules over counts, not lists. `index.json` `version` is checked at build; an unknown version fails the build instead of rendering half-understood data. Ids are promised stable, so thread, story and topic URLs and saved playlists survive regeneration; the site still keeps `t` on every moment link as its fallback (§6.3).

## G. Loading: what arrives when

Live already misses its mobile budget (LCP 3.5 to 4.9 s against 2 s) because `corpus.json` and `facets.json` load up front; `corpus.json` is about 446 KB gzipped today against a 150 KB target. The corpus layer is larger than everything shipped so far (about 6 MB of JSON before search). The rule is therefore: **the corpus layer adds nothing to first load, and its arrival is used to make first load smaller.**

1. **Every page file is self-contained.** A shiur file carries the labels of its own topics, terms, threads and stories. A topic file carries the card data for its hubs. No page needs a corpus-wide dictionary to render. This is what lets Today and the listening room stop waiting on `corpus.json`.
2. **Dictionaries belong to Explore.** The entity id arrays move out of the per-shiur rows into Explore's own files, loaded when Explore opens or when the browser is idle after first paint. Merged entities are far fewer than the strings they replace (847 people for 1,285 strings; 759 concepts for 3,044), so those files shrink.
3. **Nothing corpus-wide is fetched whole.** Not `concepts.json` (1.3 MB), not `stories.json` (1.7 MB), not `teaching-clusters.json` (1.2 MB).

| Moment | What loads | Rough size |
|---|---|---|
| First paint of Today | Shell, `today.json` (now including the occasion's topic group and the mix's first items, inline) | as today or smaller; no corpus-layer file |
| First paint of a shiur | That shiur's file, now with section topic chips, thread marks, story counts, term labels | about 1 to 2 KB more per shiur |
| Idle after first paint, or opening Explore | The topic tree (ids, labels, parents, counts; no descriptions, aliases or hubs) | a few KB |
| Opening a topic | One topic file: description, hubs, threads, stories, first 30 moments. Further moments in pages on scroll | small; the largest topics are paged |
| Starting a mix | The topic's moment list (ids and times only) | small |
| Opening a thread or story page | One file each | about 2 to 4 KB |
| Tapping a term | One glossary shard | small |
| Opening Maasios | Story index without retellings: title, people ids, telling count, languages. Retellings come with each story | no larger than the current `stories.json` |
| First focus of the command bar | The quick index, now also holding entity names and clean aliases | lazy, as today |
| Applying person, concept or sefer facets | Explore's entity bitsets | lazy |

Prefetch happens on intent (pointer down, or focus on a link) and the service worker keeps what was fetched, so the second visit to a topic is instant and works offline. Prerendered pages for topics, threads of three or more shiurim, and stories told more than once add roughly 1,500 HTML files across both interface languages, inside the existing file budget.

A view that cannot meet these rules is cut or moved to Quiet.

## H. To send back to the data pipeline

1. **Voice is inconsistent across the layer.** Yiddish in `topics.json` and `teaching-clusters.json` says "דער רב" (132 and 768 occurrences, with no "דער משגיח"); `stories.json` and `concepts.json` say "דער משגיח" (666 and 110). The per-shiur extractions use "דער משגיח", and Live's rule is to follow the data. On a shiur page the two will sit side by side. English also mixes "Moshiach" (85) and "Mashiach" (31) within the clusters file.
2. **`shabbos-tefilah-en` has no synthesis** although its 8 shiurim are done. `tanya-yi` has 62 arc entries of 63 because `yi-tanya-2-17` is needs_review; the series page will show a gap at that part, which is correct, but the overview should be regenerated when it is done.
3. **The concept alias map is mostly ASR.** Please publish display aliases and ASR variants as separate maps, so a site cannot ship the wrong one by accident.
4. **Topics that mirror the calendar carry no link to it.** A `parsha` or `zman` key on calendar topics (Purim, Zos Chanukah, Chayei Sarah, Korach) would let the occasion pages fold topics in without a site-side table.
5. **Concept, topic and person overlap** (66 concept ids equal a topic id; 9 topic ids equal a person id). A `sameAs` field would be safer than matching slugs.
6. **`PersonType: "other"` is a catch-all** for angels, historical rulers, modern politicians and private individuals. Splitting it, or flagging living and private people, would let Live show the harmless ones. One-mention private names should probably not be entities at all.
7. **Ambiguous and suspect people.** `belzer-rav` overlaps five specific Belzer Rebbes and needs an `ambiguous` mark or a split. `chaggai-zechariah-malachi` is one entity for three prophets, with an alias that adds Mordechai. The sugar-sled story lists both `rabbi-aharon-of-karlin` (Rabbi Aharon HaGadol) and `beis-aharon` (his grandson) as people, which suggests the tellings disagree or the resolver was unsure; a human should look.
8. **Genre-level works** (`midrash` 471 shiurim, `talmud-bavli` 235, `zohar`, `siddur`, `mishnah`) sit beside real seforim. A `kind` field (sefer or genre) would let the shelf treat them differently without a list.
9. **Two-member clusters are two thirds of the file** (518 of 768), and 56 of them are a single English and Yiddish Tanya pair. If the pipeline can tell "the same course point taught twice" from "an idea he returned to years later", that distinction is worth a field.
10. **Stories:** 52 unresolved raw names in `people[]`, and the possible missed merges already listed in the contract. A `kind` on stories (about a tzaddik, from Chazal, from the Rav's own life, a mashal) would be a strong facet; "Asnas and the charm" and "Avraham in Ur Kasdim" sit in the same list as "The kneader and the newspaper".
11. **Concept definitions that read as stitched usages** (`olam-hazeh`: "This world, in which a tzaddik has no interest; Torah was reduced into its cases out of kindness"). Live shows definitions prominently in a card, so these matter more here than in an index. A per-concept confidence would let the card hide weak ones.
12. **Insight coverage.** Only 2,122 of 5,882 insights are in a cluster. That may be right. If it is a recall limit of the clustering pass, threads will improve with a second pass.
13. **Keep `SearchSectionDoc` free of segment indices** if the file is ever meant to be consumed outside the build.

## I. Priorities

**First cut (must have).**

1. Swap the entity layer: merged people, works and concepts with redirects; thresholds from E.1; the added label; the guard changes in F.2; site-side recounting.
2. Topic map in Explore, topic pages, topic chips on sections, topic facet.
3. Topic mix and occasion mix. They reuse the existing queue and are the quickest route from the new data to audio.
4. Maasios on merged stories with the telling switcher.
5. Thread marks on insights and thread pages for clusters of three or more shiurim.
6. Series overview and arc.
7. Loading rules from section G, applied while doing 1 to 6 and not afterwards.

**Second cut.**

8. Glossary cards with "hear it explained"; the terms strip in the listening room.
9. Two-topic mix; topic over years; calendar topics folded into occasion pages and the Luach.
10. Threads and stories as search documents; entity-grouped suggestions; new report types.
11. Typed People index; series position in the dock; Tanya by section.

**Later.**

12. Connections lens with threads as edges.
13. Any use of ASR variants in search, only after evaluation and an owner decision.
14. "Ask" (§8), which would now have clusters and merged stories to cite, and is still held until review exists.

## J. Decisions to flag

1. Confirm that site-derived entity pages are retired and old URLs redirect.
2. ASR variants in a server-side query rewrite: default stays **NO** (extends original decision 1).
3. The owner-controlled list of topics excluded from featured slots and share previews (E.5): whether to have one, and what is on it.
4. People of type `other`: no pages at all (proposed), until the pipeline refines the type.
5. Whether two-member threads should be shown even as a line, given they are unreviewed pairings of single insights. Proposed: yes, at the insight only.
6. Whether threads and merged stories from `simcha` and `current` shiurim follow original decision 6 automatically (proposed: yes; an entity left with fewer visible members than its threshold loses its page).

## K. Left out on purpose

A browsable list of all 768 threads (they are reached from topics, shiurim and search, where they have context). A whole-taxonomy graph. Auto-linked glossary terms inside write-up text. A "most told stories" leaderboard beyond a single sort option. Any part-to-part pairing of the Yiddish and English courses. Topic pages for `candidateTopics`. Anything that would require fetching a corpus-wide file before first paint.
