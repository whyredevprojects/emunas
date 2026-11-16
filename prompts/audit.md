# Audit: blind spot-check of one finished shiur (prompt audit-v1)

You are auditing the machine-generated record of one Torah shiur (class) by Harav Moshe Wolfson zt"l, given in Yiddish or English: its **extraction** (sections, summaries, sources, insights, stories, Q&A, takeaways, glossary) and its **write-up** (a long-form bilingual write-up, one block per section). Nothing is compared: you audit this one output against its transcript. Your job is to **count concrete, verifiable issues**, not to give impressions. Every count must come from checks you actually did against the transcript.

**Output:** write ONLY valid JSON (no Markdown fences, nothing before or after the object) to `data/derived/audits/<shiurId>.json`. Write no other file. Use only file tools and Bash inside the repository; no git, no other tools.

## 1. Inputs

`D = data/derived/shiurim/<shiurId>`:
- `D/input.txt`: header (catalog metadata) and the raw machine transcript: the ground truth. Lines are `[recordingId:idx|mm:ss] text`; `[NOISE?]` after the prefix marks segments code flagged as likely ASR noise.
- `D/extraction.json` and `D/writeup.json`: the outputs. The write-up's `sectionIndex` points into the extraction's `sections[]`, its `sourceIdx` into `sources[]`. Evidence `segs` (plus `recordingId` for multi-recording shiurim) point at transcript lines.
- `prompts/yiddish-style.md`: the Yiddish standard (read it).

Ignore `model` and `promptVersion` fields: judge only what is on the page.

## 2. About the transcript

Budget Whisper ASR. Yiddish in Hebrew script with heavy errors; Hebrew/Aramaic quotations worst. English shiurim have Hebrew terms mangled phonetically ("Rabbi Yisraelim" = Ribono shel Olam). Recovering a garbled term from context is good; inventing content that is not audible is bad. A claim is **supported** if a careful reader of the cited segments (allowing for ASR garbling, and a couple of segments of slack) would agree the Mashgiach says that there.

## 3. Checks (sample across the whole shiur: beginning, middle, end)

**A. Claims.** Sample at least **12 claims** (about one per 3 minutes of audio, at most 30), mixed from the extraction (summaries, key points, insights, story details, Q&A, takeaways) and the write-up (paragraph sentences, both languages). For each read the cited segments: `supported`, `unsupported` (not in the cited segments but elsewhere, or overstated), or `hallucinated` (not in the transcript at all: invented detail, name, number or source; general Torah knowledge filled in; advice he never gives). Count `claimsChecked`, `unsupported`, `hallucinated`.

**B. Sources.** Check every `sources[]` entry if ≤ 12, else a sample of 12: `sourceErrors` = wrong work or ref, `resolved` that is really a guess, a source he doesn't cite. `sourcesMissed`: clear citations you noticed while checking that are not in `sources[]`. Also count write-up paragraphs that name a source not in their `sourceIdx` or not in `sources[]` as `sourceErrors`.

**C. Section boundaries.** Spot-check **4 boundaries** (different parts of the shiur). Read ~5 segments either side: is the cut at a real turn (new question, new source, story, application) within a few segments? Count `boundariesChecked`, `boundariesBad`. Also `noiseMishandled`: flagged or obvious noise stretches ≥ 3:00 not given a `noise`/`singing` section, or content built on noise lines.

**D. Terms.** Check at least 8 recovered Hebrew/Aramaic terms and names: `termErrors` (recovered to the wrong term), `termsCopiedGarbled` (garbled ASR form used in prose when the right term was recoverable).

**E. Yiddish quality.** Read at least **10 Yiddish sentences** (extraction and write-up, several sections). Count `yiddishBadSentences`: YIVO spelling, nikud or dotted/ligature letters (`וווּ`, `אַ`, `פֿ`, `ײ`), `ניט` for `נישט`; Daytshmerish (`וועלכער` as "which", `עטוואס`, `ווירקליך`); English calques (`נעמט פלאץ`, `מאכט זינען`) or English words in Hebrew letters; phonetic spelling of loshon-hakodesh words; ungrammatical or unnatural. Also `yiddishTranslationese`: sentences that only make sense as a rendering of the English.

**F. Write-up.** `flowBreaks` (steps out of the Mashgiach's order, missing links, answer before its question, a list where he builds an argument); `paddingSentences` (restatement, generic praise, filler, moralizing); `contradictsExtraction`.

**G. Rules.** `ruleViolations`: first person as the Mashgiach, direct quotes of his words, second-person preaching, psak, long quotes from memory, biography or dates not in header/transcript, Hebrew script in English text.

## 4. Verdict

- `severity`: `"ok"` (no hallucination, at most 1 unsupported claim per 10 checked, no rule violation), `"minor"` (some tier-2 issues: unsupported claims, term or source errors, a bad boundary, several bad Yiddish sentences), or `"serious"` (any hallucination shown to the public, a contradiction, a rule violation, or a pattern of errors a reader would notice).
- `needsReview`: `true` when severity is `"serious"`.
- `notes`: the worst concrete issues with locations (`insights[2]`, `writeup.yi[3].paragraphs[1]`) and segment numbers; 2–8 short items separated by "; ".

## 5. Output shape

```ts
interface Audit {
  shiurId: string;
  promptVersion: "audit-v1";
  auditedAt: string;                 // ISO date-time
  counts: {
    claimsChecked: number; unsupported: number; hallucinated: number;
    sourcesChecked: number; sourceErrors: number; sourcesMissed: number;
    boundariesChecked: number; boundariesBad: number; noiseMishandled: number;
    termsChecked: number; termErrors: number; termsCopiedGarbled: number;
    yiddishSentencesChecked: number; yiddishBadSentences: number; yiddishTranslationese: number;
    flowBreaks: number; paddingSentences: number; contradictsExtraction: number;
    ruleViolations: number;
  };
  severity: "ok" | "minor" | "serious";
  needsReview: boolean;
  notes: string;
}
```

## 6. Procedure

1. Read `prompts/yiddish-style.md`, the header and the whole transcript.
2. Read `D/extraction.json` and `D/writeup.json` in full.
3. Run checks A–G, keeping a scratch list of every item checked and its result so the counts are real.
4. Decide severity, write the JSON to `data/derived/audits/<shiurId>.json`, and reply with one line: `<shiurId> <severity> <hallucinated>H <unsupported>U/<claimsChecked> yiBad <n>/<checked>`.
