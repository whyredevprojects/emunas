# P4b: write up a shiur of Harav Moshe Wolfson (prompt p4b-v2)

You are writing the long-form write-up of one Torah shiur (class) given by Harav Moshe Wolfson zt"l, the Mashgiach of Mesivta Torah Vodaath and Rav of Bais Medrash Emunas Yisroel. The shiur is in Yiddish or English. You have four things: this file; the shiur's **input file** (catalog metadata and its machine transcript); its **extraction**, a JSON file another pass already produced and a validator already checked (the shiur's sections, summaries and sources); and its **word budget** per section (section 4). You produce one **JSON file**, a `Writeup`, in two languages.

The transcript itself will never be shown to the public. The write-up replaces it: a reader should be able to learn the shiur from it without listening, and each paragraph links to the place in the audio where it is said. It must be faithful to what the Mashgiach actually said, and it must never put words in his mouth.

**Output:** write ONLY valid JSON (no Markdown fences, no comments, no trailing commas, nothing before or after the object) to the output path given in your task message. Use the `model`, `variant` and `extractionVariant` values given in the task message. If none are given, use `"model": "unknown"`, `"variant": "raw"`, and for `extractionVariant` the extraction's file name without `.json` (for `data/derived/shiurim/x/extraction.json` that is `"extraction"`). Always set `"promptVersion": "p4b-v2"` (this prompt's version). Do not write any other files.

Also read **`prompts/yiddish-style.md`** (spelling, vocabulary and syntax for every Yiddish sentence) before you write.

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
- Each transcript line is `[recordingId:idx|mm:ss] text`. `idx` is the **segment index within that recording**, starting at 0 for every recording. `mm:ss` is the segment's start time.
- A shiur may have more than one recording (two cassette sides, several tracks), listed in playback order.
- **`targets`**: the write-up range there is for the whole audio; your binding length is the per-section **word budget** (section 4). Ignore the section count; the sections are already fixed by the extraction.
- **`[NOISE?]`** after a line's prefix means code flagged the segment as likely ASR noise (long silence or singing with little text, a word repeated over and over, a repeated line, filler). Write nothing from flagged garbage and don't cite flagged segments as `evidence`, unless the line is clearly coherent speech that fits its context.
- You only ever output **segment indices**, never times.

## 2. The extraction is the frame. Don't redo it, don't contradict it

The extraction JSON has, among other fields:

- `sections[]`: `{ recordingId, startSeg, endSeg, title: {en, yi}, summary: {en, yi}, kind, catalogTopicIdx, subsections }`. They tile the recordings in order. `kind` is one of `intro`, `main`, `story`, `tangent`, `closing`, `brachah`, `singing`, `other_speaker`, `noise`.
- `sources[]`: `{ heardAs, work, ref, sefariaRef, resolution, mention, evidence }`: every source the Mashgiach cites, already identified.
- `summary`, `insights`, `stories`, `questions`, `takeaways`: useful for orientation.

Rules:

1. **Do not re-section.** Your blocks map one-to-one onto the extraction's sections by `sectionIndex` (the 0-based index into `sections[]`). Don't merge, split, reorder or move boundaries. A paragraph about section *i* is supported by segments in section *i*.
2. **Do not contradict the extraction.** The extraction's section summaries, source identifications and stories are the agreed reading of the shiur. Your job is to write it out at length from the transcript, with more detail and the logical connections. If, reading the transcript, you think the extraction got something wrong, do not write the opposite: leave that point out of the write-up.
3. **Sources only from `sources[]`.** When a paragraph names a source, it must be one of the extraction's `sources[]`, and its index goes in that paragraph's `sourceIdx`. If the Mashgiach cites something that is not in `sources[]`, describe the idea without naming the source. Use the extraction's identification (`work`, `ref`) for the name; don't re-identify it.
4. **The transcript is your source for content.** The extraction is short; the detail of the write-up comes from reading the section's segments yourself. Read the whole transcript, then each section's stretch again as you write its block.

## 3. The transcript is bad. Recover meaning, don't invent it

The ASR is budget-quality Whisper. Yiddish comes out in Hebrew script with heavy errors; Hebrew and Aramaic quotations (pesukim, Chazal, Zohar, Tanya) are the worst. English shiurim come out in Latin script, with Hebrew terms mangled phonetically. Real examples from this corpus:

