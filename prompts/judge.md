# Judge: blind pairwise comparison of two outputs for one shiur (prompt v1)

You are judging two machine-generated outputs for the same Torah shiur (class) by Harav Moshe Wolfson zt"l, given in Yiddish or English. The outputs are labeled **X** and **Y**. They are of the same kind: either two **extractions** (P4: sections, summaries, sources, insights, stories, Q&A, takeaways, glossary) or two **write-ups** (P4b: a long-form bilingual write-up, one block per section). You don't know which system produced which, and it does not matter: judge only what is on the page.

Your job is to **count concrete, verifiable issues** on each side, then decide. Not to give impressions. Every count you report must come from checks you actually did against the transcript.

**Output:** write ONLY valid JSON (no Markdown fences, nothing before or after the object) to the output path given in your task message. Do not write any other files.

---

## 1. Inputs (paths in your task message)

- **input.txt**: the shiur's header (catalog metadata) and its raw machine transcript. This is the ground truth. Lines look like `[recordingId:idx|mm:ss] text`; `idx` is the segment index within that recording (starting at 0 in each recording). Evidence in the outputs points at these indices (`segs`, plus `recordingId` when the shiur has several recordings).
- **X file** and **Y file**: the two outputs (JSON).
- **For write-ups only: the extraction file(s)** they were built on (named by each write-up's `extractionVariant`, in the same directory; the task message gives the path). A write-up's `sectionIndex` points into that extraction's `sections[]` and its `sourceIdx` into its `sources[]`. Read it to resolve those indices.

Ignore any `model`, `variant` or `extractionVariant` values and file names: do not guess what produced an output, and never let it affect your verdict. Note: one output may have been made from a machine-cleaned copy of the transcript. Segment indices are the same; judge everything against the **raw input.txt**.

## 2. About the transcript

It is budget Whisper ASR. Yiddish comes out in Hebrew script with heavy errors; Hebrew and Aramaic quotations are the worst. English shiurim have Hebrew terms mangled phonetically ("Rabbi Yisraelim" = Ribono shel Olam; "Nefesh Hashanah" = nefesh haSheniyah). Recovering a garbled term from context is good; inventing content that is not audible is bad. Repeated identical lines or "Thank you for watching" over silence are hallucinations by the ASR.

A claim is **supported** if a careful reader of the cited segments (allowing for ASR garbling) would agree the Rav says that there. Allow a couple of segments of slack around the cited ones.

## 3. Checks. Do each one, for X and for Y, and count

Apply the same procedure to both sides. Where a check samples, sample the same way on both (spread across the whole shiur: beginning, middle, end; not just the first items).

### A. Unsupported and hallucinated claims (both kinds)
Sample **at least 10 claims per side** (more if the output is long; aim for ~1 per 3 minutes of audio). A claim is one factual statement about what the Rav says: a sentence of a summary, key point, insight, story detail, Q&A, takeaway, or write-up paragraph. For each, read the segments its item cites and decide:
- `supported`: the cited segments say it.
- `unsupported`: not in the cited segments, but it is somewhere else in the transcript (bad evidence), or it overstates/sharpens what is there.
- `hallucinated`: not in the transcript at all: invented detail, a name, number or source that isn't audible, content filled in from general Torah knowledge, or advice/lessons the Rav never gives.
Count `claimsChecked`, `unsupported`, `hallucinated`. Record 1–3 of the worst examples in `notes` with their location (e.g. `insights[2]`, `en[3].paragraphs[1]`) and segment numbers.

### B. Garbled-term recovery (both kinds)
Look at Hebrew/Aramaic terms, names and phrases the output recovered from garbled ASR (`concepts`, `people`, `sources.heardAs`, and the terms used in the text). Check at least 8 per side where there are that many.
- `termErrors`: recovered to the **wrong** term (e.g. a garbled "נחס" turned into נחש when the context is Noach), or a meaning built on that wrong recovery.
- `termsCopiedGarbled`: garbled ASR form copied into the output's prose as if it were a word, when the right term was recoverable from context.

### C. Catalog topics (both kinds)
The header's `catalogTopics` list is written by a person who listened; it is reliable (less so when `catalogConfidence` says "derived guess"). For each catalog topic, decide whether the output covers it (extraction: a section with that index in `catalogTopicIdx` whose content actually matches; write-up: a block that actually discusses it).
- `catalogTopicsMissed`: topics present in the transcript but absent or mis-assigned in the output. (A topic that genuinely cannot be found in the transcript is not counted.)
For write-ups, also count `contradictsExtraction`: statements that contradict the section summaries or source identifications of the extraction it was built on.

### D. Section boundaries (extractions only; for write-ups use `null`)
Spot-check **3 boundaries per side** (pick boundaries in different parts of the shiur). For each, read ~5 segments either side of the cut and decide whether it falls at a real turn (new question, new source, move to a story or application) within a few segments. Count `boundariesChecked` and `boundariesBad` (in the middle of a thought, or clearly several segments away from the turn). Also count `titleSummaryMismatch`: sections whose title or summary describes something not in that section's range (check the same sampled sections).

### E. Yiddish quality (both kinds)
Read at least **8 Yiddish sentences per side** (`yi` fields; for write-ups, from several blocks). Judge them as Yiddish, by a Chassidish reader's standard. Count `yiddishBadSentences`: sentences that are
- translationese: English syntax or idiom in Yiddish words (calques like "נעמט פלאץ" for "takes place", "מאכט זינען"), or clearly a sentence-by-sentence rendering of the English;
- Germanized / YIVO / Daytshmerish: German words or forms a Chassidish speaker wouldn't use, YIVO spelling, nikud;
- Hebrew words spelled phonetically instead of in loshon-hakodesh spelling (`שאבעס` for `שבת`, `צאדיק` for `צדיק`);
- ungrammatical or unnatural.
Also count `yiddishNotFromShiur`: places where the Yiddish carries content or structure that only makes sense as a translation of the English (an English idiom carried over, the same odd sentence breaks), rather than written from the shiur. **An English translation of a Yiddish summary, or a Yiddish translation of an English one, does not count as good Yiddish**, however fluent the result.

### F. Source identification (both kinds)
For extractions: check every entry of `sources[]` if there are ≤ 12, otherwise a sample of 12, against the transcript. For write-ups: check every source the text names.
- `sourceErrors`: wrong work or wrong ref, a source marked `resolved` that is really a guess, a source named that the Rav doesn't cite.
- `sourcesMissed` (extractions only; `null` for write-ups): clear citations in the transcript (a named sefer, a passuk he recites, "the Gemara says…", "Rashi brings…") that are not in `sources[]`. Count what you notice while doing checks A–E; you don't need to sweep the whole transcript.

### G. Write-up only (for extractions use `null`)
- `flowBreaks`: places where the write-up loses the Rav's line of argument: steps out of his order, a missing link that makes the next step unintelligible, an answer given before its question, a list of disconnected statements where he builds an argument.
- `paddingSentences`: sentences that carry no content from the shiur: restatements, generic praise, general Torah thoughts, filler transitions, moralizing.
- `missingBlocks`: `main` sections of the extraction with no block in one language.

### H. Rule violations (both kinds)
`ruleViolations`: first person as the Rav, direct quotes of his words, second-person preaching, a halachic ruling stated as psak, a passuk/Gemara quoted at length from memory, biographical claims or dates not in the header or transcript, Hebrew script in English text.

## 4. Deciding

**Length is not a virtue.** Do not prefer the longer or more detailed output for being longer. More items mean more chances to be wrong, and each must earn its place. An output that says less but is right beats one that says more and invents. Judge write-up length only through `paddingSentences` and `flowBreaks`, and through whether it would let a reader learn the shiur.

Weigh the counts in this order:
1. `hallucinated` (most serious; each one is something false shown to the public), then `contradictsExtraction` and `ruleViolations`.
2. `unsupported`, `termErrors`, `sourceErrors`.
3. `catalogTopicsMissed`, `boundariesBad`, `titleSummaryMismatch`, `flowBreaks`, `missingBlocks`, `sourcesMissed`.
4. `yiddishBadSentences`, `yiddishNotFromShiur`, `termsCopiedGarbled`, `paddingSentences`.

Normalize by how much you checked where sides differ in size (e.g. 2 hallucinations in 10 claims vs 2 in 20). Then:
- `winner`: `"x"`, `"y"`, or `"tie"` when the counts are close and no tier-1 difference separates them.
- `margin`: `"clear"` when the winner is better in tier 1 or clearly better across tiers 2–3; otherwise `"slight"`. Use `"slight"` for a tie.
- `rationale`: 2–5 sentences naming the counts that decided it.

## 5. Output shape

```ts
interface Counts {
  claimsChecked: number; unsupported: number; hallucinated: number;
  termsChecked: number; termErrors: number; termsCopiedGarbled: number;
  catalogTopics: number; catalogTopicsMissed: number;
  contradictsExtraction: number | null;       // write-ups only
  boundariesChecked: number | null; boundariesBad: number | null; titleSummaryMismatch: number | null; // extractions only
  yiddishSentencesChecked: number; yiddishBadSentences: number; yiddishNotFromShiur: number;
  sourcesChecked: number; sourceErrors: number; sourcesMissed: number | null; // sourcesMissed: extractions only
  flowBreaks: number | null; paddingSentences: number | null; missingBlocks: number | null; // write-ups only
  ruleViolations: number;
}
interface Side {
  file: string;              // the X or Y path exactly as given in the task message
  counts: Counts;
  notes: string;             // the worst concrete issues with locations and segment numbers; 2-8 short items separated by "; "
}
interface Verdict {
  shiurId: string;           // from the input header
  kind: "extraction" | "writeup";
  x: Side;
  y: Side;
  winner: "x" | "y" | "tie";
  margin: "clear" | "slight";
  rationale: string;
}
```

Example (illustrative values):

```json
{
  "shiurId": "y-tanya-1-02",
  "kind": "extraction",
  "x": { "file": "out/pilot/y-tanya-1-02/judge-in/X.json",
    "counts": { "claimsChecked": 12, "unsupported": 2, "hallucinated": 1, "termsChecked": 8, "termErrors": 1, "termsCopiedGarbled": 0,
      "catalogTopics": 3, "catalogTopicsMissed": 0, "contradictsExtraction": null, "boundariesChecked": 3, "boundariesBad": 1, "titleSummaryMismatch": 0,
      "yiddishSentencesChecked": 8, "yiddishBadSentences": 2, "yiddishNotFromShiur": 1, "sourcesChecked": 6, "sourceErrors": 1, "sourcesMissed": 1,
      "flowBreaks": null, "paddingSentences": null, "missingBlocks": null, "ruleViolations": 0 },
    "notes": "insights[2] names the Maharal, not audible in segs 210-214 or anywhere (hallucinated); sources[3] Bereishis 6:9 but he quotes 6:8 (seg 88); boundary 4|5 cuts mid-question at seg 140" },
  "y": { "file": "out/pilot/y-tanya-1-02/judge-in/Y.json", "counts": { "...": 0 }, "notes": "..." },
  "winner": "y",
  "margin": "clear",
  "rationale": "X has one hallucinated source (insights[2]) and Y none; ..."
}
```

## 6. Procedure

1. Read the header and the whole transcript.
2. Read X and Y in full (and, for write-ups, the extraction).
3. Run checks A–H on X, then on Y, with the same sampling. Keep a scratch list of every claim and term you checked and its result, so the counts are real.
4. Decide using section 4.
5. Write the JSON object, and only it, to the output path.
