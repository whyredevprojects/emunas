# P4: extract a shiur of Harav Moshe Wolfson (prompt p4-v3)

You are building the structured record of one Torah shiur (class) given by Harav Moshe Wolfson zt"l, the Mashgiach of Mesivta Torah Vodaath and Rav of Bais Medrash Emunas Yisroel. The shiur is in Yiddish or English. You have two things: this file, and one **input file** containing the shiur's catalog metadata and its machine transcript. You produce one **JSON file** that follows the `Extraction` contract below exactly.

The transcript itself will never be shown to the public. What you write *is* what people will read: chapter markers in the audio player, bilingual summaries, sources, insights and stories. It must be faithful to what the Mashgiach actually said, and it must never put words in his mouth. (A long-form write-up is produced later, in a separate pass, on top of your sections and sources. You do **not** write it, but your sections and sources must be accurate enough to build it on.)

**Output:** write ONLY valid JSON (no Markdown fences, no comments, no trailing commas, nothing before or after the object) to the output path given in your task message. Use the `model` and `variant` values given in the task message; if none are given use `"model": "unknown"`, `"variant": "raw"`. Always set `"promptVersion": "p4-v3"` (this prompt's version). Do not write any other files.

Also read **`prompts/yiddish-style.md`** (spelling, vocabulary and syntax for every `yi` field) before you write.

---

## 1. The input file

```
# SHIUR y-tanya-1-02
language: Yiddish (yi)
catalogTitle: ביאור ענין מזל; קושיא של איוב; ביאור מה זה צדיק
catalogTopics (catalogTitle split on ';' — use these indices for catalogTopicIdx):
  0: ביאור ענין מזל
  1: קושיא של איוב
  2: ביאור מה זה צדיק
catalogSection: תניא (tanya-1), #2
catalogConfidence: human-written catalog row
category: set
perek: ב
year: 5749 (1988/89)
series: Tanya / תניא (tanya-yi), part 2
totalDuration: 58:12 (0.97 h)
targets: 3-12 sections in total; write-up about 776-970 words per language (800-1000 per audio hour; ...)
asrNoise: 3 segment(s) marked [NOISE?] by code (long_sparse 1, repeat_run 2); see the prompt on how to treat them
recordings (in playback order):
  y-tanya-1-02: 412 segments (idx 0..411), 58:12, asr=ivrit-ai/yi-whisper-large-v3-ct2, 3 [NOISE?]

## RECORDING y-tanya-1-02 — 412 segments, 58:12
[y-tanya-1-02:0|00:00] text of segment 0 ...
[y-tanya-1-02:1|00:07] text of segment 1 ...
[y-tanya-1-02:2|00:15] [NOISE?] און און און און און און און און
...
```

- Header lines appear only when known (parsha, zman, perek, year, series, pathNotes, subTitle, note may be missing).
- Each transcript line is `[recordingId:idx|mm:ss] text`. `idx` is the **segment index within that recording**, starting at 0 for every recording. `mm:ss` is the segment's start time (minutes can exceed 59). A segment lasts until the next segment starts; the last segment lasts until the recording's duration in the header. Segments vary a lot in length: one segment can cover several minutes of audio (often where the ASR skipped or hallucinated).
- A shiur may have more than one recording (two cassette sides, several tracks). They are listed in playback order.
- `catalogConfidence: derived guess` means the title was guessed from a file path; use it as a hint only.
- **`[NOISE?]`** after a line's prefix means code flagged that segment as likely ASR noise: a very long segment with very little text (Whisper skipped silence, singing or bad audio), a word or phrase repeated over and over, an exact repeat of the line before, a near-empty line, or a stock Whisper filler ("תודה רבה", "Thank you for watching"). The segment index is unchanged. See section 2, point 6.
- `targets` gives the allowed number of sections for this shiur. Use it. (Its write-up word count is for the later write-up pass; ignore it.)
- You only ever output **segment indices**, never times. Code converts indices to times. Use the `mm:ss` stamps only to measure durations.

## 2. The transcript is bad. Recover meaning, don't invent it

The ASR is budget-quality Whisper. Yiddish comes out in Hebrew script with heavy errors; Hebrew and Aramaic quotations (pesukim, Chazal, Zohar, Tanya) are the worst. English shiurim come out in Latin script, with Hebrew terms mangled phonetically. Real examples from this corpus:

| ASR heard | Intended |
|---|---|
| "Rabbi Yisraelim" (English); "רבינו שלום" (Yiddish) | רבונו של עולם, Ribono shel Olam |
| "Nefesh Hashanah" | נפש השנית, nefesh haSheniyah (the second soul, Tanya) |
| "hi chilek alakam yema ul-mamish" | היא חלק אלוק ממעל ממש, "hi chelek Eloka mima'al mamash" (Tanya ch. 2) |
| "נחס" | נח, Noach |
| "Gaim" | גוים, goyim |
| "רש''ה ברענגט" | רש"י ברענגט, Rashi brings |

How to work:
1. **Read the whole transcript first.** Then decide what each stretch is about.
2. **Use context to recover terms**: the catalog title, parsha, perek, series, and what the Mashgiach says around the garbled words. A garbled phrase that matches a well-known source the shiur is clearly about (e.g. a Tanya shiur on perek ב and "chilek alakam … mamish") can be recovered.
3. **When you cannot recover something with reasonable confidence, leave it out.** Do not guess a name, a source, a number, a story detail or a chiddush from a garbled stretch. A shorter honest record beats a fuller invented one. Mention unrecoverable stretches in `asrNotes`.
4. **Never fill in from your own knowledge** what the Mashgiach "probably" said. Your knowledge may help you *recognize* a garbled term or source; it may never *supply content* that is not audible in the transcript. Everything you state must be traceable to specific segments.
5. Typical Whisper failures to watch for: the same sentence repeated many times, or generic phrases ("תודה רבה", "Thank you for watching", "Subtitles by…") during silence, singing or a niggun: that is hallucination, not speech. Another person speaking (a question from the audience, an introduction by someone else) is `other_speaker`.
6. **`[NOISE?]` segments**: treat them as noise unless the words are clearly coherent speech that fits what comes before and after. In particular, a long segment with little text often does hold real speech: Whisper transcribed a sentence or two and skipped the rest (a niggun, silence, or audio it lost). Use its coherent words like any other line; what the flag tells you is that most of its time is not transcribed, which matters for section kinds and for how much the stretch can support. Never cite a `[NOISE?]` segment as `evidence` for repeated or filler text, and never build a claim on its garbage. A run of flagged segments lasting **3:00 or more** becomes its own `noise` section (or `singing` when the context shows a niggun); a shorter run is absorbed into the neighbouring section and simply ignored. Mention long flagged stretches in `asrNotes`. Code may also miss noise: the same judgment applies to unflagged lines.

## 3. The catalog title is the skeleton

The catalog title was written by a person who listened to the shiur. It is reliable. When it is a ';'-separated list, it is usually a table of contents without times, in order.

- For each catalog topic, find **where it starts** in the transcript. A section that covers catalog topic *i* lists *i* in `catalogTopicIdx`. A section can cover several topics; a topic can span several consecutive sections; intro, closing, story and non-speech sections usually have `[]`.
- Then **add what the catalog misses**: shiurim usually contain more than the title lists (an opening, a story, a tangent, the application at the end).
- If you truly cannot find a catalog topic in the transcript, do not force it onto a section; say so in `asrNotes`.

## 4. Sections (the table of contents)

Sections are chapter markers in the player. Each is `{ recordingId, startSeg, endSeg (inclusive), title, summary, kind, catalogTopicIdx, subsections }`.

**Tiling (hard rule).** For every recording, its sections, taken in array order, must start at segment 0, continue with no gap and no overlap (`next.startSeg === prev.endSeg + 1`), and end exactly at that recording's last segment. List sections recording by recording, in playback order. Before writing the file, check this arithmetic for every recording.

**Counts and lengths (hard rules).**
- Total number of sections: within `targets` from the header (4–12 per hour of audio; at least 1).
- Every section lasts **at least 3:00** (from the start of its first segment to the start of the segment after its last one, or to the end of the recording). Aim for 3:15 or more to leave a margin. A short stretch (a 40-second niggun, a brief interruption) is absorbed into the neighbouring section; it does not get its own section.
- **Subsections** only inside a section longer than **12:00**, and then 2–4 of them, each at least **1:30**, in the same recording, tiling the parent exactly (first subsection starts at the parent's `startSeg`, last ends at its `endSeg`, no gaps or overlaps). Sections of 12:00 or less have `"subsections": []`. Use subsections when a long section has real internal steps (the question, then the sources, then the chiddush), not just to fill the slot.
- Cut at **turns in the argument**: a new question, a new source, the move to a story, the move to the application. Not at arbitrary time intervals.

**Kinds:** `intro` (opening words, setting the question), `main` (the body of the teaching), `story` (a maaseh is the main content of the stretch), `tangent` (a real digression from the shiur's line), `closing` (summary, final message), `brachah` (blessings, wishes for a simcha, closing tefilah), `singing` (niggun, zemiros), `other_speaker` (someone other than the Mashgiach), `noise` (silence, hallucinated or unusable audio). Most of a shiur is `main`. `singing`, `other_speaker` and `noise` sections are excluded from summaries, key points and insights (and from the later write-up).

**Titles**: short (2–8 words), specific to what is said in that stretch, in both languages. **Summaries**: 1–3 sentences per language, saying what the Mashgiach does there (asks, brings, explains, concludes), concrete enough that a listener could decide whether to jump to this point.

### Good section vs bad section

Bad:
```json
{ "recordingId": "y-tanya-1-02", "startSeg": 0, "endSeg": 9,
  "title": { "en": "Introduction", "yi": "Introduction" },
  "summary": { "en": "The Mashgiach speaks about Rabbi Yisraelim and many important things. He says we must always be happy and strengthen our emunah.", "yi": "דער רבי רעדט וועגן אסאך זאכן." },
  "kind": "main", "catalogTopicIdx": [0, 1, 2], "subsections": [] }
```
Why it's bad: the title is generic and the yi title is English; the garbled "Rabbi Yisraelim" was copied instead of recovered (Ribono shel Olam); "must always be happy" is advice nobody can trace to the segments; the yi summary is empty of content and not written from the shiur; it claims all three catalog topics; and 10 segments here last only 1:40, under the 3:00 minimum.

Good:
```json
{ "recordingId": "y-tanya-1-02", "startSeg": 0, "endSeg": 41,
  "title": { "en": "Why mazal seems to decide a person's life", "yi": "פארוואס עס זעט אויס אז מזל באשטימט א מענטשנס לעבן" },
  "summary": { "en": "The Mashgiach opens with the Gemara's statement that children, life and sustenance depend on mazal, and asks how this fits with a person's free choice and his tefillos.", "yi": "דער משגיח עפנט מיט דעם מאמר חז\"ל אז בני חיי ומזוני תלוי במזל, און פרעגט ווי אזוי דאס גייט צוזאמען מיט בחירה און מיט תפילה." },
  "kind": "intro", "catalogTopicIdx": [0], "subsections": [] }
```
(The good example's content is illustrative only; your content comes from your transcript.)

## 5. The other fields

**Evidence.** Almost every item carries `evidence: { segs, confidence }`. `segs` is a non-empty list of the segment indices where the Mashgiach actually says the thing (1–6 indices, the most direct ones, not a whole range). `confidence` is how sure you are that the item is what he said, given the ASR: 0.9+ clear speech and clear meaning; 0.7–0.85 meaning clear from context despite garbling; 0.6–0.7 plausible reconstruction; below 0.6 you should usually leave the item out (items under 0.6 are hidden anyway).
**Multi-recording shiurim:** segment indices restart at 0 in each recording, so when the shiur has more than one recording every `evidence` object, and every `questions[]` item, must also carry `"recordingId": "<the recording its segs are in>"`, and all segs of one item must come from that one recording. In a single-recording shiur omit `recordingId` from evidence (it is allowed but not needed).

- `summary.oneLiner`: one sentence per language, the heart of the shiur.
- `summary.abstract`: the shiur's line of thought in order: **80–150 words in English, 80–180 words in Yiddish** (Yiddish runs longer for the same content).
- `summary.keyPoints`: **3–7** main teachings, one sentence each.
- `insights`: **3–7** chiddushim: the non-obvious ideas, distinctive readings or connections the Mashgiach makes. Not a repeat of the key points in other words; an insight is something a learned listener would not have said himself.
- `stories`: every maaseh he tells, with `title`, a `retelling` (2–6 sentences per language, only details audible in the transcript), and `people` (names in English transliteration, only if recoverable). **Empty is valid.** Never add a story he didn't tell.
- `questions`: **at most 6** kushya/teretz pairs the Mashgiach himself raises and answers. `questionSegs` and `answerSegs` both non-empty. **Empty is valid.**
- `takeaways`: **at most 5** practical applications **the Mashgiach himself states** (what to do, how to daven, how to look at something). **Empty is valid**, and better than a takeaway you inferred.
- `sources`: every sefer, passuk, Chazal, Rishon, Acharon or Rebbe he cites or clearly alludes to. Uncapped, but each must be evidenced. (The later write-up refers to them by their index in this array.)
  - `heardAs`: the ASR text as it appears (copy the garbled form; short).
  - `work`: canonical English name of the work ("Tanya", "Bereishis", "Bnei Yissaschar", "Gemara Shabbos", "Zohar"), or `null` if only an author is named.
  - `ref`: the location, as precise as the transcript supports ("Tanya ch. 2", "Bereishis 6:9", "Shabbos 156a"). A ref names a location (chapter, verse, daf, siman), not just the work: "Zohar" alone is not a ref.
  - `sefariaRef`: a Sefaria-style ref (e.g. "Genesis 6:9", "Shabbat 156a") only if you are confident of the exact location; else `null`.
  - `resolution`, which **fixes which fields are filled** (the validator enforces this):
    - `resolved`: work and exact location are clear. **`ref` and `sefariaRef` are both required.**
    - `inferred`: you recognized the location from garbled text and context. **`ref` is required**; `sefariaRef` only if you are confident of it, else `null`.
    - `unresolved`: everything else: he names a work or author without a location you can pin down ("the Zohar says", "the Arizal writes"), or cites something you cannot identify. **`ref` and `sefariaRef` are `null`**; keep `heardAs`, and `work` if known.
  - `mention`: `quoted` (he reads or recites the words), `paraphrased`, `alluded`.
- `candidateTopics`: **5–10** free English noun phrases for topic tagging ("bitachon", "free will and mazal", "Shabbos as the source of blessing", "Tanya chapter 2"). Lowercase unless a proper noun.
- `concepts`: glossary candidates: Hebrew/Aramaic/Chassidus terms central to this shiur, in correct loshon-hakodesh spelling (`he`), with the ASR spellings you saw (`heardAs`). This doubles as the ASR correction list, so include the garbled forms.
- `people`: people he names (Tanach figures, Chazal, Rishonim, Acharonim, Rebbes, people in stories), English transliteration in `name`, ASR spellings in `heardAs`. Only names you could recover.
- `asrNotes`: 1–4 sentences in English: how bad the ASR was, which stretches or terms could not be recovered, catalog topics you could not locate, any long hallucinated or silent stretch.

## 6. Language rules (every `Localized` field)

Every `Localized` field is `{ "en": "...", "yi": "..." }`; both are required and non-empty. Do not output `he` in Localized fields.

1. **Write each language from the shiur itself.** Do not write the English and then translate it into Yiddish, or the reverse. Each should read as if a native writer of that language summarized the shiur. They must agree in content.
2. **Yiddish**: follow **`prompts/yiddish-style.md`** exactly: Chassidish orthography as in *Der Yid* / *Der Blatt* (`נישט`, `וואס`, `וואו`, `אזוי`, `פארוואס`, `ווייל`, `אידן`), **no YIVO spelling, no nikud, no dotted or ligature letters** (`וווּ`, `אַ`, `פֿ`, `ײ` are all wrong), no Daytshmerish (`וועלכער` as "which", `עטוואס`, `ווירקליך`), no English calques (`נעמט פלאץ`, `מאכט זינען`) and no English words in Hebrew letters (`רעקארדינג`). Hebrew and Aramaic words keep their **loshon-hakodesh spelling** (`שבת`, `אמונה`, `תפילה`, `צדיק`, `רבונו של עולם`, `נפש השנית`, `חז"ל`, `רש"י`), not phonetic Yiddish spellings (`שאבעס`, `צאדיק`). The `yi` text must be essentially all Hebrew script; at most an occasional unavoidable Latin name.
3. **English**: plain, clear English for a frum reader. Hebrew terms transliterated in the Ashkenazi/Chassidish way the audience uses (Shabbos, Hashem, Ribono shel Olam, emunah, bitachon, tzaddik, Chazal, Rashi, the Ba'al Shem Tov), with a short gloss the first time if the term is not common. **No Hebrew script in `en` fields.** Use "Hashem" or "G-d".
4. **Third-person reported speech, always.** English: "The Mashgiach explains…", "He asks…", "He brings the Zohar…", "According to the Mashgiach…". Yiddish: "דער משגיח ערקלערט…", "ער פרעגט…", "ער ברענגט דעם זוהר…". Never first person as the Mashgiach ("I want to tell you…", "מיר דארפן…"), never direct quotes of his words, never second-person preaching to the reader ("You must…", "מען דארף…" as the writer's own voice). If he says "one must…", write "The Mashgiach says one must…".
5. **No psak.** Do not state halachic rulings, even if he discusses halacha; describe what he explains ("The Mashgiach discusses why…").
6. **No advice he didn't give.** No moral lessons, applications or encouragement of your own.
7. **No source text from memory.** Cite sources by name and ref only. Do not quote a passuk, Gemara, Zohar or Tanya passage beyond the few words of the phrase the Mashgiach himself is clearly heard discussing, and never complete or correct a quote from memory.
8. **No biography, no dates, no occasions** beyond what the header gives or the Mashgiach says in the evidence. Don't call the shiur "a Shabbos shiur", "delivered at a wedding", etc. unless the header or transcript shows it. No claims about the Mashgiach's life, teachers or influence.
9. Refer to him as "the Mashgiach" in English and "דער משגיח" in Yiddish. Don't add titles or epithets beyond that.

## 7. Exact output shape

TypeScript contract (the validator checks every field; no extra fields allowed):

```ts
interface Localized { en: string; yi: string }
interface Evidence { segs: number[]; confidence: number; recordingId?: string } // recordingId: required if >1 recording
interface SegRange { recordingId: string; startSeg: number; endSeg: number }     // endSeg inclusive
interface Extraction {
  shiurId: string; model: string; variant: string;
  promptVersion: "p4-v3";
  summary: { oneLiner: Localized; abstract: Localized; keyPoints: { text: Localized; evidence: Evidence }[] };
  sections: (SegRange & {
    title: Localized; summary: Localized;
    kind: "intro"|"main"|"story"|"tangent"|"closing"|"brachah"|"singing"|"other_speaker"|"noise";
    catalogTopicIdx: number[];
    subsections: (SegRange & { title: Localized; summary: Localized })[];
  })[];
  sources: { heardAs: string; work: string|null; ref: string|null; sefariaRef: string|null;
             resolution: "resolved"|"inferred"|"unresolved"; mention: "quoted"|"paraphrased"|"alluded"; evidence: Evidence }[];
  insights: { text: Localized; evidence: Evidence }[];
  stories: { title: Localized; retelling: Localized; people: string[]; evidence: Evidence }[];
  questions: { question: Localized; answer: Localized; questionSegs: number[]; answerSegs: number[]; confidence: number; recordingId?: string }[];
  takeaways: { text: Localized; evidence: Evidence }[];
  candidateTopics: string[];
  concepts: { he: string; heardAs: string[] }[];
  people: { name: string; heardAs: string[] }[];
  asrNotes: string;
}
```

Compact example for a hypothetical single-recording 20-minute shiur (segments 0..95). It is complete in structure and shortened in content: a real output has more items, as the rules above require. Its wording is illustrative, not a model of any real shiur.

```json
{
  "shiurId": "y-tanya-1-02",
  "model": "opus",
  "variant": "raw",
  "promptVersion": "p4-v3",
  "summary": {
    "oneLiner": { "en": "The Mashgiach explains what it means that the Jewish soul is 'truly a part of G-d above'.", "yi": "דער משגיח ערקלערט וואס עס מיינט אז די אידישע נשמה איז \"חלק אלוק ממעל ממש\"." },
    "abstract": { "en": "(80-150 words)", "yi": "(80-180 ווערטער)" },
    "keyPoints": [
      { "text": { "en": "The word 'mamash' teaches that the soul stays bound to its Source.", "yi": "דאס ווארט \"ממש\" לערנט אז די נשמה בלייבט צוגעבינדן צו איר מקור." }, "evidence": { "segs": [12, 14], "confidence": 0.8 } },
      { "text": { "en": "...", "yi": "..." }, "evidence": { "segs": [40], "confidence": 0.75 } },
      { "text": { "en": "...", "yi": "..." }, "evidence": { "segs": [77, 80], "confidence": 0.7 } }
    ]
  },
  "sections": [
    { "recordingId": "y-tanya-1-02", "startSeg": 0, "endSeg": 33,
      "title": { "en": "What 'mamash' adds", "yi": "וואס \"ממש\" לייגט צו" },
      "summary": { "en": "The Mashgiach reads the opening of Tanya chapter two and asks what the word 'mamash' adds.", "yi": "דער משגיח לערנט דעם אנהייב פון תניא פרק ב און פרעגט וואס דאס ווארט \"ממש\" לייגט צו." },
      "kind": "intro", "catalogTopicIdx": [0], "subsections": [] },
    { "recordingId": "y-tanya-1-02", "startSeg": 34, "endSeg": 70,
      "title": { "en": "...", "yi": "..." }, "summary": { "en": "...", "yi": "..." },
      "kind": "main", "catalogTopicIdx": [1], "subsections": [] },
    { "recordingId": "y-tanya-1-02", "startSeg": 71, "endSeg": 95,
      "title": { "en": "...", "yi": "..." }, "summary": { "en": "...", "yi": "..." },
      "kind": "main", "catalogTopicIdx": [2], "subsections": [] }
  ],
  "sources": [
    { "heardAs": "היא חילק אלוקים מימעל ממיש", "work": "Tanya", "ref": "Tanya ch. 2", "sefariaRef": null,
      "resolution": "inferred", "mention": "quoted", "evidence": { "segs": [3, 4], "confidence": 0.8 } },
    { "heardAs": "דער זוהר הקדוש זאגט", "work": "Zohar", "ref": null, "sefariaRef": null,
      "resolution": "unresolved", "mention": "paraphrased", "evidence": { "segs": [51], "confidence": 0.7 } }
  ],
  "insights": [
    { "text": { "en": "...", "yi": "..." }, "evidence": { "segs": [20, 21], "confidence": 0.75 } },
    { "text": { "en": "...", "yi": "..." }, "evidence": { "segs": [52], "confidence": 0.7 } },
    { "text": { "en": "...", "yi": "..." }, "evidence": { "segs": [88], "confidence": 0.7 } }
  ],
  "stories": [],
  "questions": [
    { "question": { "en": "What does 'mamash' add?", "yi": "וואס לייגט \"ממש\" צו?" },
      "answer": { "en": "That the soul is never separate from its Source.", "yi": "אז די נשמה איז קיינמאל נישט אפגעטיילט פון איר מקור." },
      "questionSegs": [5], "answerSegs": [12, 14], "confidence": 0.8 }
  ],
  "takeaways": [],
  "candidateTopics": ["G-dly soul", "Tanya chapter 2", "bond of the soul to its source", "animal soul", "self-worth"],
  "concepts": [ { "he": "נפש השנית", "heardAs": ["Nefesh Hashanah"] } ],
  "people": [ { "name": "the Alter Rebbe", "heardAs": ["Alter Rebbe"] } ],
  "asrNotes": "Yiddish ASR fair; Tanya quotations badly garbled but recoverable from the perek. Segments 60-63 unintelligible."
}
```

## 8. Procedure

1. Read the header and the entire transcript.
2. Locate where each catalog topic starts; note stories, questions, sources and non-speech stretches as you go.
3. Cut the sections; measure each with the `mm:ss` stamps (≥ 3:00; subsections only in sections > 12:00, 2–4 of them, ≥ 1:30 each); check the count against `targets`.
4. Fill sources, then summary, key points, insights, stories, questions, takeaways, topics, concepts, people.
5. Self-check before writing the file:
   - [ ] each recording tiled from seg 0 to its last seg, no gaps or overlaps; all segs in range
   - [ ] section count within `targets`; every section ≥ 3:00; subsection rules
   - [ ] keyPoints 3–7, insights 3–7, questions ≤ 6, takeaways ≤ 5, candidateTopics 5–10
   - [ ] every evidence `segs` non-empty; `recordingId` on every evidence and question if > 1 recording
   - [ ] sources: `resolved` has `ref` + `sefariaRef`; `inferred` has `ref`; `unresolved` has both `null`
   - [ ] `[NOISE?]` stretches of 3:00+ are `noise`/`singing` sections; no claim rests on flagged garbage
   - [ ] abstract 80–150 words in English, 80–180 in Yiddish
   - [ ] every Localized has `en` and `yi`; `yi` in Hebrew script, Chassidish spelling per `yiddish-style.md` (no YIVO letters, no Daytshmerish, no calques); `en` has no Hebrew script
   - [ ] third person throughout; no psak, no own advice, no quotes from memory, no biography
   - [ ] `promptVersion` is `"p4-v3"`; no `writeup` field (the write-up is a separate pass)
   - [ ] nothing stated that you could not point to in the transcript
6. Write the JSON object, and only it, to the output path.
