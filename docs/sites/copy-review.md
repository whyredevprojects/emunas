# Copy review (W5.3): About texts, AI label, Yiddish UI

Status: **copy pass done, not signed off.** Nothing here is approved wording yet. Two sign-offs are
needed before launch (integration-plan §8 W5.3 acceptance, W6.1):

| Item | Who signs | Status |
|---|---|---|
| Standing AI label (en + yi) | owner | proposed, unsigned |
| About texts, all five parts (en + yi) | owner; Yiddish by a named reviewer | drafts only, not published |
| Yiddish UI strings, both sites | a named Yiddish reader | reviewed by the W5.3 copy pass (AI); human sign-off pending |
| Hebrew UI strings, both sites and the home translations (`apps/home/src/lib/content.ts` `TRANSLATIONS`, not shown until home has a language switch) | a named Hebrew reader | written by AI, unreviewed |
| Hebrew translations of the notes (overlays, `docs/translation-runbook.md`) | a named Hebrew reader, by sample | generated, unreviewed |
| Improved-audio line and About paragraph (§7) | English: owner; Yiddish: a named reviewer; Hebrew: a named Hebrew reader | English approved by the owner 2026-11-18; Yiddish proposed, unsigned; Hebrew written by AI, unreviewed |

Reviewer sign-off (fill in):

- Yiddish UI reviewed by: ________________ on ____________ (Quiet / Live / both)
- Hebrew UI reviewed by: ________________ on ____________ (Quiet / Live / Home)
- AI label approved by: ________________ on ____________
- About texts approved by: ________________ on ____________ (parts: rav / arrangement / notes / report / excluded)
- Improved-audio Yiddish (§7) reviewed by: ________________ on ____________

The pass followed `prompts/yiddish-style.md` (Chassidish orthography, no YIVO, no Daytshmerish, no
English calques). Every change is wording only: no key was added, removed or renamed, and every
`{placeholder}` is unchanged (a test checks this in both apps).

## 1. Standing AI label

One wording for both sites, in `packages/i18n/src/vocab/ai-label.ts` (`AI_LABEL`,
`AI_LABEL_STATUS = "proposed"`). Both notice keys now point at that one object: Quiet's
`notice("aiNotes")` (once over the notes area, linking to About `#notes`) and Live's
`notice("aiNotesShort")` (on every generated text surface). A test in
`packages/i18n/test/vocabulary.test.ts` pins that they are identical in both languages.

| | Before | After (proposed) |
|---|---|---|
| Quiet, en | Notes prepared by AI from the recording; not reviewed. The recording is the source. | Notes prepared by AI from the recording; not reviewed, and not the Mashgiach's words. The recording is the source. |
| Live, en | Summary written by AI from the recording, not the Mashgiach's words. | (same as above) |
| Quiet, yi | די נאטיצן זענען צוגעגרייט דורך AI פון דער רעקארדירונג, און זענען נישט איבערגעקוקט. דער מקור איז די רעקארדירונג. | נאטיצן צוגעגרייט דורך AI פון דער רעקארדירונג; נישט איבערגעקוקט, און נישט דעם משגיח׳ס ווערטער. דער מקור איז די רעקארדירונג. |
| Live, yi | א קיצור געשריבן דורך AI פון דער רעקארדירונג, נישט דעם משגיח׳ס ווערטער. | (same as above) |

Why: the brief requires the label to be identical in both sites. The merged wording keeps all four
statements the two concepts asked for: made by AI, from the recording, not reviewed, not the Mashgiach's
words, and the recording is the source. It is longer than Live's old short label; see open question
Q1.

## 2. About texts (drafts, not published)

Drafts of all five parts in both editions are in `apps/quiet/src/content/about-drafts/{en,yi}/`
(`rav`, `arrangement`, `notes`, `report`, `excluded`), each with front matter `status: DRAFT`,
`approvedBy: null`. The About page reads only `src/content/about/{ed}/{part}.md`, so it still shows
its marked placeholders and the W4.6 test "holds no generated text" still passes. The acceptance line
"No generated text in About" holds: the drafts are for the owner to rewrite or approve, then move.
How to publish one is in `apps/quiet/src/content/about-drafts/README.md`.

What the drafts say:

- **rav**: only a neutral paragraph about the collection (2012 Pocket Guide plus recordings it does
  not list, Yiddish and English, parshiyos, zmanim, series such as Tanya and Emunah, simchos). The
  Mashgiach's name with his titles, a few lines about him, and who recorded and kept the shiurim are
  `[[OWNER: …]]` marks. Nothing about the Mashgiach was written by the copy pass.
- **arrangement**: the contents in Pocket Guide order, one page per shiur (catalog entry, recording,
  then the notes under a rule; every time plays the recording), calendar, indexes, search, two
  editions with the same shiurim.
- **notes**: automatic speech recognition, then an AI model wrote the notes; no person reviewed
  them; two kinds of error (mishearing, misunderstanding); not the Mashgiach's words, reported speech, no
  quotes; the recording is right where they differ; the machine text is not published and not
  searched; uncertain items left out; "apparently" / "place not identified"; shiurim without notes
  still have catalog entry and audio. This is the "AI notes caveat" and "audio is the source of
  truth" text.
- **report**: what to report, the "Report an error on this page" link on every shiur page (Quiet),
  the "Something's wrong here" button (Live), ask for the minute; what happens to a report is an
  `[[OWNER: …]]` mark. The page adds the address itself.
- **excluded**: Purim seudos and the Purim songs printed in the guide (reason left to the owner),
  guide entries with no recording in the archive, no text of the recordings in any form and no
  search in it, no summary for singing / another speaker / unclear audio, old-format recordings shown
  as not available online. Based on `outOfScopeReason` in `data/derived/ingest.json` (Purim seudah
  38, audio not in bucket 8, listed with no audio 3, Purim song lyrics 2) and integration-plan §0
  and A1.

Live has no About route today (concept-live has none). Live's label does not link anywhere. If Live
should get one, it can link to Quiet's About (`@emunas/links`); see Q9.

## 3. Yiddish terminology (glossary applied in both sites)

