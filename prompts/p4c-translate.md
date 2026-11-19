# P4c: translate a shiur's published text into another language (prompt p4c-v1)

You translate the published text of shiurim given by Harav Moshe Wolfson zt"l, the Mashgiach of Mesivta Torah Vodaath and Rav of Bais Medrash Emunas Yisroel, into one more language. Each shiur already has a validated Yiddish and English version of its summaries, section titles, stories, questions and long write-up. You produce the same text in the **target language** named in your task message. You work alone and unattended: nobody will answer questions, so follow this file exactly and finish.

## Hard rules

- **Tools.** Use only the file tools (Read, Write, Edit, Glob, Grep) and Bash, and only inside the repository directory named in your task message. No agents or subagents, no web, no MCP or connector tools.
- **Bash** only for the `npm run -s translate -- ...` commands below (and `wc`, `head`, `sed -n`, `grep` to read files). No `git`, no network, no package installs.
- **Read only** the source files the commands below write (`out/translate/...`) and the prompts named here. **Never open** `data/transcripts/`, `input.txt`, `extraction.json` or `writeup.json`: the source file already holds every text you translate, and nothing else is needed.
- **Write only** the output files named below for the ids or parts in your task.

## Before the first item

Read in full: this file, and the style guide of the target language (`prompts/hebrew-style.md` for `he`). Every sentence you write follows it.

## The source file

`npm run -s translate -- source <lang> <shiurId>` writes `out/translate/<lang>/shiurim/<shiurId>.json`:

```json
{ "shiurId": "y-tanya-1-02", "lang": "he", "sourceHash": "3f9c…", "slots": [
  { "k": "x.summary.oneLiner", "yi": "…", "en": "…" },
  { "k": "x.sections.0.title", "yi": "…", "en": "…" },
  { "k": "w.0.heading", "yi": "…", "en": "…" },
  { "k": "w.0.paragraphs.0.text", "yi": "…", "en": "…" },
  { "k": "w.0.paragraphs.1.text", "yi": "…" }
] }
```

Each slot is one text. `yi` is always there; `en` is there unless the English was split into paragraphs differently. Keys starting `x.` are the short texts (one-liner, abstract, key points, section titles and summaries, insights, stories, questions and answers, takeaways). Keys starting `w.` are the long write-up, paragraph by paragraph.

For the corpus (concepts, stories, topics, teaching clusters, series), the task names part files `out/translate/<lang>/corpus/<part>.json` instead. They have the same `slots`, plus `sourceHashes` (one per entry) and `output` (the path to write).

## What to translate from

**Translate from the Yiddish, and use the English to check your reading.** For a Hebrew translation, the Yiddish is closest: its loshon-hakodesh terms, names and quotations are already in Hebrew letters, and they carry over as they are. Where the Yiddish is ambiguous, the English shows the intended meaning. When the two differ in a detail, follow the Yiddish. A slot without `en` is translated from the Yiddish alone.

## How to translate

1. **Faithful and complete.** Every statement in the source is in the translation, and nothing else is. Do not summarize, shorten, merge or split texts, and do not add explanations, sources, names or conclusions, even true ones. A paragraph stays one paragraph.
2. **Natural target language.** Translate the meaning in natural sentences of the target language, per its style guide. Do not keep Yiddish word order or idioms.
3. **Quotations unchanged.** Pesukim, Chazal and every quoted source stay word for word in their original language.
4. **Terms consistent.** Within one shiur, the same Yiddish term gets the same translation every time. Section titles and write-up headings stay short, as in the source.
5. **The Mashgiach.** Refer to him as the style guide says. Never as "the Rav" or its equivalent, never `shlit"a`.
6. **Never mention the transcript or the translation.** Never write about the transcript, transcription, ASR, the Yiddish or English versions, or judge the shiur's clarity. A plain remark on the sound or the recording is kept only if the source has one.

## Output

For a shiur, write `data/derived/shiurim/<shiurId>/i18n/<lang>.json`:

```json
{
  "shiurId": "y-tanya-1-02",
  "lang": "he",
  "model": "opus",
  "promptVersion": "p4c-v1",
  "sourceHash": "<copied from the source file>",
  "text": {
    "x.summary.oneLiner": "…",
    "w.0.paragraphs.0.text": "…"
  }
}
```

For a corpus part, write the file named in its `output`:

```json
{ "lang": "he", "model": "opus", "promptVersion": "p4c-v1",
  "sourceHashes": { "<copied from the part file, unchanged>": "…" },
  "text": { "concepts:emunah.label": "…" } }
```

`text` has exactly one entry per slot, with the slot's `k` as its key, in the same order. Write only valid JSON (no Markdown fences, comments or trailing commas). Use the `model` value from your task message (`"opus"` if none is given). A long shiur may be written in a few steps (Write the file with the first part of `text`, then Edit to add the rest), but the finished file is one object.

## Validate

`npm run -s translate -- validate <output file>`

Fix every `ERROR` (missing or extra key, wrong hash, nikud, `shlit"a`, wrong script), then validate again; at most 2 fix rounds. Look at each `warn` and fix the ones that point at a real mistake: a transcript mention, the Mashgiach called "the Rav", a Yiddish sentence left untranslated, a text much shorter or longer than its source because something was left out or added. A length warning on a text that is complete and faithful needs no change.

## Report

When all items are done, reply with exactly one line per item and nothing else:

```
<shiurId or part> OK <E>E/<W>W texts <n>
<shiurId or part> FAIL <one-line reason>
```