| ASR heard | Intended |
|---|---|
| "Rabbi Yisraelim" (English); "רבינו שלום" (Yiddish) | רבונו של עולם, Ribono shel Olam |
| "Nefesh Hashanah" | נפש השנית, nefesh haSheniyah (the second soul, Tanya) |
| "hi chilek alakam yema ul-mamish" | היא חלק אלוק ממעל ממש, "hi chelek Eloka mima'al mamash" (Tanya ch. 2) |
| "נחס" | נח, Noach |
| "רש''ה ברענגט" | רש"י ברענגט, Rashi brings |

- Use context (catalog title, parsha, perek, the extraction's `concepts`, `people` and `sources`, and the surrounding words) to recover garbled terms.
- **When you cannot recover a stretch with reasonable confidence, leave it out.** Do not guess a name, a number, a story detail or a chiddush. A shorter honest write-up beats a fuller invented one.
- **Never fill in from your own knowledge** what the Mashgiach "probably" said. Your knowledge may help you *recognize* a garbled term; it may never *supply content* that is not audible in the transcript. Every sentence must be traceable to the segments in its paragraph's evidence.
- Repeated identical lines and generic phrases ("תודה רבה", "Thank you for watching") over silence or singing are hallucinations, not speech.
- **Never mention the transcript, and never judge the shiur's clarity.** Every sentence says what the Mashgiach teaches or relates. Saying a stretch is "garbled" or "unclear" reads as if *he* spoke that way, which is untrue and disrespectful. Never mention the transcript, transcription or ASR ("the transcript did not capture", "heard as X"), and never judge the shiur or his words ("In a badly garbled stretch, the Mashgiach…", "though most of this is hard to follow", "his words are unclear", `דער חלק איז צעמישט`, `דער שיעור איז נישט קלאר`). A plain, factual remark about the sound or the recording is allowed when useful ("the sound is poor here", "the recording cuts off"; `די אויפנאמע ברעכט זיך איבער`), never about him. Where part of a stretch can't be recovered, write what can be as a plain statement. Content uses are fine, judged by meaning ("cuts off from Hashem", "confusion of the mind"). Headings follow the same rule. Transcript notes belong only in the extraction's `asrNotes`.

## 4. What to write

Two arrays, `en` and `yi`, each a list of blocks: `{ "sectionIndex": <index into the extraction's sections[]>, "heading": <string or null>, "paragraphs": [...] }`.

**Which sections get a block.** One block per section, in section order, for every section **except** `singing`, `other_speaker` and `noise` (never write a block for those). Every `main` section must have a block in each language. `intro`, `story`, `tangent` and `closing` sections get a block when they have content; a short `brachah` may be skipped. `sectionIndex` values strictly increase. `en` and `yi` have the same blocks.

**Length: the word budget.** The target is **about 900 words per hour of content audio per language** (allowed range 800–1000 per hour), allocated to the sections by duration. Your task message gives the budget table (the output of `npm run -s writeup:budget -- <shiurId>`): a total and a number of words per section, per language; sections marked "no block" get none. If you have no table, compute it: 900 × (section minutes ÷ 60) words for each content section (a `brachah` counts half, at least 40 words per block).

- **Plan before you write.** Before drafting, write down (for yourself, not in the file) each block's budget and the 2–5 steps of the argument it will cover. Then write each block to its budget, counting as you go.
- Each block should land within about ±25% of its budget. You may shift up to ~30% of the words between sections where the content is denser or thinner than the time suggests, but **the total per language must stay within the budget's range**. The validator flags blocks far over budget and fails a write-up above 1.5× the range's maximum or below half its minimum.
- Earlier drafts by this model ran 1.5–3× over target. Expect that tendency and correct for it while writing, not afterwards: prefer one precise sentence over two that restate.
- Yiddish length similar to English. **Do not pad.** If the ASR leaves a section thin, write less than its budget; never fill with general Torah thoughts, restatements or praise.

**Follow the argument.** Write the shiur as the Mashgiach builds it: the question → the sources he brings → his chiddush → the story → the application. Keep his order. Make the logical links explicit ("To answer this, the Mashgiach brings…", "From here he explains…", "This explains the question he opened with…"). A reader should see why each step follows. A list of disconnected statements is a bad write-up even if each statement is true.

**Paragraphs.** 2–5 sentences each, usually 1–3 per block. Each paragraph has:

- `text`: the paragraph, in third-person reported speech (section 5).
- `sourceIdx`: indices into the extraction's `sources[]` of every source the paragraph names (`[]` if none). Every source named must be listed; every listed source must be named.
- `evidence`: `{ "segs": [...], "confidence": 0..1 }`. `segs`: 1–6 segment indices **inside this block's section** (a couple of segments past its edges at most) where the Mashgiach says what the paragraph reports; the most direct ones, not a whole range. `confidence`: 0.9+ clear speech and meaning; 0.7–0.85 meaning clear from context despite garbling; 0.6–0.7 plausible reconstruction; below 0.6, leave the paragraph out. **Multi-recording shiurim** (more than one recording in the header): segment indices restart at 0 in each recording, so every `evidence` must also carry `"recordingId": "<the section's recordingId>"`. In a single-recording shiur omit `recordingId`.

**Heading.** The section's title in that language (from the extraction) or a short variant of it, or `null`.

## 5. Language rules

1. **Write each language from the shiur itself.** Write the Yiddish from the transcript and the English from the transcript. Do not write one and translate it into the other. Each should read as if a native writer of that language wrote up the shiur. They must agree in content, but sentence structure, idiom and emphasis are each language's own.
2. **Yiddish**: natural Chassidish Yiddish; follow **`prompts/yiddish-style.md`** exactly: Chassidish orthography as in *Der Yid* / *Der Blatt* (`נישט`, `וואס`, `וואו`, `אזוי`, `פארוואס`, `ווייל`, `אידן`), **no YIVO spelling, no nikud, no dotted or ligature letters** (`וווּ`, `אַ`, `פֿ`, `ײ` are all wrong), no Daytshmerish (`וועלכער` as "which", `עטוואס`, `ווירקליך`, `בעזאנדערס`), no English calques (`נעמט פלאץ`, `מאכט זינען`, `אין סדר צו`) and no English words in Hebrew letters (`רעקארדינג`). Hebrew and Aramaic words keep their **loshon-hakodesh spelling** (`שבת`, `אמונה`, `תפילה`, `צדיק`, `רבונו של עולם`, `נפש השנית`, `חז"ל`, `רש"י`), not phonetic Yiddish spellings (`שאבעס`, `צאדיק`). Essentially all Hebrew script; at most an occasional unavoidable Latin name.
3. **English**: plain, clear English for a frum reader. Hebrew terms transliterated the Ashkenazi/Chassidish way (Shabbos, Hashem, Ribono shel Olam, emunah, bitachon, tzaddik, Chazal, Rashi, the Ba'al Shem Tov), with a short gloss the first time if the term is not common. **No Hebrew script in `en`.** Use "Hashem" or "G-d".
4. **Third-person reported speech, always.** English: "The Mashgiach explains…", "He asks…", "He brings the Zohar…". Yiddish: "דער משגיח ערקלערט…", "ער פרעגט…", "ער ברענגט דעם זוהר…". Never first person as the Mashgiach ("I want to tell you…", "מיר דארפן…"), never direct quotes of his words, never second-person preaching to the reader ("You must…", "מען דארף…" in the writer's own voice). If he says "one must…", write "The Mashgiach says one must…".
5. **No psak.** Do not state halachic rulings; describe what he explains.
6. **No advice he didn't give.** No moral lessons, applications or encouragement of your own.
7. **No source text from memory.** Cite sources by name and ref only. Do not quote a passuk, Gemara, Zohar or Tanya passage beyond the few words the Mashgiach himself is clearly heard discussing, and never complete or correct a quote from memory.
8. **No biography, no dates, no occasions** beyond what the header gives or the Mashgiach says. No claims about the Mashgiach's life, teachers or influence.
9. Refer to him as "the Mashgiach" in English and "דער משגיח" in Yiddish. Spell "Moshiach" (not "Mashiach") in English.
10. **No mention of the transcript or ASR, and no judgment of the shiur's clarity**, in either language (section 3). Yiddish too: no `צעמישט`, `נישט קלאר`, `טראנסקריפט` about the shiur. Factual sound/recording remarks are allowed.

## 6. Exact output shape

TypeScript contract (the validator checks every field; no extra fields allowed):

```ts
interface Evidence { segs: number[]; confidence: number; recordingId?: string } // recordingId: required if >1 recording
interface WriteupBlock {
  sectionIndex: number;            // index into the extraction's sections[]
  heading: string | null;
  paragraphs: { text: string; sourceIdx: number[]; evidence: Evidence }[];
}
interface Writeup {
  shiurId: string;                 // the SHIUR id from the header
  model: string; variant: string;
  promptVersion: "p4b-v2";
  extractionVariant: string;       // file name of the extraction, without .json
  en: WriteupBlock[];
  yi: WriteupBlock[];
}
```

Shape example for a hypothetical single-recording 20-minute shiur whose extraction has three sections (0..33, 34..70, 71..95) and one source. Content shortened and illustrative only; your content comes from your transcript.

```json
{
  "shiurId": "y-tanya-1-02",
  "model": "opus",
  "variant": "raw",
  "promptVersion": "p4b-v2",
  "extractionVariant": "extraction",
  "en": [
    { "sectionIndex": 0, "heading": "What 'mamash' adds",
      "paragraphs": [
        { "text": "The Mashgiach opens with the Tanya's words in chapter two, that the soul of a Jew is 'truly a part of G-d above', and asks what the word 'mamash' adds. A part of something, he points out, can also mean a creation that came from it and now stands on its own.", "sourceIdx": [0], "evidence": { "segs": [3, 4, 9], "confidence": 0.8 } },
        { "text": "He answers that the soul never stands on its own. Like a child's mind that comes from the father's mind, it stays bound to its Source, and this is what 'mamash' teaches.", "sourceIdx": [0], "evidence": { "segs": [12, 14], "confidence": 0.75 } }
      ] },
    { "sectionIndex": 1, "heading": null, "paragraphs": [ { "text": "...", "sourceIdx": [], "evidence": { "segs": [40, 45], "confidence": 0.75 } } ] },
    { "sectionIndex": 2, "heading": null, "paragraphs": [ { "text": "...", "sourceIdx": [], "evidence": { "segs": [77, 80], "confidence": 0.7 } } ] }
  ],
  "yi": [
    { "sectionIndex": 0, "heading": "וואס \"ממש\" לייגט צו",
      "paragraphs": [
        { "text": "דער משגיח עפנט מיט די ווערטער פונעם תניא אין פרק ב, אז די נשמה פון א איד איז \"חלק אלוק ממעל ממש\", און ער פרעגט וואס דאס ווארט \"ממש\" קומט צולייגן. א חלק פון עפעס, זאגט ער, קען אויך מיינען א באשעפעניש וואס איז ארויסגעקומען דערפון און שטייט שוין פאר זיך.", "sourceIdx": [0], "evidence": { "segs": [3, 4, 9], "confidence": 0.8 } },
        { "text": "ער ענטפערט אז די נשמה שטייט קיינמאל נישט פאר זיך. אזוי ווי דער שכל פון א קינד וואס קומט פונעם שכל פונעם טאטן, בלייבט זי צוגעבינדן צו איר מקור, און דאס איז וואס דאס ווארט \"ממש\" לערנט.", "sourceIdx": [0], "evidence": { "segs": [12, 14], "confidence": 0.75 } }
      ] },
    { "sectionIndex": 1, "heading": null, "paragraphs": [ { "text": "...", "sourceIdx": [], "evidence": { "segs": [40, 45], "confidence": 0.75 } } ] },
    { "sectionIndex": 2, "heading": null, "paragraphs": [ { "text": "...", "sourceIdx": [], "evidence": { "segs": [77, 80], "confidence": 0.7 } } ] }
  ]
}
```

## 7. Procedure

1. Read the header, then the extraction (sections, sources, summary), the word budget, then the entire transcript.
2. For each section that gets a block: re-read its stretch of the transcript; note the steps of the argument, the sources (find their indices in `sources[]`), any story, and what you cannot recover.
3. Plan: for each block, its word budget (shifted by at most ~30% where density differs) and the steps it covers. Check the planned total is within the budget's range.
4. Write the Yiddish blocks from the transcript. Write the English blocks from the transcript. (Either order; never one as a translation of the other.)
5. Self-check before writing the file:
   - [ ] `shiurId` matches the header; `extractionVariant` names the extraction file; `promptVersion` is `"p4b-v2"`
   - [ ] one block per section except singing/other_speaker/noise; every `main` section has a block in both languages; `sectionIndex` strictly increasing; same blocks in `en` and `yi`
   - [ ] every paragraph's `segs` non-empty and inside its section; `recordingId` on every evidence if > 1 recording
   - [ ] every named source is in the extraction's `sources[]` and listed in `sourceIdx`; every `sourceIdx` valid
   - [ ] nothing that contradicts the extraction's sections, summaries or source identifications
   - [ ] each block near its budget (±25%); total per language within the budget's range; no padding
   - [ ] no content or evidence from `[NOISE?]` garbage
   - [ ] `yi` natural Chassidish Yiddish per `yiddish-style.md` (no YIVO letters, no Daytshmerish, no calques), loshon-hakodesh spelling for Hebrew words; `en` without Hebrew script
   - [ ] third person throughout; no psak, no own advice, no quotes from memory, no biography
   - [ ] no sentence or heading mentions the transcript/ASR or calls the shiur or his words garbled/unclear (sound/recording remarks are allowed)
   - [ ] every sentence traceable to the transcript
6. Write the JSON object, and only it, to the output path.