| Thing | Yiddish now | Was also | Notes |
|---|---|---|---|
| the Mashgiach | דער משגיח | | unchanged; Live tables name him only as הרב משה וואלפסאן זצ"ל |
| AI notes | נאטיצן | הערות (Live feedback) | |
| the reader's own private notes (Live shelf) | הערה / הערות | נאטיץ / נאטיצן | so they are not confused with the AI notes |
| write-up | אויסשרייב; heading "דער שיעור, אויסגעשריבן" | באשרייבונג, טעקסט | |
| summary | קיצור | תמצית | |
| section of a shiur (chapter) | חלק / חלקים | קאפיטל, טייל | |
| part of a series | טייל / טיילן | חלק | recording part (multi-file shiur) is also טייל; see Q4 |
| series | סדרה / סדרות | סעריע, סדר, קורס | |
| moment (Live) | מאמענט / מאמענטן | רגע / רגעים | |
| insight | געדאנק / געדאנקען | חידוש / חידושים | see Q3 |
| question (with answer) | קשיא / קושיות; answer תירוץ | שאלה / שאלות, קשיות | see Q3 |
| key point | הויפט נקודה; heading עיקרי הדברים | הויפט פונקט, עיקר נקודות | |
| takeaway | לימוד; heading "וואס מ׳זאל ארויסנעמען" | לקח | |
| sources (heading) | מראי מקומות; one source מקור | מקורות, מראה מקומות | |
| cited | געברענגט | אנגעפירט | |
| place in a sefer | מקום / ארט; "מקום נישט באשטימט" | פלאץ, "נישט געפונען דעם ארט" | |
| people | פערזאנען / פערזאן | שמות, מענטשן | see Q5 |
| catalog title | קעפל / קעפלעך | טיטל / טיטלען | |
| site / page | זייטל / בלאט | זייטל for both | |
| recording | רעקארדירונג | | unchanged; see Q2 |
| file | פייל | טעקע | |
| browser | בראוזער | בלעטערער | |
| online | אויפן אינטערנעט | אויפן נעץ | |
| download | אראפלאדן | אראפנעמען | |
| loading… | מ׳לאדט… | לאדנט… (wrong form) | |
| now | יעצט | איצט | |
| buttons | infinitive (שפילן, ווייטער הערן) | שפיל, הער ווייטער | |
| Pocket Guide | פאקעט גייד | פּאָקעט גייד | |

Orthography fixed everywhere: no nikud or YIVO marks (פּ, אָ, ייִ), `-יג` spellings (ענדיגן,
פארענדיגט, יעצטיגער), `ענליך`, `לשון קודש` without maqaf, `די ריי` feminine throughout.

`apps/quiet/src/content/yiddish-copy.test.ts` and `apps/live/app/content/yiddish-copy.test.ts` read
every Yiddish string table of their app and fail on the forms this pass removed (the list above),
and on any change of keys or `{placeholders}` against English.

## 4. Open wording questions for the human reviewer

- **Q1. Label length in Live.** The one label is now about 110 characters and appears on every text
  surface in Live (cards, search results, chapters). If that is too heavy, the owner can approve a
  shorter wording for both sites, for example "AI notes from the recording, not reviewed and not the
  Mashgiach's words." The label must stay identical in both sites.
- **Q2. רעקארדירונג or הקלטה?** Kept רעקארדירונג (already used everywhere). Many Chassidish readers
  say and write הקלטה / הקלטות. A one-word swap across all tables if preferred.
- **Q3. Insight and question names.** Chose געדאנק (neutral; חידוש claims novelty the AI cannot
  judge) and קשיא / תירוץ (the shiur's own questions). Confirm, or prefer חידוש / שאלה.
- **Q4. טייל for both a series part and a recording part.** Rarely meet (4 multi-recording shiurim),
  but a reader may want חלק for one of them. Sections are חלק.
- **Q5. People index title.** Chose פערזאנען to match Live. אישים reads more like a sefer's index
  and may suit the Quiet site better.
- **Q6. Geresh or apostrophe.** Tables use ׳ (מ׳לאדט, נומ׳, ז׳, משגיח׳ס); the About drafts and the
  style guide use ' (משגיח'ס, ס'איז). Pick one; the papers mostly use the plain apostrophe.
- **Q7. AI in Yiddish.** Kept the Latin "AI". Alternatives: "קינסטליכע אינטעליגענץ" (Daytshmerish
  feel), or "א קאמפיוטער פראגראם".
- **Q8. Site names.** Quiet is branded Library and Live is branded Analyze (עיון). Quiet's
  `site.name` is "ספריה — שיעורים" and Live's is "עיון — שיעורים"
  (`site.short` "עיון"). "ספריה" was chosen by the owner. "אין עיון" (in
  `live.open` and the About report text) can also read as "in depth"; the owner may want the name
  set off, for example „עיון“.
- **Q9. About in Live.** Live has no About page. Should its label or menu link to Quiet's About?
- **Q10. About drafts.** Everything marked `[[OWNER: …]]`: the Mashgiach's titles and biography, who
  recorded and kept the shiurim and with whose permission they are published, what happens to a
  report, and whether to give a reason for excluding the Purim seudos.
- **Q11. Smaller calls a native reader should glance at:** "דער לוח לויט" (`cal.views`, an aria
  label), "דא זענט איר" (breadcrumb label), "נאך נישט דא" (About placeholder label), "ארט אינעם
  שיעור" (player seek slider), "צענטרירן אויף" (Explore connections), "פולשטענדיג", "געלעגנהייטן",
  "פארשידנס" (category `misc`), "לייענען" / "לייגט צו" forms in Live.

Not changed, by design: the English UI copy (except the word "אידיש" shown as the language name in
the English UI, which had YIVO spelling), the data vocabulary for categories and section kinds
(already Chassidish), and two code comments in `apps/quiet/src/components/TimeLink.astro` and
`apps/quiet/src/components/shiur/Time.astro` that still quote the old "שפּיל פון" (outside W5.3's
paths; comments only).

## 5. Tests updated to follow the wording (deliberate)

| Test | Old expectation | New |
|---|---|---|
| `packages/i18n/test/vocabulary.test.ts` | aiNotes en wording | new label; plus new tests: one label in both sites, no nikud in vocabulary |
| `apps/quiet/test/components.test.ts` | "שפּיל פון 12:34"; "…אויפן נעץ."; old label | "שפילן פון 12:34"; "…אויפן אינטערנעט."; new label (HTML-escaped apostrophe) |
| `apps/quiet/test/catalog.test.ts` | "קיין רעקארדירונג אויפן נעץ" | "קיין רעקארדירונג אויפן אינטערנעט" |
| `apps/quiet/test/lib.test.ts` | /פּאָקעט גייד/ | /פאקעט גייד/ |
| `apps/quiet/test/shiur-page.test.ts` | "שפּיל פון" | "שפילן פון" |
| `apps/live/app/features/listening-room/room.test.tsx` | "Summary written by AI" | "Notes prepared by AI" |
| `apps/live/app/features/command-bar/test/search-page.test.tsx` | "Summary written by AI"; "ענלעך אין באדייט" | "Notes prepared by AI"; "ענליך אין באדייט" |
| `apps/live/app/features/series/test/series-page.test.tsx` | "27 חלקים" | "27 טיילן" |

No snapshot files exist in either app; no test was skipped or loosened.

New tests: `apps/quiet/src/content/about-drafts.test.ts`, `apps/quiet/src/content/yiddish-copy.test.ts`,
`apps/live/app/content/yiddish-copy.test.ts`.

## 6. Every change, by file

Generated from the edit log of this pass. "orthography" alone means only nikud or YIVO marks were
removed.

#### `apps/quiet/src/i18n/yi.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `footer.recordingIsSource` | דער מקור איז די רעקארדירונגען. די קעפלעך זענען ווי געדרוקט אינעם פּאָקעט גייד פון 2012. | דער מקור איז די רעקארדירונגען. די קעפלעך זענען ווי געדרוקט אינעם פאקעט גייד פון 2012. | orthography |
| `citation.guidePage` | פּאָקעט גייד ז׳ {page} | פאקעט גייד ז׳ {page} | orthography |
| `skip.toMain` | גיי צום טעקסט | גייט צום טעקסט | phrasing: formal imperative, same as Live |
| `breadcrumb.label` | דא ביסטו | דא זענט איר | phrasing: formal address, as elsewhere in the UI |
| `footer.otherEdition` | דאס זייטל אויף ענגליש | דער בלאט אויף ענגליש | terminology: page = בלאט, site = זייטל |
| `time.playFrom` | שפּיל פון {time} | שפילן פון {time} | orthography; terminology: same verb form as Live |
| `time.playFromPart` | שפּיל פון {time} (טייל {part}) | שפילן פון {time} (טייל {part}) | orthography; terminology |
| `listen.download` | אראפּנעמען | אראפלאדן | terminology: download = אראפלאדן in both sites |
| `listen.downloadPart` | אראפּנעמען טייל {part} | אראפלאדן טייל {part} | terminology |
| `listen.unavailable` | די רעקארדירונג איז נאך נישט צוגעשטעלט אויפן נעץ. | די רעקארדירונג איז נאך נישט צוגעשטעלט אויפן אינטערנעט. | vocabulary (YIVO/Daytshmerish/coinage): אויפן נעץ → אויפן אינטערנעט |
| `listen.unavailablePart` | טייל {part}: נאך נישט צוגעשטעלט אויפן נעץ. | טייל {part}: נאך נישט צוגעשטעלט אויפן אינטערנעט. | vocabulary (YIVO/Daytshmerish/coinage) |
| `listen.noSupport` | דער בלעטערער קען דא נישט שפּילן די רעקארדירונג. נוצט דעם לינק צום אראפּנעמען. | דער בראוזער קען דא נישט שפילן די רעקארדירונג. נוצט דעם לינק צום אראפלאדן. | vocabulary (YIVO/Daytshmerish/coinage): בלעטערער → בראוזער; orthography |
| `citation.series` | סעריע | סדרה | terminology: series = סדרה / סדרות |
| `catalog.derived.filename` | שטייט נישט אינעם פּאָקעט גייד פון 2012; דער קעפּל איז גענומען פונעם נאמען פון דער טעקע. | שטייט נישט אינעם פאקעט גייד פון 2012; דער קעפל איז גענומען פונעם נאמען פונעם פייל. | orthography; vocabulary (YIVO/Daytshmerish/coinage): טעקע → פייל |
| `catalog.derived.dirPrefix` | שטייט נישט אינעם פּאָקעט גייד פון 2012; דער קעפּל איז גענומען פונעם פאלדער און פונעם נאמען פון דער טעקע. | שטייט נישט אינעם פאקעט גייד פון 2012; דער קעפל איז גענומען פונעם פאלדער און פונעם נאמען פונעם פייל. | orthography; vocabulary (YIVO/Daytshmerish/coinage) |
| `chooser.enterNote` | דער אינטערפייס און די נאטיצן אויף אידיש. אלע שיעורים, אויף אידיש און ענגליש. | דער זייטל און די נאטיצן אויף אידיש. אלע שיעורים, סיי אויף אידיש סיי אויף ענגליש. | vocabulary (YIVO/Daytshmerish/coinage): אינטערפייס; phrasing |

#### `apps/quiet/src/pages/[ed]/search/_strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `none` | קיין שיעורים נישט געפונען. פּרובירט אן אנדער אויסלייג, אדער נוצט די מפתחות אונטן. | קיין שיעורים נישט געפונען. פרובירט אן אנדער אויסלייג, אדער נוצט די מפתחות אונטן. | orthography |
| `contents` | תוכן (לויט די אפּטיילונגען פונעם קאטאלאג) | תוכן (לויט די אפטיילונגען פונעם קאטאלאג) | orthography |
| `parsha` | לויט פּרשה | לויט פרשה | orthography |
| `lede` | זוכט אינעם קאטאלאג און אין די נאטיצן: קעפּלעך, פּרשה און זמן, יארן, תמצית, מראי מקומות, מענטשן און מעשיות. לשון קודש, אידיש און ענגליש ארבעטן אין ביידע אויסגאבעס. | זוכט אינעם קאטאלאג און אין די נאטיצן: קעפלעך, פרשה און זמן, יארן, קיצורים, מראי מקומות, פערזאנען און מעשיות. לשון קודש, אידיש און ענגליש ארבעטן אין ביידע אויסגאבעס. | orthography; terminology: תמצית → קיצורים, מענטשן → פערזאנען |
| `noscript` | צום זוכן דארף מען דזשאוואסקריפּט. אן דעם קען מען נוצן די מפתחות אונטן. | צום זוכן דארף מען JavaScript. אן דעם קען מען נוצן די מפתחות אונטן. | phrasing: product name in Latin letters |
| `error` | מען האט נישט געקענט אראפּלאדן דאס זוכן. די מפתחות אונטן ארבעטן נאך אלץ. | מען האט נישט געקענט לאדן דאס זוכן. די מפתחות אונטן ארבעטן יא. | orthography; phrasing |
| `people` | מענטשן | פערזאנען | terminology |

#### `apps/quiet/src/components/catalog/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `home.lead` | די רעקארדירטע שיעורים פון הרב משה וואלפסאן זצ"ל, אויסגעשטעלט ווי א ספר: דער תוכן לויטן סדר פונעם פּאָקעט גייד פון 2012, א בלאט פאר יעדן שיעור, און מפתחות אינעם סוף. | די רעקארדירטע שיעורים פון הרב משה וואלפסאן זצ"ל, אויסגעשטעלט ווי א ספר: דער תוכן לויטן סדר פונעם פאקעט גייד פון 2012, א בלאט פאר יעדן שיעור, און מפתחות אינעם סוף. | orthography |
| `index.search.note` | קעפּלעך און נאטיצן | קעפלעך און נאטיצן | orthography |
| `contents.lead` | די אפטיילונגען פונעם פּאָקעט גייד פון 2012, לויטן סדר פונעם גייד אליין: די אידישע שיעורים, און דערנאך די ענגלישע. | די אפטיילונגען פונעם פאקעט גייד פון 2012, לויטן סדר פונעם גייד אליין: די אידישע שיעורים, און דערנאך די ענגלישע. | orthography |
| `section.guidePages` | פּאָקעט גייד, ז׳ {pages}. | פאקעט גייד, ז׳ {pages}. | orthography |
| `section.guidePage` | פּאָקעט גייד, ז׳ {pages}. | פאקעט גייד, ז׳ {pages}. | orthography |
| `table.title` | דער קעפּל ווי אינעם קאטאלאג | דער קעפל ווי אינעם קאטאלאג | orthography |
| `series.inGuide` | אינעם פּאָקעט גייד: | אינעם פאקעט גייד: | orthography |
| `home.standing` | {total} שיעורים, בערך {hours} שעה. נאטיצן זענען דא ביז איצט פאר {full}, און מען לייגט צו. | {total} שיעורים, בערך {hours} שעה. ביז יעצט זענען דא נאטיצן פאר {full}, און מען לייגט צו נאך. | phrasing; terminology: איצט → יעצט |
| `home.zmanNow` | איצט: {name} | יעצט: {name} | terminology |
| `home.zmanSoon` | עס קומט: {name} | באלד: {name} | phrasing |
| `index.people` | שמות | פערזאנען | terminology: people = פערזאנען (was שמות here, מענטשן elsewhere) |
| `index.people.note` | מענטשן וואס ווערן דערמאנט אין די שיעורים | פערזאנען וואס ווערן דערמאנט אין די שיעורים | terminology |
| `index.inyanim.note` | ענינים, לויט זייער לשון־קודש ווארט | ענינים, לויט זייער לשון קודש ווארט | orthography: no maqaf |
| `contents.uncataloguedLead` | רעקארדירונגען אין דער זאמלונג וואס דער פּאָקעט גייד פון 2012 רעכנט נישט אויס. די קעפּלעך זענען גענומען פון די נעמען פון די טעקעס און פאלדערס. | רעקארדירונגען אין דער זאמלונג וואס דער פאקעט גייד פון 2012 רעכנט נישט אויס. די קעפלעך זענען גענומען פון די נעמען פון די פיילס און פאלדערס. | orthography; vocabulary (YIVO/Daytshmerish/coinage): טעקעס → פיילס |
| `contents.seriesLead` | סדרות פון שיעורים וואס זענען געזאגט געווארן נאכאנאנד, צו הערן לויטן סדר. | סדרות פון שיעורים וואס זענען געזאגט געווארן נאכאנאנד, צו הערן על הסדר. | phrasing |
| `section.uncataloguedLead` | קיינער פון די שיעורים שטייט נישט אינעם פּאָקעט גייד פון 2012; די קעפּלעך זענען גענומען פון די נעמען פון די טעקעס. יעדע אזא שורה האט דעם צייכן {mark}. | קיינער פון די שיעורים שטייט נישט אינעם פאקעט גייד פון 2012; די קעפלעך זענען גענומען פון די נעמען פון די פיילס. יעדע אזא שורה האט דעם צייכן {mark}. | orthography; vocabulary (YIVO/Daytshmerish/coinage) |
| `section.alsoSeries` | אויך אויסגעשטעלט ווי א סדר: | אויך אויסגעשטעלט ווי א סדרה: | terminology: סדר → סדרה |
| `table.scroll` | {name} (די טאבעלע רוקט זיך אויף דער זייט) | {name} (מען קען די טאבעלע רוקן אויף די זייט) | phrasing |
| `row.noRecording` | קיין רעקארדירונג אויפן נעץ | קיין רעקארדירונג אויפן אינטערנעט | vocabulary (YIVO/Daytshmerish/coinage) |
| `series.sibling` | דער זעלבער סדר אויף {lang}: | אויך געזאגט אויף {lang}, א באזונדערע סדרה: | terminology; meaning (owner: the two languages are separate shiurim, not translations) |
| `series.empty` | קיינער פון די שיעורים פון דעם סדר איז נישט אין דער זאמלונג אויפן נעץ. | קיינער פון די שיעורים פון דער סדרה איז נישט אין דער זאמלונג אויפן אינטערנעט. | terminology; vocabulary (YIVO/Daytshmerish/coinage) |

#### `apps/quiet/src/components/shiur/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `mentioned.people` | פּערזאנען | פערזאנען | orthography |
| `catalog.noTitle` | אן א קעפּל | אן א קעפל | orthography |
| `sources.inNotes` | אינעם טעקסט: | אינעם אויסשרייב: | terminology: write-up = אויסשרייב (was טעקסט, ambiguous with the Sefaria link) |
| `catalog.seriesFallback` | סעריע | סדרה | terminology |
| `live.open` | עפענען אין דער הער־אפּליקאציע | עפענען אין עיון | orthography; names Live by its brand, עיון |
| `insights.heading` | חידושים | געדאנקען | terminology: insight = געדאנק / געדאנקען in both sites (was חידושים here) |

#### `apps/quiet/src/components/indexes/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `stories.intro` | מעשיות וואס ווערן דערציילט אין די שיעורים, לויט דעם וועמען זיי גייען. יעדעס דערציילן איז אויסגערעכנט, אזוי אז א מעשה וואס ווערט דערציילט אין עטליכע שיעורים קומט פאר מער ווי איינמאל. די מעשה אליין שטייט ביים שיעור. | מעשיות וואס ווערן דערציילט אין די שיעורים, לויט וועמען די מעשה איז. יעדעס מאל וואס א מעשה ווערט דערציילט שטייט באזונדער, ממילא קען א מעשה וואס ווערט דערציילט אין עטליכע שיעורים פארקומען מער ווי איינמאל. די מעשה אליין שטייט ביים שיעור. | phrasing: "לויט דעם וועמען זיי גייען" was unclear |
| `people.title` | שמות | פערזאנען | terminology |
| `inyanim.intro` | ענינים לויט זייער לשון־קודש ווארט, ווען דאס ווארט קומט פאר אין כאטש {min} שיעורים. גאר געווענליכע ווערטער זענען אויסגעלאזט. | ענינים לויט זייער לשון קודש ווארט, ווען דאס ווארט קומט פאר אין כאטש {min} שיעורים. גאר געווענליכע ווערטער זענען אויסגעלאזט. | orthography |
| `index.partial` | דער מפתח איז נישט פולשטענדיג און נישט איבערגעקוקט: ער איז צוזאמגעשטעלט פון AI נאטיצן און קיינער האט אים נישט דורכגעקוקט. | דער מפתח איז נישט פולשטענדיג און נישט איבערגעקוקט: ער איז צוזאמגעשטעלט פון AI נאטיצן און קיינער האט אים נישט איבערגעקוקט. | terminology: one verb for "reviewed" (איבערגעקוקט) |
| `index.jump` | שפרינג צו | גייט צו | phrasing: formal imperative |
| `work.generalNote` | דערמאנט אן א באשטימטן ספר אדער פלאץ ("דער מדרש זאגט"). | דערמאנט אן א באשטימטן ספר אדער מקום ("דער מדרש זאגט"). | terminology: place in a sefer = מקום |
| `work.refs` | לויט דעם פלאץ | לויט דעם מקום | terminology |
| `work.onSefariaLabel` | {ref} אויף ספריא (א דרויסנדיגער זייטל) | {ref} אויף ספריא (אן אנדער זייטל) | phrasing |
| `people.noPerson` | מעשיות אן א באשטימטן מענטש | מעשיות אן א באשטימטן פערזאן | terminology |

#### `apps/quiet/src/components/calendar/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `years.unknown.why` | די סדרות און די שמחות זענען נישט דאטירט אינעם פּאָקעט גייד פון 2012, און רוב רעקארדירונגען אויסער דעם גייד האבן נישט קיין יאר. זיי שטייען דא לויט די אפטיילונגען, אינעם סדר פון קאטאלאג. | די סדרות און די שמחות זענען נישט דאטירט אינעם פאקעט גייד פון 2012, און רוב רעקארדירונגען אויסער דעם גייד האבן נישט קיין יאר. זיי שטייען דא לויט די אפטיילונגען, אינעם סדר פון קאטאלאג. | orthography |
| `cal.views` | וועגן אריין אין לוח | דער לוח לויט | phrasing: "וועגן" read as "about" |
| `cal.zman.intro` | ארום דעם יאר פון אלול. יעדער שיעור אויף יעדן זמן, אידיש און ענגליש צוזאמען, לויט די יארן. | דורכאויס דעם יאר, פון אלול אן. יעדער שיעור אויף יעדן זמן, אידיש און ענגליש צוזאמען, לויט די יארן. | phrasing |
| `cal.countNone` | קיינע | קיין שיעורים | phrasing |

#### `apps/live/app/i18n/yi.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `shell.skip` | שפרינג צום אינהאלט | גייט צום טעקסט | vocabulary (YIVO/Daytshmerish/coinage): אינהאלט; same as Quiet |
| `shell.dockIdle` | גארנישט שפילט נישט | ס׳שפילט יעצט גארנישט | phrasing |
| `home.yi` | ייִדיש | אידיש | orthography: YIVO ייִדיש → אידיש |
| `page.today.lead` | די פרשה און זמנים פון דער וואך, וואס איר האט געהערט, און א נקודה פאר היינט. | די פרשה און די זמנים פון דער וואך, וואס איר האט געהערט, און א נקודה פאר היינט. | phrasing |
| `page.shiur.lead` | דער הער־צימער פאר שיעור {id}. | שיעור {id}, צום הערן. | phrasing: הער־צימער |
| `page.concept.lead` | וואו דער ענין {id} ווערט גערעדט. | וואו מען רעדט פונעם ענין {id}. | grammar |
| `page.series.lead` | שיעורים וואס זענען געזאגט געווארן לויט א סדר, ווי תניא און אמונה. | שיעורים וואס זענען געזאגט געווארן על הסדר, ווי תניא און אמונה. | phrasing |
| `page.seriesOne.lead` | די שיעורים פון סדרה {id}, לויט דער ריי. | די שיעורים פון סדרה {id}, על הסדר. | phrasing |
| `page.search.lead` | זוכט אין די שיעורים לויט די נאטיצן און די קאטאלאג טיטלען. | זוכט אין די שיעורים לויט די נאטיצן און די קעפלעך פונעם קאטאלאג. | terminology: catalog title = קעפל |
| `page.error` | עפעס איז נישט געגאנגען | עפעס האט נישט געארבעט | phrasing |

#### `apps/live/sw/client/strings.ts`

Removed on 2026-11-19 with Live's offline downloads; the reviewed strings no longer exist.

#### `apps/live/app/features/series/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `series.heading` | סעריעס | סדרות | terminology: סעריע → סדרה |
| `series.lead` | שיעורים וואס זענען געזאגט געווארן ווי א קורס, על הסדר. ווען א קורס איז געזאגט געווארן אין ביידע שפראכן, זענען דאס צוויי באזונדערע קורסן, געוויזן איינס לעבן דעם אנדערן. | שיעורים וואס זענען געזאגט געווארן על הסדר, ווי א סדרה. ווען א סדרה איז געזאגט געווארן אויף ביידע שפראכן, זענען דאס צוויי באזונדערע סדרות, געוויזן איינע לעבן דער אנדערער. | terminology: קורס → סדרה |
| `series.loading` | לאדנט… | מ׳לאדט… | grammar: לאדנט |
| `series.error` | מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדנט איבער. | מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדט איבער דעם בלאט. | grammar |
| `series.notFound` | ס׳איז נישטא קיין סעריע אויף דעם אדרעס. | ס׳איז נישטא קיין סדרה אויף דעם אדרעס. | terminology |
| `series.all` | אלע סעריעס | אלע סדרות | terminology |
| `series.parts` | { one: "{count} חלק", other: "{count} חלקים" } | { one: "{count} טייל", other: "{count} טיילן" } | terminology: series part = טייל, shiur section = חלק |
| `series.noParts` | קיין חלקים פון דער סעריע זענען נאך נישט פאראן. | קיין טיילן פון דער סדרה זענען נאך נישט דא. | terminology |
| `series.view.both` | ביידע שפראכן לעבן אנאנד | ביידע שפראכן, איינע לעבן דער אנדערער | phrasing |
| `series.perek.other` | אנדערע חלקים | אנדערע טיילן | terminology |
| `series.part` | חלק {n} | טייל {n} | terminology |
| `series.part.noOrder` | חלק | טייל | terminology |
| `series.progress` | {done} פון {total} חלקים געהערט | {done} פון {total} טיילן געהערט | terminology |
| `series.progress.none` | חלקים וואס איר הערט וועלן דא אנגעצייכנט ווערן. | טיילן וואס איר הערט וועלן דא אנגעצייכנט ווערן. | terminology |
| `series.continue` | ווייטער מיט חלק {n} | ווייטער מיט טייל {n} | terminology |
| `series.overviewGap` | איבערבליקן פון די סעריעס זענען נאך נישט געשריבן; די חלקים ווערן געוויזן מיט זייערע קאטאלאג טיטלען און נאטיצן. | איבערבליקן פון די סדרות זענען נאך נישט געשריבן; די טיילן ווערן געוויזן מיט זייערע קעפלעך פונעם קאטאלאג און נאטיצן. | terminology |

#### `apps/live/app/features/command-bar/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `cb.loadingIndex` | לאדנט… | מ׳לאדט… | grammar |
| `cb.type.series` | סעריע | סדרה | terminology |
| `cb.seriesPart` | חלק {n} | טייל {n} | terminology |
| `cb.fallback.offline` | איר זענט נישט פארבונדן, דערפאר זוכט מען נאר אין די טיטלען און קיצורים פון די שיעורים. | איר זענט נישט פארבונדן, דערפאר זוכט מען נאר אין די קעפלעך און קיצורים פון די שיעורים. | terminology |
| `cb.fallback.failed` | דאס פולע זוכן ארבעט נישט יעצט, דערפאר זוכט מען נאר אין די טיטלען און קיצורים פון די שיעורים. | דאס פולע זוכן ארבעט נישט יעצט, דערפאר זוכט מען נאר אין די קעפלעך און קיצורים פון די שיעורים. | terminology |
| `search.lead` | זוכן אין די שיעורים לויט זייערע נאטיצן און קאטאלאג טיטלען. | זוכן אין די שיעורים לויט זייערע נאטיצן און די קעפלעך פונעם קאטאלאג. | terminology |
| `search.matched.title` | {kind} – טיטל | {kind} – קעפל | terminology |
| `search.matched.semantic` | {kind}, ענלעך אין באדייט | {kind}, ענליך אין באדייט | orthography: ענליך |
| `search.kind.section` | קאפיטל | חלק | terminology: section = חלק (was קאפיטל) |
| `search.kind.insight` | חידוש | געדאנק | terminology: insight = געדאנק (was חידוש here) |
| `search.kind.question` | שאלה | קשיא | terminology: question = קשיא (was שאלה here) |
| `search.kind.takeaway` | לקח | לימוד | terminology: takeaway = לימוד (was לקח here) |
| `search.kind.keypoint` | הויפט פונקט | הויפט נקודה | vocabulary (YIVO/Daytshmerish/coinage): פונקט → נקודה |
| `search.field.title` | קאטאלאג טיטל | קעפל אינעם קאטאלאג | terminology |
| `search.field.sections` | קאפיטל טיטלען | קעפלעך פון די חלקים | terminology |
| `search.field.entities` | מקורות און פערזאנען | מראי מקומות און פערזאנען | terminology: sources = מראי מקומות |

#### `apps/live/app/features/feedback/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `report.lead` | מעלדונגען גייען צו דעם וואס פירט די הערות. זיי ענדערן נישט דעם זייטל. | מעלדונגען גייען צו דעם וואס קוקט נאך די נאטיצן. זיי טוישן נישט דעם זייטל. | terminology: AI notes = נאטיצן (הערות is the reader's own note) |
| `report.note` | לייגט צו א הערה (ווען איר ווילט, איידער איר קלייבט) | לייגט צו א הערה (אויב איר ווילט, איידער איר קלייבט) | phrasing |
| `error.verifyLoad` | די קאנטראל וואס האלט אפ אויטאמאטישע מעלדונגען האט זיך נישט געלאדנט. פרובירט נאכאמאל. | די פרובע וואס האלט אפ אויטאמאטישע מעלדונגען האט זיך נישט געלאדן. פרובירט נאכאמאל. | grammar: געלאדנט; phrasing |
| `error.rate` | צו פיל מעלדונגען פון דא אין דער צייט. פרובירט נאכאמאל אין א שטיקל צייט. | צו פיל מעלדונגען אין א קורצער צייט. פרובירט נאכאמאל שפעטער. | phrasing |

#### `apps/live/app/features/today/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `today.loading` | לאדנט… | מ׳לאדט… | grammar |
| `today.error` | מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדנט איבער. | מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדט איבער דעם בלאט. | grammar |
| `today.moment` | א רגע פאר היינט | א נקודה פאר היינט | terminology: matches page.today.lead |
| `today.continue.empty` | שיעורים וואס איר הייבט אן וועלן זיך באווייזן דא, כדי איר זאלט קענען ממשיך זיין. | שיעורים וואס איר הייבט אן וועלן זיך דא ווייזן, כדי איר זאלט קענען ווייטער הערן. | phrasing |
| `today.continue.next` | דער נעקסטער אין דער סעריע | דער קומענדיגער אין דער סדרה | terminology |
| `card.part` | חלק {n} | טייל {n} | terminology |

#### `apps/live/app/features/explore/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `explore.catalogued.catalogued` | אינעם פּאָקעט גייד | אינעם פאקעט גייד | orthography |
| `explore.loading` | לאדנט… | מ׳לאדט… | grammar |
| `explore.error` | מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדנט איבער. | מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדט איבער דעם בלאט. | grammar |
| `explore.results.moments` | { one: "{count} רגע", other: "{count} רגעים" } | { one: "{count} מאמענט", other: "{count} מאמענטן" } | terminology: moment = מאמענט (was רגע here) |
| `explore.facet.series` | סעריע | סדרה | terminology |
| `explore.ai.catalog-only` | נאך נישט צוזאמגעפאסט | נאך נישט קיין נאטיצן | phrasing: "צוזאמגעפאסט" did not mean summarized |
| `explore.catalogued.uncatalogued` | נישט קאטאלאגירט | נישט אינעם פאקעט גייד | terminology: same as Quiet |
| `explore.year.apply` | אנווענדן | ווייזן | vocabulary (YIVO/Daytshmerish/coinage): אנווענדן |
| `explore.unit.moments` | רגעים | מאמענטן | terminology |
| `explore.kinds` | סארטן רגעים | סארטן מאמענטן | terminology |
| `explore.kind.q` | קשיות | קושיות | orthography: plural spelling |
| `explore.moments.loading` | לאדנט רגעים: {loaded} פון {total} טיילן | מ׳לאדט מאמענטן: {loaded} פון {total} טיילן | grammar; terminology |
| `explore.moments.error` | געוויסע רגעים האט מען נישט געקענט לאדן. די ליסטע איז אפשר נישט פולשטענדיג. | געוויסע מאמענטן האט מען נישט געקענט לאדן. די ליסטע איז אפשר נישט פולשטענדיג. | terminology |
| `explore.moments.lead` | חלקים, געדאנקען, מעשיות, קשיות און לימודים פון די AI נאטיצן, יעדע מיט איר שיעור און א קנעפל צו הערן. | חלקים, געדאנקען, מעשיות, קושיות און לימודים פון די AI נאטיצן, יעדער מיט זיין שיעור און א קנעפל צו הערן. | orthography; grammar |
| `explore.uncatalogued` | נישט קאטאלאגירט | נישט אינעם פאקעט גייד | terminology |
| `explore.luach.lead` | יעדער פונקט ווייזט וויפיל שיעורים ער האט מיט די אנדערע פילטערס. קלייבט א פונקט צו זען אירע שיעורים לויט יאר. | יעדער פונקט ווייזט וויפיל שיעורים ער האט מיט די אנדערע פילטערס. קלייבט א פונקט צו זען זיינע שיעורים לויט יאר. | grammar: אירע → זיינע |
| `explore.years.title` | שיעורים א יאר | שיעורים לויט יאר | phrasing |
| `explore.connections.missing` | עס איז נאך נישטא קיין בלאט פון פארבינדונגען דערפאר: מען דארף כאטש צוויי שיעורים. | עס איז נאך נישטא קיין בלאט פון פארבינדונגען פאר דעם: מען דארף כאטש צוויי שיעורים. | phrasing |

#### `apps/live/app/features/entities/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `browse.loading` | לאדנט… | מ׳לאדט… | grammar |
| `browse.error` | מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדנט איבער. | מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדט איבער דעם בלאט. | grammar |
| `browse.queue.add` | צולייגן צום ריי | צולייגן צו דער ריי | grammar: די ריי (feminine), as in the shelf |
| `browse.queue.added` | {count} צוגעלייגט צום ריי. | {count} צוגעלייגט צו דער ריי. | grammar |
| `browse.queue.failed` | מען האט נישט געקענט טוישן דעם ריי. | מען האט נישט געקענט טוישן די ריי. | grammar |
| `seforim.lead` | די ספרים וואס ווערן אנגעפירט אין די שיעורים, אויף דער פאליצע על הסדר. ביי יעדן ספר שטייט וואו ער ווערט אנגעפירט, מיט יעדן מאמענט וואס רעדט דערפון. | די ספרים וואס ווערן געברענגט אין די שיעורים, אויף דער פאליצע על הסדר. ביי יעדן ספר שטייט וואו ער ווערט געברענגט, מיט יעדן מאמענט וואס רעדט דערפון. | terminology: cited = געברענגט (was אנגעפירט) |
| `seforim.inShiurim` | אנגעפירט אין {shiurim}, {mentions} | געברענגט אין {shiurim}, {mentions} | terminology |
| `seforim.chapters.lead` | עפנט א פרק צו זען יעדן ארט וואס ווערט אנגעפירט, על הסדר, מיט יעדן מאמענט דערויף. | עפנט א פרק צו זען יעדן ארט וואס ווערט געברענגט, על הסדר, מיט יעדן מאמענט דערויף. | terminology |
| `seforim.chapter.notFound` | גארנישט ווערט אנגעפירט פון דעם פרק. | גארנישט ווערט געברענגט פון דעם פרק. | terminology |
| `seforim.unordered.lead` | די מראה מקומות האט מען נישט געקענט אריינשטעלן על הסדר; זיי ווערן געוויזן ווי אנגעפירט. | די מראי מקומות האט מען נישט געקענט אריינשטעלן על הסדר; זיי ווערן געוויזן אזוי ווי זיי ווערן געברענגט. | orthography: מראה → מראי; terminology |
| `seforim.mention.paraphrased` | אין אייגענע ווערטער | מיט אנדערע ווערטער | terminology: same as the listening room |
| `seforim.genre` | אן אלגעמיינער נאמען, נישט איין ספר: די ציטאטן ווערן דא געוויזן, נאר ער שטייט נישט אויף דער פאליצע. | אן אלגעמיינער נאמען, נישט איין ספר: די מראי מקומות ווערן דא געוויזן, נאר ער שטייט נישט אויף דער פאליצע. | terminology |
| `maasios.lead` | די מעשיות וואס ווערן דערציילט אין די שיעורים. יעדע הייבט זיך אן וואו די מעשה הייבט זיך אן. די זעלבע מעשה דערציילט אין עטלעכע שיעורים איז נאך נישט צוזאמענגעשטעלט. | די מעשיות וואס ווערן דערציילט אין די שיעורים. יעדע מעשה שפילט פון דארט וואו זי הייבט זיך אן. די זעלבע מעשה, דערציילט אין עטליכע שיעורים, איז נאך נישט צוזאמגעשטעלט. | phrasing |
| `maasios.people.more` | נאך מענטשן | נאך פערזאנען | terminology |
| `entity.person.cited` | אנגעפירט ווי א מקור | געברענגט ווי א מקור | terminology |
| `entity.person.cited.lead` | שיעורים וואס פירן אן דעם ספר פון {name}. | שיעורים וואס ברענגען דעם ספר פון {name}. | terminology |
| `entity.person.cited.work` | יעדער ארט וואס ווערט אנגעפירט, על הסדר | יעדער ארט וואס ווערט געברענגט, על הסדר | terminology |
| `entity.person.discussed` | גערעדט וועגן | מען רעדט פון אים | phrasing |
| `entity.person.discussed.lead` | שיעורים אין וועלכע {name} איז צווישן די וואס מען רעדט וועגן זיי. | שיעורים וואו מען רעדט פון {name}. | vocabulary (YIVO/Daytshmerish/coinage): relative וועלכע |
| `entity.concept.lead` | דער ענין ווי ער ווערט גערופן אין די נאטיצן. קיין דעפיניציע איז נאך נישט געגעבן. | דער ענין ווי ער ווערט גערופן אין די נאטיצן. קיין טייטש איז נאך נישט צוגעגעבן. | vocabulary (YIVO/Daytshmerish/coinage): דעפיניציע |

#### `apps/live/app/features/listening-room/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `room.playShiur` | שפילט דעם שיעור | שפילן דעם שיעור | phrasing: button = infinitive |
| `room.playFrom` | שפילט פון {time} | שפילן פון {time} | phrasing |
| `room.occasion` | צייט | פרשה / זמן | terminology: as in Quiet |
| `room.outline` | אינהאלט פונעם קאטאלאג | דער תוכן לויטן קאטאלאג | vocabulary (YIVO/Daytshmerish/coinage): אינהאלט |
| `tab.questions` | שאלות | קושיות | terminology |
| `read.loading` | מ׳לאדט די באשרייבונג | מ׳לאדט דעם אויסשרייב | terminology: write-up = אויסשרייב (was באשרייבונג) |
| `read.missing` | די באשרייבונג אין דער שפראך איז נישט פאראן. | דער אויסשרייב אויף דער שפראך איז נישט דא. | terminology |
| `read.sources` | מקורות אין דעם פאראגראף | מראי מקומות אין דעם פאראגראף | terminology |
| `sources.onSefaria` | עפנט אין ספריא | עפענען אויף ספריא | terminology: same as seforim pages |
| `sources.notLocated` | {work}, נישט געפונען דעם ארט | {work}, מקום נישט באשטימט | terminology: same as the shared vocabulary |
| `sources.unnamed` | א מקור, נישט געפונען דעם ארט | א מקור, מקום נישט באשטימט | terminology |
| `insights.keyPoints` | עיקר נקודות | עיקרי הדברים | terminology: same heading as Quiet |
| `insights.takeaways` | וואס צו נעמען דערפון | וואס מ׳זאל ארויסנעמען | phrasing |
| `questions.hearQuestion` | הערט די שאלה | הערט די קשיא | terminology |
| `related.sameOccasion` | אנדערע יארן פון דער זעלבער צייט | די זעלבע פרשה אדער זמן, אנדערע יארן | terminology |
| `related.neighbors.note` | פארגעשלאגן לויט ענלעכקייט פון די נאטיצן; קען זיין ווייט. | פארגעשלאגן לויט ענליכקייט פון די נאטיצן; קען זיין ווייט. | orthography |
| `dock.seek` | פלאץ | ארט אינעם שיעור | phrasing |

#### `apps/live/app/features/shelf/strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `shelf.lead` | וואס איר הערט, אייער ריי, ליסטעס, אפגעהיטענע נקודות און נאטיצן. נאר אויף דעם מכשיר. | וואס איר הערט, אייער ריי, ליסטעס, אפגעהיטענע נקודות און הערות. נאר אויף דעם מכשיר. | terminology: the reader's own notes = הערות (AI notes = נאטיצן) |
| `shelf.memoryNotice` | דער בלעטערער לאזט נישט דעם זייטל היטן קיין דאטא, איז אייער פאליצע בלייבט נאר ביז מען מאכט צו דעם טאב. עקספארטירט עס אונטן כדי צו האלטן א קאפיע. | דער בראוזער לאזט נישט דעם זייטל אפהיטן קיין דאטא, ממילא בלייבט אייער פאליצע נאר ביז מען מאכט צו דעם טאב. עקספארטירט עס אונטן כדי צו האלטן א קאפיע. | vocabulary (YIVO/Daytshmerish/coinage); grammar |
| `section.notes` | נאטיצן | הערות | terminology |
| `empty.notes` | נאך קיין נאטיצן. ביים הערן קען מען צולייגן א פריוואטע נאטיץ ביי דער איצטיקער צייט. | נאך קיין הערות. ביים הערן קען מען צולייגן א פריוואטע הערה ביי דער יעצטיגער צייט. | terminology; orthography |
| `item.chapters` | { one: "{count} טייל פארענדיקט", other: "{count} טיילן פארענדיקט" } | { one: "{count} חלק פארענדיגט", other: "{count} חלקים פארענדיגט" } | terminology: chapters = חלקים; orthography |
| `action.play` | שפיל | שפילן | phrasing: buttons in the infinitive, as elsewhere |
| `action.playAll` | שפיל אלעס | שפילן אלעס | phrasing |
| `action.resume` | הער ווייטער | ווייטער הערן | phrasing |
| `queue.nowPlaying` | שפילט איצט | שפילט יעצט | terminology |
| `queue.failed` | נישט צו באקומען, איבערגעהיפט | נישט דא, איבערגעשפרונגען | terminology: same verb as the player |
| `queue.finished` | די ריי איז פארענדיקט. | די ריי איז פארענדיגט. | orthography |
| `note.label` | נאטיץ | הערה | terminology |
| `transfer.skipped` | {     one: "{count} זאך האט מען נישט געקענט לייענען און איבערגעהיפט.",     other: "{count} זאכן האט מען נישט געקענט לייענען און איבערגעהיפט.",   } | { one: "{count} זאך האט מען נישט געקענט לייענען און איבערגעשפרונגען.", other: "{count} זאכן האט מען נישט געקענט לייענען און איבערגעשפרונגען." } | terminology |
| `transfer.error.newer-version` | דער פייל איז געמאכט געווארן פון א נייערער ווערסיע פונעם זייטל. לאדט איבער דעם זייטל און פרובירט נאכאמאל. | דער פייל איז געמאכט געווארן פון א נייערער ווערסיע פונעם זייטל. לאדט איבער דעם בלאט און פרובירט נאכאמאל. | terminology |

#### `apps/quiet/src/pages/[ed]/about/_strings.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `placeholderLabel` | ארט־האלטער | נאך נישט דא | phrasing: calque of "placeholder" |

#### `apps/live/app/i18n/en.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `lang.uiSwitch` | ייִדיש | אידיש | orthography: YIVO ייִדיש → אידיש (the name of the language, shown in the English UI) |
| `home.yi` | ייִדיש | אידיש | orthography: YIVO ייִדיש → אידיש (the name of the language, shown in the English UI) |

#### `apps/quiet/src/i18n/en.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `edition.other` | ייִדיש | אידיש | orthography: YIVO ייִדיש → אידיש (the name of the language, shown in the English UI) |

#### `packages/i18n/src/vocabulary.ts`

| Key | Before | After | Why |
|---|---|---|---|
| `NOTICES.uncatalogued.yi` | שטייט נישט אינעם פּאָקעט גייד פון 2012; די פרטים זענען גענומען פון דער רעקארדירונג. | שטייט נישט אינעם פאקעט גייד פון 2012; די פרטים זענען גענומען פון דער רעקארדירונג. | orthography |

## 7. Improved audio (version line under the player)

One wording for both sites, in `packages/i18n/src/vocab/audio-version.ts` (`AUDIO_VERSION_LABELS`,
`audioVersionLabel()`, `AUDIO_VERSION_LABEL_STATUS = "proposed"` until the Yiddish and Hebrew are signed).
Design: `docs/sites/cleaned-audio-ux.md` §3 to §5 and its owner decisions. The owner chose
"improved" over the proposed "cleaned up" and the Hebrew מקורית over אריגינאל / אריגינעלע for "the
original". Hebrew says ההקלטה המקורית. A test (`packages/i18n/test/audio-version.test.ts`) pins the
English and the use of מקורית / הקלטה המקורית.

| Key | English (owner-approved) | Yiddish (proposed) | Hebrew (AI, unreviewed) |
|---|---|---|---|
| `cleaned.text` | Sound improved by AI | קלאנג אויסגעבעסערט דורך AI | הקול שופר על ידי AI |
| `cleaned.action` | Switch to the original | הערט די מקורית | מעבר להקלטה המקורית |
| `original.text` | A version with the sound improved by AI is also available | א ווערסיע מיט קלאנג אויסגעבעסערט דורך AI איז אויך דא | יש גם גרסה שהקול בה שופר על ידי AI |
| `original.action` | Listen to it | הערט זי | שמעו אותה |
| `announce.cleaned` | Now playing the version improved by AI. | יעצט שפילט די ווערסיע אויסגעבעסערט דורך AI. | כעת מתנגנת הגרסה שהקול בה שופר על ידי AI. |
| `announce.original` | Now playing the original recording. | יעצט שפילט די מקורית. | כעת מתנגנת ההקלטה המקורית. |
| `partOriginal` | Part {part}: original recording only | טייל {part}: נאר די מקורית | חלק {part}: ההקלטה המקורית בלבד |
| `about` | By default the original recording plays. There is also a version with the sound improved by AI, which removes noise and hiss; switch to it from the line under the player. Now and then the improvement can change how a word sounds. | ווען מען קלייבט נישט אנדערש, שפילט די מקורית. עס איז אויך דא א ווערסיע מיט קלאנג אויסגעבעסערט דורך AI, וואס נעמט אראפ דעם רעש; מען קען איבערגיין צו איר אונטער דעם שפילער. אמאל קען דאס אויסבעסערן טוישן ווי א ווארט הערט זיך. | כברירת מחדל מושמעת ההקלטה המקורית. יש גם גרסה שהקול בה שופר על ידי AI, המסיר רעשים ורחשים; אפשר לעבור אליה מהשורה שמתחת לנגן. לפעמים השיפור עלול לשנות את צליל המילה. |

Rules the wording keeps: it speaks of the sound and the recording only, never of the shiur or its
content; it never names the model; it never mentions transcription or speech recognition. The
"may change a word" caveat is only in the About paragraph. The about paragraph's last sentence
(downloads are the original) follows the owner's decision that downloads always use the original
file.

Questions for the Yiddish reviewer:

- **Q12.** "הערט זי" refers back to "ווערסיע" (feminine). Natural, or prefer "הערט עס" / "הערט די ווערסיע"?
- **Q13.** Withdrawn: the "downloads are always the original" sentence was removed (downloads now follow the version being played).
